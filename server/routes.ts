import type { Express, Request, Response } from "express";
import { RecaptchaEnterpriseServiceClient } from "@google-cloud/recaptcha-enterprise";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, verifyPassword } from "./auth";
import { loginSchema, updateProfileSchema, registerSchema, users } from "@shared/schema";
import { db } from "./db";
import { comboStats, favoriteCombos, favoriteDecks, favoriteDeckCombos, addFavoriteComboSchema, addFavoriteDeckSchema, addFavoriteDeckComboSchema, tournamentResultSchema, bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats, tornei, risultatiTorneo } from "@shared/schema";
import { desc, asc, or, ilike, sql, eq, and } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { loginRateLimiter } from "./rateLimiter";
import crypto from "node:crypto";
import { Resend } from "resend";

// Extend express session type
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Helper function to get client IP
// Uses socket remoteAddress which is the actual TCP connection IP (cannot be spoofed)
function getClientIp(req: Request): string {
  return req.socket.remoteAddress || 'unknown';
}

// Middleware to check if user is authenticated
function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Middleware to check if user is authenticated and is an admin
async function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register endpoint with reCAPTCHA verification
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, displayName, captchaToken } = registerSchema.parse(req.body);
      const clientIp = getClientIp(req);
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      const siteKey = process.env.RECAPTCHA_SITE_KEY;
      const hasEnterpriseConfig = !!(projectId && siteKey && process.env.GOOGLE_APPLICATION_CREDENTIALS);

      if (hasEnterpriseConfig) {
        try {
          const recaptchaClient = new RecaptchaEnterpriseServiceClient();
          const parent = recaptchaClient.projectPath(projectId!);
          const [assessment] = await recaptchaClient.createAssessment({
            parent,
            assessment: {
              event: {
                token: captchaToken,
                siteKey: siteKey!,
                userIpAddress: clientIp,
              },
            },
          });

          const valid = assessment.tokenProperties?.valid;
          const action = assessment.tokenProperties?.action;
          const score = assessment.riskAnalysis?.score ?? 0;

          if (!valid) {
            const reason = assessment.tokenProperties?.invalidReason ?? 'UNKNOWN';
            return res.status(400).json({ error: `Verifica anti-bot fallita (token non valido: ${reason}).` });
          }
          if (action && action !== 'register') {
            return res.status(400).json({ error: 'Azione reCAPTCHA non corrispondente.' });
          }
          if (score < 0.5) {
            return res.status(400).json({ error: 'Rischio elevato rilevato dal controllo anti-bot.' });
          }
        } catch (err) {
          // Fallback su siteverify se Enterprise fallisce per motivi di configurazione o runtime
          const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
          if (!RECAPTCHA_SECRET_KEY) {
            return res.status(500).json({ error: 'Server misconfiguration: missing reCAPTCHA secret' });
          }
          const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(RECAPTCHA_SECRET_KEY)}&response=${encodeURIComponent(captchaToken)}&remoteip=${encodeURIComponent(clientIp)}`;
          const recaptchaResponse = await fetch(verifyUrl, { method: 'POST' });
          const recaptchaData = await recaptchaResponse.json();
          if (!recaptchaData?.success || (typeof recaptchaData.score === 'number' && recaptchaData.score < 0.5)) {
            return res.status(400).json({ error: 'Verifica anti-bot fallita.' });
          }
        }
      } else {
        // Standard reCAPTCHA v3 siteverify
        const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
        if (!RECAPTCHA_SECRET_KEY) {
          return res.status(500).json({ error: 'Server misconfiguration: missing reCAPTCHA secret' });
        }
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(RECAPTCHA_SECRET_KEY)}&response=${encodeURIComponent(captchaToken)}&remoteip=${encodeURIComponent(clientIp)}`;
        const recaptchaResponse = await fetch(verifyUrl, { method: 'POST' });
        const recaptchaData = await recaptchaResponse.json();
        if (!recaptchaData?.success || (typeof recaptchaData.score === 'number' && recaptchaData.score < 0.5)) {
          return res.status(400).json({ error: 'Verifica anti-bot fallita.' });
        }
      }

      // Check if user already exists
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const hashed = await hashPassword(password);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 ora

      const newUser = await db.insert(users).values({
        email,
        password_hash: hashed,
        displayName,
        photoURL: null,
        is_verified: false,
        verification_token: verificationToken,
        verification_token_expires_at: expiresAt,
      }).returning();

      const u = newUser[0];
      const { password_hash: _, password: __, ...userWithoutPassword } = u as any;
      
      // Invia email di verifica se possibile
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || '5000'}`;
      const verifyUrl = `${APP_BASE_URL}/api/auth/verify?token=${verificationToken}`;
      const escapeHtml = (s: string) => s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
      const safeDisplayName = escapeHtml(displayName || "");
      if (RESEND_API_KEY) {
        try {
          const resend = new Resend(RESEND_API_KEY);
          const { data, error } = await resend.emails.send({
            from: 'no-reply@v2.beybladexmeta.com',
            to: email,
            subject: 'Verifica il tuo account',
            html: `<p>Ciao ${safeDisplayName},</p><p>Per completare la registrazione, verifica la tua email cliccando il link seguente:</p><p><a href="${verifyUrl}">Verifica il tuo account</a></p><p>Se non hai richiesto questa registrazione, ignora questa email.</p>`,
          });
          if (error) {
            console.error('Invio email di verifica fallito:', error);
          } else if (data?.id) {
            console.log('Email di verifica inviata, id:', data.id);
          } else {
            console.warn('Invio email: risposta inattesa da Resend:', { data, error });
          }
        } catch (e: any) {
          console.error('Invio email di verifica fallito:', e?.message || e);
        }
      } else {
        console.warn('RESEND_API_KEY non configurata: email di verifica non inviata');
      }

      return res.status(201).json({ user: userWithoutPassword, message: 'Registrazione completata. Controlla la tua email per verificare il tuo account.' });
    } catch (error) {
      return res.status(400).json({ error: 'Invalid request' });
    }
  });
  // Login endpoint
  app.post('/api/auth/login', async (req, res) => {
    const clientIp = getClientIp(req);
    
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      // Check if IP or email is blocked due to too many failed attempts
      const blockStatus = await loginRateLimiter.isBlocked(clientIp, email);
      if (blockStatus.blocked) {
        return res.status(429).json({ 
          error: 'Too many login attempts',
          retryAfter: blockStatus.remainingTime,
          message: `Too many failed login attempts. Please try again in ${blockStatus.remainingTime} seconds.`
        });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        await loginRateLimiter.recordFailedAttempt(clientIp, email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.is_verified) {
        return res.status(403).json({ error: 'Email non verificata. Controlla la tua casella di posta.' });
      }

      const isValid = await verifyPassword(password, (user as any).password_hash ?? user.password);
      if (!isValid) {
        await loginRateLimiter.recordFailedAttempt(clientIp, email);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Successful login - record it and clear any previous failed attempts
      await loginRateLimiter.recordSuccessfulLogin(clientIp, email);
      req.session.userId = user.id;
      
      // Don't send password hash to client
      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });
  
  // Endpoint di verifica email
  app.get('/api/auth/verify', async (req, res) => {
    try {
      const token = (req.query.token as string | undefined)?.trim();
      if (!token) {
        return res.status(400).send('Token di verifica mancante');
      }

      const now = new Date();
      const result = await db.select().from(users)
        .where(eq(users.verification_token, token))
        .limit(1);
      const user = result[0];

      if (!user) {
        return res.status(400).send('Token di verifica non valido');
      }
      if (user.verification_token_expires_at && user.verification_token_expires_at < now) {
        return res.status(400).send('Token di verifica scaduto');
      }

      await db.update(users)
        .set({
          is_verified: true,
          verification_token: null,
          verification_token_expires_at: null,
        })
        .where(eq(users.id, user.id));

      return res.redirect('/login?verified=true');
    } catch (error) {
      return res.status(500).send('Errore durante la verifica');
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // Get current user
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Update profile
  app.patch('/api/auth/profile', requireAuth, async (req, res) => {
    try {
      const updates = updateProfileSchema.parse(req.body);
      
      const user = await storage.updateUserProfile(req.session.userId!, updates);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Get top combos leaderboard
  app.get('/api/stats/combos', requireAuth, async (req, res) => {
    try {
      const pageParam = req.query.page ? parseInt(req.query.page as string) : 1;
      const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 20;
      const offset = (page - 1) * limit;
      
      const search = req.query.search as string | undefined;
      const sortByParam = (req.query.sortBy as string) || 'score';
      const sortOrder = (req.query.sortOrder as string) || 'desc';

      const validSortFields = ['score', 'first', 'second', 'third'];
      const sortBy = validSortFields.includes(sortByParam) ? sortByParam : 'score';

      let query = db.select().from(comboStats);
      let countQuery = db.select({ count: sql<number>`count(*)` }).from(comboStats);

      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        const whereClause = or(
          ilike(comboStats.blade, searchTerm),
          ilike(comboStats.assistBlade, searchTerm),
          ilike(comboStats.ratchet, searchTerm),
          ilike(comboStats.bit, searchTerm),
          ilike(comboStats.lockChip, searchTerm)
        );
        query = query.where(whereClause) as any;
        countQuery = countQuery.where(whereClause) as any;
      }

      const sortColumn = {
        score: comboStats.punteggioTotale,
        first: comboStats.primiPosti,
        second: comboStats.secondiPosti,
        third: comboStats.terziPosti,
      }[sortBy];

      const orderFn = sortOrder === 'asc' ? asc : desc;
      
      const [topCombos, countResult] = await Promise.all([
        query.orderBy(orderFn(sortColumn!)).limit(limit).offset(offset),
        countQuery
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / limit);
      
      res.json({ 
        combos: topCombos,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch combo stats' });
    }
  });

  // Get all top components in a single query (OPTIMIZED)
  app.get('/api/stats/top/components', requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
        FROM top_component_snapshot
      `);
      
      const topComponents = {
        blade: null as any,
        ratchet: null as any,
        bit: null as any,
      };
      
      for (const row of result.rows as any[]) {
        const component = {
          [row.component_type]: row.name,
          primiPosti: row.primi_posti,
          secondiPosti: row.secondi_posti,
          terziPosti: row.terzi_posti,
          punteggioTotale: row.punteggio_totale,
        };
        
        if (row.component_type === 'blade') {
          topComponents.blade = component;
        } else if (row.component_type === 'ratchet') {
          topComponents.ratchet = component;
        } else if (row.component_type === 'bit') {
          topComponents.bit = component;
        }
      }
      
      res.json(topComponents);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top components' });
    }
  });

  // Legacy endpoints (kept for backwards compatibility, but use /api/stats/top/components for better performance)
  app.get('/api/stats/top/blade', requireAuth, async (req, res) => {
    try {
      const topBlade = await db.select()
        .from(bladeStats)
        .orderBy(desc(bladeStats.punteggioTotale))
        .limit(1);
      
      res.json({ blade: topBlade[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top blade' });
    }
  });

  app.get('/api/stats/top/ratchet', requireAuth, async (req, res) => {
    try {
      const topRatchet = await db.select()
        .from(ratchetStats)
        .orderBy(desc(ratchetStats.punteggioTotale))
        .limit(1);
      
      res.json({ ratchet: topRatchet[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top ratchet' });
    }
  });

  app.get('/api/stats/top/bit', requireAuth, async (req, res) => {
    try {
      const topBit = await db.select()
        .from(bitStats)
        .orderBy(desc(bitStats.punteggioTotale))
        .limit(1);
      
      res.json({ bit: topBit[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top bit' });
    }
  });

  // Leaderboard for individual component types (blade, ratchet, bit)
  app.get('/api/stats/leaderboard/:type', requireAuth, async (req, res) => {
    try {
      const type = String(req.params.type || '').toLowerCase();
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 50)) : 10;

      let rows: any[] = [];
      if (type === 'blade') {
        rows = await db.select()
          .from(bladeStats)
          .orderBy(desc(bladeStats.punteggioTotale))
          .limit(limit);
      } else if (type === 'ratchet') {
        rows = await db.select()
          .from(ratchetStats)
          .orderBy(desc(ratchetStats.punteggioTotale))
          .limit(limit);
      } else if (type === 'bit') {
        rows = await db.select()
          .from(bitStats)
          .orderBy(desc(bitStats.punteggioTotale))
          .limit(limit);
      } else {
        return res.status(400).json({ error: 'Invalid type. Use blade, ratchet, or bit.' });
      }

      res.json({ items: rows, type, limit });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  // Get user's favorite combos
  app.get('/api/favorites/combos', requireAuth, async (req, res) => {
    try {
      const combos = await db.select()
        .from(favoriteCombos)
        .where(eq(favoriteCombos.userId, req.session.userId!));
      
      res.json({ combos });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch favorite combos' });
    }
  });

  // Add a favorite combo
  app.post('/api/favorites/combos', requireAuth, async (req, res) => {
    try {
      const comboData = addFavoriteComboSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      // Server-side existence checks against known component stats
      const [[bladeExists], [assistExists], [ratchetExists], [bitExists], [lockChipExists]] = await Promise.all([
        db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, comboData.blade)),
        comboData.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, comboData.assistBlade)),
        db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, comboData.ratchet)),
        db.select({ count: sql`count(*)` }).from(bitStats).where(eq(bitStats.bit, comboData.bit)),
        comboData.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, comboData.lockChip)),
      ]);

      if (!Number(bladeExists?.count) || !Number(assistExists?.count) || !Number(ratchetExists?.count) || !Number(bitExists?.count) || !Number(lockChipExists?.count)) {
        return res.status(400).json({ error: 'Invalid combo components' });
      }

      const [newCombo] = await db.insert(favoriteCombos)
        .values(comboData)
        .returning();
      
      res.json({ combo: newCombo });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Delete a favorite combo
  app.delete('/api/favorites/combos/:id', requireAuth, async (req, res) => {
    try {
      await db.delete(favoriteCombos)
        .where(
          and(
            eq(favoriteCombos.id, req.params.id),
            eq(favoriteCombos.userId, req.session.userId!)
          )
        );
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete favorite combo' });
    }
  });

  // Get user's favorite decks with combos
  app.get('/api/favorites/decks', requireAuth, async (req, res) => {
    try {
      const decks = await db.select()
        .from(favoriteDecks)
        .where(eq(favoriteDecks.userId, req.session.userId!));
      
      const decksWithCombos = await Promise.all(
        decks.map(async (deck) => {
          const combos = await db.select()
            .from(favoriteDeckCombos)
            .where(eq(favoriteDeckCombos.deckId, deck.id))
            .orderBy(asc(favoriteDeckCombos.comboNumber));
          
          return { ...deck, combos };
        })
      );
      
      res.json({ decks: decksWithCombos });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch favorite decks' });
    }
  });

  // Add a favorite deck
  app.post('/api/favorites/decks', requireAuth, async (req, res) => {
    try {
      const { name, combos } = req.body;
      
      if (!name || !combos || combos.length !== 3) {
        return res.status(400).json({ error: 'Deck must have a name and exactly 3 combos' });
      }

      // Validate that all parts are unique across all combos (except "None" for Assist Blade and Lock Chip)
      const allParts: string[] = [];
      for (const combo of combos) {
        if (!combo.blade || !combo.assistBlade || !combo.ratchet || !combo.bit || !combo.lockChip) {
          return res.status(400).json({ error: 'All combo components must be filled' });
        }
        // Add all parts, but exclude "None" for assistBlade and lockChip from uniqueness check
        allParts.push(combo.blade, combo.ratchet, combo.bit);
        if (combo.assistBlade !== "None") {
          allParts.push(combo.assistBlade);
        }
        if (combo.lockChip !== "None") {
          allParts.push(combo.lockChip);
        }
      }

      // Check for duplicates
      const uniqueParts = new Set(allParts);
      if (uniqueParts.size !== allParts.length) {
        return res.status(400).json({ error: 'All parts must be different across all combos in the deck (except None for Assist Blade and Lock Chip)' });
      }

      const deckData = addFavoriteDeckSchema.parse({
        name,
        userId: req.session.userId,
      });

      const [newDeck] = await db.insert(favoriteDecks)
        .values(deckData)
        .returning();

      const combosToInsert = combos.map((combo: any, index: number) => ({
        deckId: newDeck.id,
        comboNumber: index + 1,
        blade: String(combo.blade ?? '').trim(),
        assistBlade: String(combo.assistBlade ?? '').trim(),
        ratchet: String(combo.ratchet ?? '').trim(),
        bit: String(combo.bit ?? '').trim(),
        lockChip: String(combo.lockChip ?? '').trim(),
      }));

      // Validate each combo via schema and existence in stats tables
      for (const c of combosToInsert) {
        addFavoriteDeckComboSchema.parse(c);
        const [[bladeExists], [assistExists], [ratchetExists], [bitExists], [lockChipExists]] = await Promise.all([
          db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, c.blade)),
          c.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, c.assistBlade)),
          db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, c.ratchet)),
          db.select({ count: sql`count(*)` }).from(bitStats).where(eq(bitStats.bit, c.bit)),
          c.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, c.lockChip)),
        ]);
        if (!Number(bladeExists?.count) || !Number(assistExists?.count) || !Number(ratchetExists?.count) || !Number(bitExists?.count) || !Number(lockChipExists?.count)) {
          return res.status(400).json({ error: 'Invalid deck combo components' });
        }
      }

      const insertedCombos = await db.insert(favoriteDeckCombos)
        .values(combosToInsert)
        .returning();
      
      res.json({ deck: { ...newDeck, combos: insertedCombos } });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Delete a favorite deck
  app.delete('/api/favorites/decks/:id', requireAuth, async (req, res) => {
    try {
      await db.delete(favoriteDecks)
        .where(
          and(
            eq(favoriteDecks.id, req.params.id),
            eq(favoriteDecks.userId, req.session.userId!)
          )
        );
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete favorite deck' });
    }
  });

  // Get all unique components from stats tables (for dropdowns)
  app.get('/api/components', requireAuth, async (req, res) => {
    try {
      // Fetch from individual component stats tables instead of combo_stats
      const blades = await db.select({ name: bladeStats.blade })
        .from(bladeStats)
        .orderBy(asc(bladeStats.blade));
      
      const assistBlades = await db.select({ name: assistBladeStats.assistBlade })
        .from(assistBladeStats)
        .orderBy(asc(assistBladeStats.assistBlade));
      
      const ratchets = await db.select({ name: ratchetStats.ratchet })
        .from(ratchetStats)
        .orderBy(asc(ratchetStats.ratchet));
      
      const bits = await db.select({ name: bitStats.bit })
        .from(bitStats)
        .orderBy(asc(bitStats.bit));
      
      const lockChips = await db.select({ name: lockChipStats.lockChip })
        .from(lockChipStats)
        .orderBy(asc(lockChipStats.lockChip));
      
      // Filter out None/empty values and sort alphabetically
      res.json({
        blades: blades.map(b => b.name).filter(n => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        assistBlades: assistBlades.map(b => b.name).filter(n => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        ratchets: ratchets.map(b => b.name).filter(n => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        bits: bits.map(b => b.name).filter(n => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        lockChips: lockChips.map(b => b.name).filter(n => n && n.toUpperCase() !== 'NONE' && n !== '-'),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch components' });
    }
  });

  // Submit tournament results (admin only)
  app.post('/api/admin/tournament-results', requireAdmin, async (req, res) => {
    try {
      // Defense-in-depth: never accept client-provided admin flags
      if (req.body && typeof req.body.isAdmin !== 'undefined') {
        return res.status(400).json({ error: 'Client cannot set isAdmin; admin is verified server-side.' });
      }

      const data = tournamentResultSchema.parse(req.body);

      // Validate that all combo components exist in stats tables (assist/lock can be 'None')
      const validateCombo = async (combo: any) => {
        const [[bladeExists], [assistExists], [ratchetExists], [bitExists], [lockChipExists]] = await Promise.all([
          db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, combo.blade)),
          combo.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, combo.assistBlade)),
          db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, combo.ratchet)),
          db.select({ count: sql`count(*)` }).from(bitStats).where(eq(bitStats.bit, combo.bit)),
          combo.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, combo.lockChip)),
        ]);
        return Boolean(Number(bladeExists?.count) && Number(assistExists?.count) && Number(ratchetExists?.count) && Number(bitExists?.count) && Number(lockChipExists?.count));
      };

      for (const c of [...data.firstPlaceCombos, ...data.secondPlaceCombos, ...data.thirdPlaceCombos]) {
        const ok = await validateCombo(c);
        if (!ok) {
          return res.status(400).json({ error: 'Invalid tournament combo components' });
        }
      }
      
      const calculatePoints = (participants: number, position: number) => {
        if (position === 1) return participants * 3;
        if (position === 2) return participants * 2;
        if (position === 3) return participants * 1;
        return 0;
      };

      const firstPoints = calculatePoints(data.participants, 1);
      const secondPoints = calculatePoints(data.participants, 2);
      const thirdPoints = calculatePoints(data.participants, 3);

      const processCombo = async (combo: any, position: number) => {
        const points = position === 1 ? firstPoints : position === 2 ? secondPoints : thirdPoints;
        const primiPosti = position === 1 ? 1 : 0;
        const secondiPosti = position === 2 ? 1 : 0;
        const terziPosti = position === 3 ? 1 : 0;

        await db.execute(sql`
          INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
          VALUES (${combo.blade}, ${combo.assistBlade}, ${combo.ratchet}, ${combo.bit}, ${combo.lockChip}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
          ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip)
          DO UPDATE SET
            primi_posti = combo_stats.primi_posti + ${primiPosti},
            secondi_posti = combo_stats.secondi_posti + ${secondiPosti},
            terzi_posti = combo_stats.terzi_posti + ${terziPosti},
            punteggio_totale = combo_stats.punteggio_totale + ${points}
        `);

        await db.execute(sql`
          INSERT INTO blade_stats (blade, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
          VALUES (${combo.blade}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
          ON CONFLICT (blade)
          DO UPDATE SET
            primi_posti = blade_stats.primi_posti + ${primiPosti},
            secondi_posti = blade_stats.secondi_posti + ${secondiPosti},
            terzi_posti = blade_stats.terzi_posti + ${terziPosti},
            punteggio_totale = blade_stats.punteggio_totale + ${points}
        `);

        await db.execute(sql`
          INSERT INTO assist_blade_stats (assist_blade, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
          VALUES (${combo.assistBlade}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
          ON CONFLICT (assist_blade)
          DO UPDATE SET
            primi_posti = assist_blade_stats.primi_posti + ${primiPosti},
            secondi_posti = assist_blade_stats.secondi_posti + ${secondiPosti},
            terzi_posti = assist_blade_stats.terzi_posti + ${terziPosti},
            punteggio_totale = assist_blade_stats.punteggio_totale + ${points}
        `);

        await db.execute(sql`
          INSERT INTO ratchet_stats (ratchet, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
          VALUES (${combo.ratchet}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
          ON CONFLICT (ratchet)
          DO UPDATE SET
            primi_posti = ratchet_stats.primi_posti + ${primiPosti},
            secondi_posti = ratchet_stats.secondi_posti + ${secondiPosti},
            terzi_posti = ratchet_stats.terzi_posti + ${terziPosti},
            punteggio_totale = ratchet_stats.punteggio_totale + ${points}
        `);

        await db.execute(sql`
          INSERT INTO bit_stats (bit, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
          VALUES (${combo.bit}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
          ON CONFLICT (bit)
          DO UPDATE SET
            primi_posti = bit_stats.primi_posti + ${primiPosti},
            secondi_posti = bit_stats.secondi_posti + ${secondiPosti},
            terzi_posti = bit_stats.terzi_posti + ${terziPosti},
            punteggio_totale = bit_stats.punteggio_totale + ${points}
        `);

        await db.execute(sql`
          INSERT INTO lock_chip_stats (lock_chip, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
          VALUES (${combo.lockChip}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
          ON CONFLICT (lock_chip)
          DO UPDATE SET
            primi_posti = lock_chip_stats.primi_posti + ${primiPosti},
            secondi_posti = lock_chip_stats.secondi_posti + ${secondiPosti},
            terzi_posti = lock_chip_stats.terzi_posti + ${terziPosti},
            punteggio_totale = lock_chip_stats.punteggio_totale + ${points}
        `);
      };

      // Create a tournament record
      const [newTorneo] = await db.insert(tornei)
        .values({
          nomeTorneo: data.nomeTorneo,
          dataTorneo: new Date(data.dataTorneo),
          numeroPartecipanti: data.participants,
          descrizione: data.descrizione,
          regione: data.regione,
        })
        .returning({ torneoId: tornei.torneoId });

      // Update stats and insert history results
      for (const combo of data.firstPlaceCombos) {
        await processCombo(combo, 1);
        await db.insert(risultatiTorneo).values({
          torneoId: newTorneo.torneoId,
          piazzamento: 1,
          blade: combo.blade,
          assistBlade: combo.assistBlade,
          ratchet: combo.ratchet,
          bit: combo.bit,
          lockChip: combo.lockChip,
          puntiGuadagnati: firstPoints,
        });
      }

      for (const combo of data.secondPlaceCombos) {
        await processCombo(combo, 2);
        await db.insert(risultatiTorneo).values({
          torneoId: newTorneo.torneoId,
          piazzamento: 2,
          blade: combo.blade,
          assistBlade: combo.assistBlade,
          ratchet: combo.ratchet,
          bit: combo.bit,
          lockChip: combo.lockChip,
          puntiGuadagnati: secondPoints,
        });
      }

      for (const combo of data.thirdPlaceCombos) {
        await processCombo(combo, 3);
        await db.insert(risultatiTorneo).values({
          torneoId: newTorneo.torneoId,
          piazzamento: 3,
          blade: combo.blade,
          assistBlade: combo.assistBlade,
          ratchet: combo.ratchet,
          bit: combo.bit,
          lockChip: combo.lockChip,
          puntiGuadagnati: thirdPoints,
        });
      }

      // Refresh materialized view for top components (performance optimization)
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      } catch (refreshError) {
        // Fallback to non-concurrent refresh if MV lacks a unique index or backend doesn't support CONCURRENTLY
        console.warn('Refresh CONCURRENTLY failed, falling back to regular refresh:', refreshError);
        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
        } catch (fallbackError) {
          console.error('Failed to refresh materialized view:', fallbackError);
        }
      }

      res.json({ success: true, message: 'Tournament results submitted successfully', torneoId: newTorneo.torneoId });
    } catch (error) {
      console.error('Tournament submission error:', error);
      res.status(400).json({ error: 'Failed to submit tournament results' });
    }
  });

  // List tournaments (available to all authenticated users)
  app.get('/api/admin/tournaments', requireAuth, async (req, res) => {
    try {
      const tournaments = await db.select().from(tornei).orderBy(desc(tornei.dataTorneo));
      res.json({ tournaments });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tournaments' });
    }
  });

  // Get tournament results (top 3 placements) by tournament id (available to all authenticated users)
  app.get('/api/admin/tournaments/:id/results', requireAuth, async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing tournament id' });
      }

      const results = await db.select().from(risultatiTorneo)
        .where(eq(risultatiTorneo.torneoId, id))
        .orderBy(asc(risultatiTorneo.piazzamento));

      const firstPlaceCombos = results.filter(r => r.piazzamento === 1).map(r => ({
        blade: r.blade,
        assistBlade: r.assistBlade,
        ratchet: r.ratchet,
        bit: r.bit,
        lockChip: r.lockChip,
        puntiGuadagnati: r.puntiGuadagnati,
      }));
      const secondPlaceCombos = results.filter(r => r.piazzamento === 2).map(r => ({
        blade: r.blade,
        assistBlade: r.assistBlade,
        ratchet: r.ratchet,
        bit: r.bit,
        lockChip: r.lockChip,
        puntiGuadagnati: r.puntiGuadagnati,
      }));
      const thirdPlaceCombos = results.filter(r => r.piazzamento === 3).map(r => ({
        blade: r.blade,
        assistBlade: r.assistBlade,
        ratchet: r.ratchet,
        bit: r.bit,
        lockChip: r.lockChip,
        puntiGuadagnati: r.puntiGuadagnati,
      }));

      res.json({ firstPlaceCombos, secondPlaceCombos, thirdPlaceCombos });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tournament results' });
    }
  });

  // // Serve public objects from storage (component images)
  // app.get("/public-objects/:filePath(*)", async (req, res) => {
  //   const filePath = req.params.filePath;
  //   const objectStorageService = new ObjectStorageService();
  //   try {
  //     const objectInfo = await objectStorageService.searchPublicObject(filePath);
  //     if (!objectInfo) {
  //       return res.status(404).json({ error: "File not found" });
  //     }
  //     // Cache for 30 days (2592000 seconds) - component images are static
  //     objectStorageService.downloadObject(objectInfo, res, 2592000, true);
  //   } catch (error) {
  //     console.error("Error searching for public object:", error);
  //     return res.status(500).json({ error: "Internal server error" });
  //   }
  // });

  const httpServer = createServer(app);

  return httpServer;
}
