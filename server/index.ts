import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { registerChallengerAuth } from "./auth-challenger";
import { registerChallongeAuth } from "./auth-challonge";
import fs from "fs";
import path from "path";

const app = express();
// Hide Express signature
app.disable('x-powered-by');

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

function serveStatic(app: express.Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

// Trust proxy for Replit's infrastructure and Cloudflare/Coolify
// Using a higher number to trust standard reverse proxy chains (Cloudflare -> Ingress -> App)
app.set('trust proxy', 5);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// Security headers middleware
app.use((req, res, next) => {
  // Prevent clickjacking attacks
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Transport Security (HSTS) - only in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Content Security Policy
  // Allow Google reCAPTCHA Enterprise resources
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // reCAPTCHA v3/Enterprise uses google.com and gstatic.com
      // Google Analytics & Cloudflare
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google.com https://www.gstatic.com https://static.cloudflareinsights.com https://pagead2.googlesyndication.com https://adservice.google.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google https://*.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: ",
      "font-src 'self' data: https://fonts.gstatic.com",
      (() => {
        let origins = [
          "'self'",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://*.gstatic.com",
          "https://pagead2.googlesyndication.com",
          "https://adservice.google.com",
          "https://fundingchoicesmessages.google.com",
          "https://ep1.adtrafficquality.google",
          "https://*.google-analytics.com",
          "https://*.doubleclick.net",
        ];
        const candidate = process.env.PUBLIC_MINIO_URL || process.env.VITE_PUBLIC_MINIO_URL || '';
        try {
          if (candidate) origins.push(new URL(candidate).origin);
        } catch { }
        return `connect-src ${origins.join(' ')}`;
      })(),
      // invisible v3 may create iframes
      "frame-src 'self' https://www.google.com https://www.gstatic.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.adtrafficquality.google https://*.google.com",
      // tighten embedding and object usage
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join('; ')
  );

  next();
});

app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  const mask = (input: any): any => {
    if (input === null || input === undefined) return input;
    if (typeof input !== 'object') return input;
    if (Array.isArray(input)) return input.map((v) => mask(v));
    const redactedKeys = new Set(['password', 'password_hash', 'verification_token']);
    const masked: Record<string, any> = {};
    for (const [k, v] of Object.entries(input)) {
      if (redactedKeys.has(k)) {
        masked[k] = '[redacted]';
      } else if (k === 'email' && typeof v === 'string') {
        const [local, domain] = String(v).split('@');
        const safeLocal = local ? (local.length <= 2 ? local[0] + '*' : local.slice(0, 2) + '*'.repeat(Math.max(1, local.length - 2))) : '';
        masked[k] = `${safeLocal}@${domain || ''}`;
      } else if (k === 'photoURL' && typeof v === 'string') {
        masked[k] = '[redacted]';
      } else {
        masked[k] = mask(v);
      }
    }
    return masked;
  };

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      const isAuth = path.startsWith('/api/auth');
      if (!isAuth && capturedJsonResponse) {
        try {
          logLine += ` :: ${JSON.stringify(mask(capturedJsonResponse))}`;
        } catch {
        }
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Session configuration - use memory store if database is not available
  let sessionStore;

  // Only try to use PostgreSQL if DATABASE_URL is available and looks valid
  if (process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))) {
    try {
      const PgStore = connectPgSimple(session);
      const pgPool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        // Add connection timeout to prevent hanging
        connectionTimeoutMillis: 5000,
      });

      // Test the connection first with a timeout
      const testConnection = async () => {
        const client = await pgPool.connect();
        await client.query('SELECT 1');
        client.release();
      };

      await testConnection();

      sessionStore = new PgStore({
        pool: pgPool,
        tableName: 'session',
        createTableIfMissing: true,
      });
      console.log("Using PostgreSQL session store");
    } catch (error) {
      console.log("PostgreSQL connection failed, using memory session store:", (error as Error).message);
      sessionStore = undefined; // Fall back to memory store
    }
  } else {
    console.log("DATABASE_URL not configured or invalid, using memory session store");
  }

  // Configure session middleware
  // Session configuration
  // IMPORTANT: For local development with Docker (HTTP), secure MUST be false.
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: isProduction, // Enforce HTTPS in production
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      sameSite: 'strict', // CSRF protection: prevents cookies from being sent in cross-site requests
    }
  }));

  registerChallengerAuth(app);
  registerChallongeAuth(app);
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // In development, we need to use Vite for hot reloading
    // This will only be executed in development mode
    console.log("Starting in development mode with Vite...");
    // For production, we avoid importing vite entirely
    serveStatic(app);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenOptions: any = {
    port,
    host: "0.0.0.0",
  };
  // reusePort is not supported on Windows; enable only when available
  if (process.platform !== 'win32') {
    listenOptions.reusePort = true;
  }

  server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
  });
})();
