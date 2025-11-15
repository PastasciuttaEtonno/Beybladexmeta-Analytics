import type { Express, Request, Response } from "express";
import { RecaptchaEnterpriseServiceClient } from "@google-cloud/recaptcha-enterprise";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, verifyPassword } from "./auth";
import { loginSchema, updateProfileSchema, registerSchema, users } from "@shared/schema";
import { db } from "./db";
import { comboStats, favoriteCombos, favoriteDecks, favoriteDeckCombos, addFavoriteComboSchema, addFavoriteDeckSchema, addFavoriteDeckComboSchema, tournamentResultSchema, bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats, externalPlayerCombos, upsertTournamentPlayerCombosSchema, externalTournamentResultSchema, cmPlayers, cmMatchResults } from "@shared/schema";
import { desc, asc, or, ilike, sql, eq, and } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { loginRateLimiter } from "./rateLimiter";
import crypto from "node:crypto";
import { Resend } from "resend";
import { fetchTournamentsForGame, fetchTournamentDetail } from "./challengermode";
import { processExternalCombo, calculatePoints as calcExternalPoints, revertExternalCombo, revertExternalComboTx } from "./scoreExternalCombo";

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
  app.get('/api/stats/combos', async (req, res) => {
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
        date: comboStats.dataCreazione,
      }[sortBy];

      const orderFn = sortOrder === 'asc' ? asc : desc;

      const [topCombos, countResult] = await Promise.all([
        query.orderBy(orderFn(sortColumn!), desc(comboStats.dataCreazione)).limit(limit).offset(offset),
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
  app.get('/api/stats/top/components', async (req, res) => {
    try {
      // Pick top per component_type by #1 placements, then points
      const result = await db.execute(sql`
        SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
        FROM (
          SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale,
                 ROW_NUMBER() OVER (PARTITION BY component_type ORDER BY primi_posti DESC, punteggio_totale DESC, name ASC) AS rn
          FROM top_component_snapshot
        ) t
        WHERE rn = 1
      `);

      const topComponents: any = {};
      for (const row of result.rows as any[]) {
        topComponents[row.component_type] = {
          [row.component_type]: row.name,
          primiPosti: row.primi_posti,
          secondiPosti: row.secondi_posti,
          terziPosti: row.terzi_posti,
          punteggioTotale: row.punteggio_totale,
        };
      }
      res.json(topComponents);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top components' });
    }
  });

  // Legacy endpoints (kept for backwards compatibility, but use /api/stats/top/components for better performance)
  app.get('/api/stats/top/blade', async (req, res) => {
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

  app.get('/api/stats/top/ratchet', async (req, res) => {
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

  app.get('/api/stats/top/bit', async (req, res) => {
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
  app.get('/api/stats/leaderboard/:type', async (req, res) => {
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
  app.get('/api/components', async (req, res) => {
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

  // Submit tournament results (admin only) — DEPRECATO per flusso Challengermode
  app.post('/api/admin/tournament-results', requireAdmin, async (req, res) => {
    try {
      return res.status(410).json({
        error: 'Endpoint deprecato. Usa /api/admin/tournament-results/external con playerId e tournamentId da Challengermode.'
      });
    } catch (error) {
      res.status(400).json({ error: 'Failed to submit tournament results' });
    }
  });

  // Submit tournament results using external player combos (admin only)
  app.post('/api/admin/tournament-results/external', requireAdmin, async (req, res) => {
    try {
      if (req.body && typeof req.body.isAdmin !== 'undefined') {
        return res.status(400).json({ error: 'Client cannot set isAdmin; admin is verified server-side.' });
      }

      const data = externalTournamentResultSchema.parse(req.body);

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
          INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione)
          VALUES (${combo.blade}, ${combo.assistBlade}, ${combo.ratchet}, ${combo.bit}, ${combo.lockChip}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points}, NOW())
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

      // Con flusso Challengermode non creiamo più record in 'tornei'; usiamo tournamentId esterno

      // Load combos for winners from external_player_combos
      const loadCombosForPlayer = async (playerId: string) => {
        const rows = await db.select().from(externalPlayerCombos)
          .where(and(eq(externalPlayerCombos.tournamentId, data.tournamentId), eq(externalPlayerCombos.playerId, playerId)))
          .orderBy(asc(externalPlayerCombos.comboNumber));
        return rows.map(r => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip }));
      };

      const firstCombos = await loadCombosForPlayer(data.firstPlacePlayerId);
      const secondCombos = await loadCombosForPlayer(data.secondPlacePlayerId);
      const thirdCombos = await loadCombosForPlayer(data.thirdPlacePlayerId);

      if (firstCombos.length !== 3 || secondCombos.length !== 3 || thirdCombos.length !== 3) {
        return res.status(400).json({ error: 'Each winner must have exactly 3 combos in external_player_combos' });
      }

      // Pre-fetch existing results to avoid double-counting on re-submission
      const existingResults = await db
        .select({ playerId: cmMatchResults.playerId, comboNumber: cmMatchResults.comboNumber })
        .from(cmMatchResults)
        .where(eq(cmMatchResults.tournamentId, data.tournamentId));
      const existingKeySet = new Set(existingResults.map(r => `${r.playerId}|${r.comboNumber}`));

      // Upsert dei giocatori (fallback nickname = playerId se non già presente)
      await db.insert(cmPlayers).values([
        { id: data.firstPlacePlayerId, nickname: data.firstPlacePlayerId, avatar: null },
        { id: data.secondPlacePlayerId, nickname: data.secondPlacePlayerId, avatar: null },
        { id: data.thirdPlacePlayerId, nickname: data.thirdPlacePlayerId, avatar: null },
      ]).onConflictDoUpdate({
        target: cmPlayers.id,
        set: { nickname: sql`excluded.nickname`, avatar: sql`excluded.avatar`, updatedAt: sql`now()` }
      });

      // Inserisci storico risultati in cm_match_results (9 righe)
      const insertValues = [
        ...firstCombos.map((combo, idx) => ({
          tournamentId: data.tournamentId,
          playerId: data.firstPlacePlayerId,
          comboNumber: idx + 1,
          blade: combo.blade,
          assistBlade: combo.assistBlade,
          ratchet: combo.ratchet,
          bit: combo.bit,
          lockChip: combo.lockChip,
          piazzamento: 1,
          numeroPartecipanti: data.participants,
          dataTorneo: new Date(data.dataTorneo),
          puntiGuadagnati: firstPoints,
        })),
        ...secondCombos.map((combo, idx) => ({
          tournamentId: data.tournamentId,
          playerId: data.secondPlacePlayerId,
          comboNumber: idx + 1,
          blade: combo.blade,
          assistBlade: combo.assistBlade,
          ratchet: combo.ratchet,
          bit: combo.bit,
          lockChip: combo.lockChip,
          piazzamento: 2,
          numeroPartecipanti: data.participants,
          dataTorneo: new Date(data.dataTorneo),
          puntiGuadagnati: secondPoints,
        })),
        ...thirdCombos.map((combo, idx) => ({
          tournamentId: data.tournamentId,
          playerId: data.thirdPlacePlayerId,
          comboNumber: idx + 1,
          blade: combo.blade,
          assistBlade: combo.assistBlade,
          ratchet: combo.ratchet,
          bit: combo.bit,
          lockChip: combo.lockChip,
          piazzamento: 3,
          numeroPartecipanti: data.participants,
          dataTorneo: new Date(data.dataTorneo),
          puntiGuadagnati: thirdPoints,
        })),
      ];

      // Ensure combo_stats rows exist for all 9 combos to satisfy fk_combo_components
      const ensureComboStats = [
        ...firstCombos,
        ...secondCombos,
        ...thirdCombos,
      ].map((combo) => ({
        blade: combo.blade,
        assistBlade: combo.assistBlade,
        ratchet: combo.ratchet,
        bit: combo.bit,
        lockChip: combo.lockChip,
      }));
      if (ensureComboStats.length > 0) {
        await db.insert(comboStats).values(ensureComboStats as any).onConflictDoNothing();
      }

      await db.insert(cmMatchResults).values(insertValues as any).onConflictDoUpdate({
        target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber],
        set: {
          blade: sql`excluded.blade`,
          assistBlade: sql`excluded.assist_blade`,
          ratchet: sql`excluded.ratchet`,
          bit: sql`excluded.bit`,
          lockChip: sql`excluded.lock_chip`,
          piazzamento: sql`excluded.piazzamento`,
          numeroPartecipanti: sql`excluded.numero_partecipanti`,
          dataTorneo: sql`excluded.data_torneo`,
          puntiGuadagnati: sql`excluded.punti_guadagnati`,
          updatedAt: sql`now()`,
        }
      });

      // Aggiorna le statistiche aggregate usando la funzione di servizio (9 chiamate) in modo idempotente
      for (const [idx, combo] of firstCombos.entries()) {
        const key = `${data.firstPlacePlayerId}|${idx + 1}`;
        if (!existingKeySet.has(key)) {
          await processExternalCombo({
            blade: combo.blade,
            assistBlade: combo.assistBlade,
            ratchet: combo.ratchet,
            bit: combo.bit,
            lockChip: combo.lockChip,
            placement: 1,
            totalParticipants: data.participants,
          });
        }
      }
      for (const [idx, combo] of secondCombos.entries()) {
        const key = `${data.secondPlacePlayerId}|${idx + 1}`;
        if (!existingKeySet.has(key)) {
          await processExternalCombo({
            blade: combo.blade,
            assistBlade: combo.assistBlade,
            ratchet: combo.ratchet,
            bit: combo.bit,
            lockChip: combo.lockChip,
            placement: 2,
            totalParticipants: data.participants,
          });
        }
      }
      for (const [idx, combo] of thirdCombos.entries()) {
        const key = `${data.thirdPlacePlayerId}|${idx + 1}`;
        if (!existingKeySet.has(key)) {
          await processExternalCombo({
            blade: combo.blade,
            assistBlade: combo.assistBlade,
            ratchet: combo.ratchet,
            bit: combo.bit,
            lockChip: combo.lockChip,
            placement: 3,
            totalParticipants: data.participants,
          });
        }
      }

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      } catch (refreshError) {
        console.warn('Refresh CONCURRENTLY failed, falling back to regular refresh:', refreshError);
        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
        } catch (fallbackError) {
          console.error('Failed to refresh materialized view:', fallbackError);
        }
      }

      res.json({ success: true, message: 'External tournament results submitted successfully', tournamentId: data.tournamentId });
    } catch (error) {
      console.error('External tournament submission error:', error);
      res.status(400).json({ error: 'Failed to submit external tournament results' });
    }
  });

  // List tournaments (available to all authenticated users)
  // Now fetches from Challengermode GraphQL to show real past tournaments
  app.get('/api/admin/tournaments', requireAuth, async (req, res) => {
    try {
      const { fetchTournamentsForGame, mapToTorneoCards } = await import('./challengermode');
      const after = (req.query.after as string) || '2025-10-11T00:00:00Z';
      const nodes = await fetchTournamentsForGame('beybladex', after);
      const tournaments = mapToTorneoCards(nodes);
      res.json({ tournaments });
    } catch (error: any) {
      console.error('Failed to fetch Challengermode tournaments:', error?.message || error);
      res.status(500).json({ error: 'Failed to fetch tournaments from Challengermode' });
    }
  });

  // Get tournament results (top 3 placements) by tournament id (available to all authenticated users)
  app.get('/api/admin/tournaments/:id/results', requireAuth, async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing tournament id' });
      }

      const results = await db.select().from(cmMatchResults)
        .where(eq(cmMatchResults.tournamentId, id))
        .orderBy(asc(cmMatchResults.piazzamento), asc(cmMatchResults.comboNumber));

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

  app.get("/api/trends", async (req, res) => {
    try {
      const metricParam = String((req.query.metric || 'points')).toLowerCase();
      const granularityParam = String((req.query.granularity || 'month')).toLowerCase();

      const metric = metricParam === 'count' ? 'count' : 'points';
      const granularity = granularityParam === 'week' ? 'week' : 'month';

      let query;

      if (granularity === 'month' && metric === 'points') {
        query = sql`
          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.bit
        `;
      } else if (granularity === 'week' && metric === 'points') {
        query = sql`
          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.bit
        `;
      } else if (granularity === 'month' && metric === 'count') {
        query = sql`
          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            COUNT(*) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            COUNT(*) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            COUNT(*) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.bit
        `;
      } else {
        // week + count
        query = sql`
          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            COUNT(*) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            COUNT(*) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            COUNT(*) AS total_points
          FROM cm_match_results cm
          GROUP BY month, cm.bit
        `;
      }

      const trendData = await db.execute(query);
      res.json(trendData.rows);
    } catch (error) {
      console.error("Error fetching trend data:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get(
    "/api/admin/tournament-results",
    requireAdmin, async (req, res) => {
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

  // Synergy endpoint: compute best allies for a selected component
  app.get('/api/synergy', async (req, res) => {
    try {
      const typeRaw = String(req.query.type || '').toLowerCase();
      const nameRaw = String(req.query.name || '').trim();

      const allowedTypes = ['blade', 'ratchet', 'bit', 'assist-blade', 'lock-chip'];
      if (!allowedTypes.includes(typeRaw)) {
        return res.status(400).json({ error: 'Invalid type. Use blade, ratchet, bit, assist-blade, or lock-chip.' });
      }
      if (!nameRaw) {
        return res.status(400).json({ error: 'Missing name parameter' });
      }

      const typeColumnMap: Record<string, string> = {
        'blade': 'blade',
        'ratchet': 'ratchet',
        'bit': 'bit',
        'assist-blade': 'assist_blade',
        'lock-chip': 'lock_chip',
      };

      const selectedCol = typeColumnMap[typeRaw];
      const limit = 5;

      // Helper to run a grouped SUM query against combo_stats
      const runTopQuery = async (groupCol: string, excludeNone: boolean) => {
        const noneFilter = excludeNone ? sql`AND ${sql.raw(groupCol)} <> 'None'` : sql``;
        const query = sql`
          SELECT ${sql.raw(groupCol)} AS name, SUM(punteggio_totale) AS points
          FROM combo_stats
          WHERE ${sql.raw(selectedCol)} = ${nameRaw}
          ${noneFilter}
          GROUP BY ${sql.raw(groupCol)}
          ORDER BY points DESC
          LIMIT ${limit}
        `;
        const result = await db.execute(query);
        return (result.rows as any[]).map(r => ({ name: r.name, points: Number(r.points) }));
      };

      // Decide which categories to compute based on selected type
      let response: any = {};
      if (typeRaw === 'blade') {
        response.topAssistBlades = await runTopQuery('assist_blade', true);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topBits = await runTopQuery('bit', false);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'ratchet') {
        response.topBlades = await runTopQuery('blade', false);
        response.topBits = await runTopQuery('bit', false);
        response.topAssistBlades = await runTopQuery('assist_blade', true);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'bit') {
        response.topBlades = await runTopQuery('blade', false);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topAssistBlades = await runTopQuery('assist_blade', true);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'assist-blade') {
        response.topBlades = await runTopQuery('blade', false);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topBits = await runTopQuery('bit', false);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'lock-chip') {
        response.topBlades = await runTopQuery('blade', false);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topBits = await runTopQuery('bit', false);
        response.topAssistBlades = await runTopQuery('assist_blade', true);
      }

      res.json(response);
    } catch (error) {
      console.error('Error fetching synergy data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // External: Challengermode tournaments list (read-only)
  app.get('/api/challengermode/tournaments', async (req, res) => {
    try {
      const after = String(req.query.after || '2024-01-01T00:00:00Z');
      const nodes = await fetchTournamentsForGame(after);
      const rows = await db.execute(sql`SELECT DISTINCT tournament_id FROM cm_match_results`);
      const idSet = new Set<string>((rows.rows as any[]).map((r) => String((r as any).tournament_id || (r as any).tournamentId)));
      const tournaments = (nodes as any[]).map((n) => ({ ...n, hasCombos: idSet.has(String((n as any).id)) }));
      res.json({ tournaments });
    } catch (error: any) {
      console.error('Error fetching Challengermode tournaments:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch external tournaments' });
    }
  });

  // External: Challengermode tournament detail with attendance/placements (read-only)
  app.get('/api/challengermode/tournaments/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!id) return res.status(400).json({ error: 'Missing tournament id' });
      const detail = await fetchTournamentDetail(id);

      // Filter for top 4 placements and upsert player info
      if (detail.attendance?.signups?.lineups) {
        const lineups = detail.attendance.signups.lineups;
        const top4 = lineups
          .filter(l => l.placement?.displayPlacement && parseInt(l.placement.displayPlacement, 10) <= 4)
          .sort((a, b) => parseInt(a.placement.displayPlacement, 10) - parseInt(b.placement.displayPlacement, 10));

        detail.attendance.signups.lineups = top4;

        // Upsert player info into our `cm_players` table
        const playerUpserts = top4.flatMap(l => l.members.map(m => ({
          id: m.user.userId,
          nickname: m.user.username,
          avatar: m.user.profilePicture?.url || null,
        })));

        if (playerUpserts.length > 0) {
          await db.insert(cmPlayers).values(playerUpserts).onConflictDoUpdate({
            target: cmPlayers.id,
            set: {
              nickname: sql`excluded.nickname`,
              avatar: sql`excluded.avatar`,
              updatedAt: sql`now()`,
            }
          });
        }
      }

      try {
        const exists = await db.execute(sql`SELECT 1 FROM cm_match_results WHERE tournament_id = ${id} LIMIT 1`);
        (detail as any).hasCombos = Array.isArray(exists.rows) && exists.rows.length > 0;
      } catch {
        (detail as any).hasCombos = false;
      }

      res.json({ detail });
    } catch (error: any) {
      console.error('Error fetching Challengermode tournament detail:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch external tournament detail' });
    }
  });

  // Get combos for a specific player in a tournament (authenticated users)
  app.get('/api/tournaments/:id/players/:playerId/combos', async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const playerId = String(req.params.playerId || '').trim();
      if (!tournamentId || !playerId) {
        return res.status(400).json({ error: 'Missing tournament or player id' });
      }
      const rows = await db.select().from(externalPlayerCombos)
        .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, playerId)))
        .orderBy(asc(externalPlayerCombos.comboNumber));
      const combos = rows.map(r => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip }));
      res.json({ combos });
    } catch (error) {
      console.error('Failed to fetch player combos:', error);
      res.status(500).json({ error: 'Failed to fetch player combos' });
    }
  });

  app.post('/api/admin/tournaments/:id/combos/reset', requireAdmin, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      if (!tournamentId) {
        return res.status(400).json({ error: 'Missing tournament id' });
      }

      let affected = 0;
      await db.transaction(async (tx) => {
        const resRows = await tx.execute(sql`
          SELECT 
            blade,
            assist_blade AS "assistBlade",
            ratchet,
            bit,
            lock_chip AS "lockChip",
            piazzamento,
            numero_partecipanti AS "numeroPartecipanti"
          FROM cm_match_results
          WHERE tournament_id = ${tournamentId}
        `);
        const rows = (resRows.rows as any[]) || [];

        for (const r of rows) {
          const placement = Number(r.piazzamento ?? 0);
          const participants = Number(r.numeroPartecipanti ?? 0);
          if (placement >= 1 && placement <= 3 && participants > 0) {
            await revertExternalComboTx(tx, {
              blade: r.blade,
              assistBlade: r.assistBlade,
              ratchet: r.ratchet,
              bit: r.bit,
              lockChip: r.lockChip,
              placement,
              totalParticipants: participants,
            });
            affected++;
          }
        }

        await tx.execute(sql`DELETE FROM cm_match_results WHERE tournament_id = ${tournamentId}`);
        await tx.execute(sql`DELETE FROM external_player_combos WHERE tournament_id = ${tournamentId}`);
      });

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      } catch {
        await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
      }

      return res.json({ success: true, affected });
    } catch (error: any) {
      console.error('Failed to reset tournament combos:', error);
      return res.status(500).json({ error: error?.message || 'Failed to reset tournament combos' });
    }
  });

  // Upsert combos for a specific player in a tournament (admin only)
  app.put('/api/tournaments/:id/players/:playerId/combos', requireAdmin, async (req, res) => {
    try {
      const parsed = upsertTournamentPlayerCombosSchema.parse({
        tournamentId: String(req.params.id || '').trim(),
        playerId: String(req.params.playerId || '').trim(),
        combos: Array.isArray(req.body?.combos) ? req.body.combos : [],
      });

      // Validate component existence against stats tables (defensive mapping)
      for (const combo of parsed.combos) {
        const bladeRows = await db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, combo.blade));
        const bladeCount = Number(bladeRows[0]?.count ?? 0);

        const assistCount = combo.assistBlade === 'None'
          ? 1
          : Number((await db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, combo.assistBlade)))[0]?.count ?? 0);

        const ratchetCount = Number((await db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, combo.ratchet)))[0]?.count ?? 0);
        const bitCount = Number((await db.select({ count: sql`count(*)` }).from(bitStats).where(eq(bitStats.bit, combo.bit)))[0]?.count ?? 0);
        const lockChipCount = combo.lockChip === 'None'
          ? 1
          : Number((await db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, combo.lockChip)))[0]?.count ?? 0);

        if (!bladeCount || !assistCount || !ratchetCount || !bitCount || !lockChipCount) {
          return res.status(400).json({ error: 'Invalid combo components' });
        }
      }

      // Simple uniqueness within deck: ensure no duplicate exact combos in the three
      const seen = new Set<string>();
      for (const c of parsed.combos) {
        const key = `${c.blade}|${c.assistBlade}|${c.ratchet}|${c.bit}|${c.lockChip}`;
        if (seen.has(key)) {
          return res.status(400).json({ error: 'Duplicate combos in the deck' });
        }
        seen.add(key);
      }

      // Replace existing combos for player + tournament
      await db.execute(sql`DELETE FROM external_player_combos WHERE tournament_id = ${parsed.tournamentId} AND player_id = ${parsed.playerId}`);

      // Ensure player exists in cm_players (fallback nickname=playerId)
      await db.insert(cmPlayers).values({ id: parsed.playerId, nickname: parsed.playerId, avatar: null as any })
        .onConflictDoNothing();

      // Fetch tournament detail to enrich with placement, participants, and date
      let placement: number | null = null;
      let totalParticipants: number | null = null;
      let tournamentDate: Date | null = null; // normalized to YYYY-MM-DD
      try {
        const detail = await fetchTournamentDetail(parsed.tournamentId);
        const startedAtStr = detail?.schedule?.startedAt as string | undefined;
        if (startedAtStr) {
          const dateOnly = String(startedAtStr).slice(0, 10);
          if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
            // Ensure a Date object so Drizzle binds correctly to DATE columns
            tournamentDate = new Date(dateOnly);
          }
        }
        const userCount = detail?.attendance?.signups?.userCount as number | undefined;
        if (typeof userCount === 'number' && userCount > 0) totalParticipants = userCount;
        const lineups: any[] = detail?.attendance?.signups?.lineups || [];
        const found = lineups.find(l => Array.isArray(l.members) && l.members.some((m: any) => m?.user?.userId === parsed.playerId));
        const disp = found?.placement?.displayPlacement as string | undefined;
        if (disp) {
          const p = parseInt(String(disp), 10);
          if (!Number.isNaN(p)) placement = p;
        }
      } catch (e) {
        // If external fetch fails, continue without enrichment
        console.warn('Failed to fetch tournament detail for enrichment:', (e as any)?.message || e);
      }

      // Insert new combos with combo_number 1..N
      const values = parsed.combos.map((c, idx) => ({
        tournamentId: parsed.tournamentId,
        playerId: parsed.playerId,
        comboNumber: idx + 1,
        blade: c.blade,
        assistBlade: c.assistBlade,
        ratchet: c.ratchet,
        bit: c.bit,
        lockChip: c.lockChip,
        placement: placement ?? null,
        totalParticipants: totalParticipants ?? null,
        tournamentDate: tournamentDate ?? null,
      }));
      const inserted = await db.insert(externalPlayerCombos).values(values).returning();
      // Pre-fetch existing results for this player + tournament to avoid double-counting
      const prevRows = await db
        .select({
          comboNumber: cmMatchResults.comboNumber,
          blade: cmMatchResults.blade,
          assistBlade: cmMatchResults.assistBlade,
          ratchet: cmMatchResults.ratchet,
          bit: cmMatchResults.bit,
          lockChip: cmMatchResults.lockChip,
          piazzamento: cmMatchResults.piazzamento,
          numeroPartecipanti: cmMatchResults.numeroPartecipanti,
        })
        .from(cmMatchResults)
        .where(and(eq(cmMatchResults.tournamentId, parsed.tournamentId), eq(cmMatchResults.playerId, parsed.playerId)));
      const prevMap = new Map<number, any>(prevRows.map(r => [Number(r.comboNumber), r]));

      // Upsert into cm_match_results so /api/trends has data (requires date)
      if (tournamentDate) {

        // Ensure combo_stats rows exist to satisfy fk_combo_components
        // Use defaults (zeros) for counters; ON CONFLICT DO NOTHING
        const baseCombos = inserted.map((r) => ({
          blade: r.blade,
          assistBlade: r.assistBlade,
          ratchet: r.ratchet,
          bit: r.bit,
          lockChip: r.lockChip,
        }));
        if (baseCombos.length > 0) {
          await db.insert(comboStats).values(baseCombos as any).onConflictDoNothing();
        }

        const cmValues = inserted.map((r, idx) => ({
          tournamentId: parsed.tournamentId,
          playerId: parsed.playerId,
          comboNumber: r.comboNumber ?? idx + 1,
          blade: r.blade,
          assistBlade: r.assistBlade,
          ratchet: r.ratchet,
          bit: r.bit,
          lockChip: r.lockChip,
          piazzamento: placement ?? 0,
          numeroPartecipanti: totalParticipants ?? 0,
          dataTorneo: tournamentDate,
          puntiGuadagnati: (placement && totalParticipants && placement >= 1 && placement <= 3 && totalParticipants > 0)
            ? calcExternalPoints(placement, totalParticipants)
            : 0,
        }));
        await db.insert(cmMatchResults).values(cmValues as any).onConflictDoUpdate({
          target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber],
          set: {
            blade: sql`excluded.blade`,
            assistBlade: sql`excluded.assist_blade`,
            ratchet: sql`excluded.ratchet`,
            bit: sql`excluded.bit`,
            lockChip: sql`excluded.lock_chip`,
            piazzamento: sql`excluded.piazzamento`,
            numeroPartecipanti: sql`excluded.numero_partecipanti`,
            dataTorneo: sql`excluded.data_torneo`,
            puntiGuadagnati: sql`excluded.punti_guadagnati`,
            updatedAt: sql`now()`,
          }
        });
      }
      // Update aggregate stats using placement/participants (only if available)
      if (placement && totalParticipants && placement >= 1 && placement <= 3 && totalParticipants > 0) {
        for (const r of inserted) {
          const comboNum = Number(r.comboNumber ?? 0);
          const prev = prevMap.get(comboNum);
          const changed = !!prev && (
            prev.blade !== r.blade ||
            prev.assistBlade !== r.assistBlade ||
            prev.ratchet !== r.ratchet ||
            prev.bit !== r.bit ||
            prev.lockChip !== r.lockChip ||
            Number(prev.piazzamento) !== Number(placement) ||
            Number(prev.numeroPartecipanti) !== Number(totalParticipants)
          );

          if (changed) {
            await revertExternalCombo({
              blade: prev.blade,
              assistBlade: prev.assistBlade,
              ratchet: prev.ratchet,
              bit: prev.bit,
              lockChip: prev.lockChip,
              placement: Number(prev.piazzamento ?? 0),
              totalParticipants: Number(prev.numeroPartecipanti ?? 0),
            });
            await processExternalCombo({
              blade: r.blade,
              assistBlade: r.assistBlade,
              ratchet: r.ratchet,
              bit: r.bit,
              lockChip: r.lockChip,
              placement,
              totalParticipants,
            });
          } else if (!prev) {
            await processExternalCombo({
              blade: r.blade,
              assistBlade: r.assistBlade,
              ratchet: r.ratchet,
              bit: r.bit,
              lockChip: r.lockChip,
              placement,
              totalParticipants,
            });
          }
        }

        // Refresh materialized view to reflect updated component standings
        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
        } catch (refreshError) {
          console.warn('Refresh CONCURRENTLY failed, falling back to regular refresh:', refreshError);
          try {
            await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
          } catch (fallbackError) {
            console.error('Failed to refresh materialized view:', fallbackError);
          }
        }
      }

      res.json({ success: true, combos: inserted.map(r => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip })) });
    } catch (error: any) {
      console.error('Failed to upsert player combos:', error);
      res.status(400).json({ error: error?.message || 'Failed to upsert player combos' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
