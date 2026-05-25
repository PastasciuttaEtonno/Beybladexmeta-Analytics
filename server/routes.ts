import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerAuthRoutes } from "./routes/auth";
import { registerStatsRoutes } from "./routes/stats";
import { registerPlayersRoutes } from "./routes/players";
import { registerTournamentsRoutes } from "./routes/tournaments";
import { registerFavoritesRoutes } from "./routes/favorites";
import { registerAnalyticsRoutes } from "./routes/analytics";
import { registerAdminRoutes } from "./routes/admin";
import { registerOgRoutes } from "./routes/og";

export async function registerRoutes(app: Express): Promise<Server> {
  // Enforce HTTPS in production (allow localhost)
  if (app.get("env") === "production") {
    app.use((req, res, next) => {
      if (req.hostname === 'localhost' || req.hostname === '127.0.0.1') return next();
      if (req.headers["x-forwarded-proto"] !== "https") {
        return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
      }
      next();
    });
  }

  // Populate req.user from session on every request
  app.use(async (req, _res, next) => {
    if (req.session.userId) {
      try {
        const user = await storage.getUser(req.session.userId);
        if (user) req.user = user;
      } catch (err) {
        console.error("Error populating req.user:", err);
      }
    }
    next();
  });

  // Register domain-specific route modules
  registerOgRoutes(app);        // /combo/:id, /api/og/*, /sitemap.xml
  registerAuthRoutes(app);      // /api/auth/*, /api/user/*
  registerStatsRoutes(app);     // /api/stats/*, /api/components, /api/seasons
  registerPlayersRoutes(app);   // /api/players/*, /api/player-rankings, /api/leaderboard/regional
  registerTournamentsRoutes(app); // /api/tournaments/*, /api/challengermode/*, /api/me/*, /api/challenger/*
  registerFavoritesRoutes(app); // /api/favorites/*
  registerAnalyticsRoutes(app); // /api/analytics/meta, /api/trends, /api/synergy
  registerAdminRoutes(app);     // /api/admin/*, /api/tournaments/:id/players/:playerId/combos

  const httpServer = createServer(app);
  return httpServer;
}
