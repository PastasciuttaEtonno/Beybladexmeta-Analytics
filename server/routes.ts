import type { Express, Request, Response } from "express";
import { z } from "zod";
import { RecaptchaEnterpriseServiceClient } from "@google-cloud/recaptcha-enterprise";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, verifyPassword } from "./auth";
import { loginSchema, updateProfileSchema, registerSchema, users, User } from "@shared/schema";
import { db } from "./db";
import { comboStats, favoriteCombos, favoriteDecks, favoriteDeckCombos, addFavoriteComboSchema, addFavoriteDeckSchema, addFavoriteDeckComboSchema, tournamentResultSchema, tournamentComboSchema, bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats, externalPlayerCombos, upsertTournamentPlayerCombosSchema, externalTournamentResultSchema, cmPlayers, cmMatchResults, adminAuditLogs, playerLeaderboardView, playerPlatformStats, challongeReportedCombos, challongePlayers, unifiedMetaView, challongeMatchResults, userAliases } from "@shared/schema";
import { desc, asc, or, ilike, sql, eq, and } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { loginRateLimiter } from "./rateLimiter";
import crypto from "node:crypto";
import { Resend } from "resend";
import { fetchTournamentsForGame, fetchTournamentDetail, fetchUserParticipations } from "./challengermode";
import { checkTournamentPlacement } from "./lib/challengermode";
import { processExternalCombo, calculatePoints as calcExternalPoints, revertExternalCombo, revertExternalComboTx } from "./scoreExternalCombo";
// Import recalculateAllRegionalStats
import { recalculateAllRegionalStats } from "./lib/regionalScoring";
import { determineSeason } from "./lib/seasons";

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
    console.log(`[Auth] Unauthorized access to ${req.method} ${req.path} - No Session/UserId. Cookie present: ${!!req.headers.cookie}`);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Middleware to check if user is authenticated and is an admin
async function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    console.log(`[Admin] Unauthorized access to ${req.method} ${req.path} - No Session/UserId`);
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isAdmin) {
      console.log(`[Admin] Forbidden access to ${req.method} ${req.path} - User ${req.session.userId} is not admin`);
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Global Auth Middleware: Populate req.user if session exists
  app.use(async (req, res, next) => {
    if (req.session.userId) {
      try {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          req.user = user;
        }
      } catch (err) {
        console.error("Error populating req.user:", err);
      }
    }
    next();
  });
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

      const isValid = await verifyPassword(password, (user as any).password_hash);
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

  // --- USER ALIAS ROUTES ---

  app.post('/api/user/aliases', requireAuth, async (req, res) => {
    try {
      // Require Challonge authentication
      if (!req.user!.challongeId) {
        return res.status(403).json({ error: 'Devi autenticarti con Challonge per richiedere alias.' });
      }

      const alias = String(req.body.alias || '').trim();
      if (!alias) {
        return res.status(400).json({ error: 'Alias is required' });
      }

      // Check current alias count
      const userAliasesList = await db.select().from(userAliases).where(eq(userAliases.userId, req.user!.id));
      if (userAliasesList.length >= 3) {
        return res.status(400).json({ error: 'Limite di 3 alias raggiunto.' });
      }

      // Check for global duplicates
      const existing = await db.select().from(userAliases).where(eq(userAliases.alias, alias)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Alias già reclamato' });
      }

      const [newAlias] = await db.insert(userAliases).values({
        userId: req.user!.id,
        alias: alias,
        platform: 'challonge',
        isVerified: false
      }).returning();

      res.status(201).json(newAlias);
    } catch (error: any) {
      console.error('Error creating alias:', error);
      res.status(500).json({ error: 'Failed to create alias' });
    }
  });

  app.get('/api/user/aliases', requireAuth, async (req, res) => {
    try {
      const aliases = await db.select().from(userAliases).where(eq(userAliases.userId, req.user!.id));
      res.json(aliases);
    } catch (error: any) {
      console.error('Error fetching aliases:', error);
      res.status(500).json({ error: 'Failed to fetch aliases' });
    }
  });

  app.delete('/api/user/aliases/:id', requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      // Verify ownership
      const [alias] = await db.select().from(userAliases).where(and(eq(userAliases.id, id), eq(userAliases.userId, req.user!.id))).limit(1);
      if (!alias) {
        return res.status(404).json({ error: 'Alias not found or unauthorized' });
      }

      await db.delete(userAliases).where(eq(userAliases.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting alias:', error);
      res.status(500).json({ error: 'Failed to delete alias' });
    }
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

  // Link Challonge Account
  app.post('/api/user/link-challonge', requireAuth, async (req, res) => {
    try {
      const { username } = z.object({ username: z.string().min(1) }).parse(req.body);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });

      // If needed, verify against Challonge API here (optional per requirements)

      const updated = await storage.updateUserProfile(user.id, { challongeUsername: username } as any);
      const { password_hash: _, password: __, ...userWithoutPassword } = updated as any;
      res.json({ user: userWithoutPassword, message: 'Account Challonge collegato con successo' });
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Failed to link Challonge account' });
    }
  });

  // Link Challengermode Account (Manual)
  app.post('/api/user/link-challengermode', requireAuth, async (req, res) => {
    try {
      const { cmId, cmUsername } = z.object({ cmId: z.string().min(1), cmUsername: z.string().min(1) }).parse(req.body);

      // Check if ID is already taken by another user
      const existing = await db.select().from(users).where(eq(users.challengerId, cmId)).limit(1);
      if (existing.length > 0 && existing[0].id !== req.session.userId) {
        return res.status(409).json({ error: 'Questo account Challengermode è già collegato a un altro utente' });
      }

      const updated = await storage.updateUserProfile(req.session.userId!, {
        challengerId: cmId,
        challengermodeUsername: cmUsername
      } as any);

      const { password_hash: _, password: __, ...userWithoutPassword } = updated as any;
      res.json({ user: userWithoutPassword, message: 'Account Challengermode collegato con successo' });
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Failed to link Challengermode account' });
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
      const seasonRaw = String(req.query.season || '').trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';

      const validSortFields = ['score', 'first', 'second', 'third'];
      const sortBy = validSortFields.includes(sortByParam) ? sortByParam : 'score';

      // Build WHERE for both modes when search is present
      const buildSearchWhere = () => {
        if (search && search.trim()) {
          const searchTerm = `%${search.trim()}%`;
          return or(
            ilike(comboStats.blade, searchTerm),
            ilike(comboStats.assistBlade, searchTerm),
            ilike(comboStats.ratchet, searchTerm),
            ilike(comboStats.bit, searchTerm),
            ilike(comboStats.lockChip, searchTerm)
          );
        }
        return null;
      };

      if (isAllTime || !seasonRaw) {
        const sumScore = sql<number>`sum(${comboStats.punteggioTotale})`.mapWith(Number);
        const sumFirst = sql<number>`sum(${comboStats.primiPosti})`.mapWith(Number);
        const sumSecond = sql<number>`sum(${comboStats.secondiPosti})`.mapWith(Number);
        const sumThird = sql<number>`sum(${comboStats.terziPosti})`.mapWith(Number);

        let aggQuery = db
          .select({
            blade: comboStats.blade,
            assistBlade: comboStats.assistBlade,
            ratchet: comboStats.ratchet,
            bit: comboStats.bit,
            lockChip: comboStats.lockChip,
            punteggioTotale: sumScore,
            primiPosti: sumFirst,
            secondiPosti: sumSecond,
            terziPosti: sumThird,
          })
          .from(comboStats);

        const whereClause = buildSearchWhere();
        if (whereClause) {
          aggQuery = (aggQuery as any).where(whereClause);
        }

        aggQuery = aggQuery.groupBy(
          comboStats.blade,
          comboStats.assistBlade,
          comboStats.ratchet,
          comboStats.bit,
          comboStats.lockChip,
        );

        const orderFn = sortOrder === 'asc' ? asc : desc;
        const sortExpr = {
          score: sql`sum(${comboStats.punteggioTotale})`,
          first: sql`sum(${comboStats.primiPosti})`,
          second: sql`sum(${comboStats.secondiPosti})`,
          third: sql`sum(${comboStats.terziPosti})`,
        }[sortBy]!;

        const [topCombos, countResult] = await Promise.all([
          (aggQuery as any).orderBy(orderFn(sortExpr)).limit(limit).offset(offset),
          // Count of groups honoring the same search filter
          db.execute(sql`
            SELECT COUNT(*) AS c
            FROM (
              SELECT 1
              FROM combo_stats
              ${search && search.trim()
              ? sql`WHERE blade ILIKE ${'%' + search.trim() + '%'}
                       OR assist_blade ILIKE ${'%' + search.trim() + '%'}
                       OR ratchet ILIKE ${'%' + search.trim() + '%'}
                       OR bit ILIKE ${'%' + search.trim() + '%'}
                       OR lock_chip ILIKE ${'%' + search.trim() + '%'}`
              : sql``}
              GROUP BY blade, assist_blade, ratchet, bit, lock_chip
            ) t
          `),
        ]);

        const total = Number(((countResult.rows as any[])[0]?.c) || 0);
        const totalPages = Math.ceil(total / limit);

        return res.json({
          combos: topCombos,
          pagination: { page, limit, total, totalPages },
        });
      }

      let query = db.select().from(comboStats);
      let countQuery = db.select({ count: sql<number>`count(*)` }).from(comboStats);

      const whereClause = buildSearchWhere();
      if (whereClause) {
        query = (query as any).where(whereClause);
        countQuery = (countQuery as any).where(whereClause);
      }

      query = (query as any).where(eq(comboStats.season, seasonRaw));
      countQuery = (countQuery as any).where(eq(comboStats.season, seasonRaw));

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

  app.get('/api/stats/combos/by-key', async (req, res) => {
    try {
      const key = String(req.query.key || '').trim();
      if (!key) return res.status(400).json({ error: 'Missing key' });
      const parts = key.split('|');
      if (parts.length !== 5) return res.status(400).json({ error: 'Invalid key format' });
      const [blade, assistBlade, ratchet, bit, lockChip] = parts;

      const result = await db.execute(sql`
        WITH ranked AS (
          SELECT blade, assist_blade, ratchet, bit, lock_chip,
                 primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione,
                 ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank
          FROM combo_stats
        )
        SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
               primi_posti AS "primiPosti", secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti",
               punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione", rank
        FROM ranked
        WHERE blade = ${blade}
          AND assist_blade = ${assistBlade}
          AND ratchet = ${ratchet}
          AND bit = ${bit}
          AND lock_chip = ${lockChip}
        LIMIT 1
      `);

      const row = (result.rows as any[])[0];
      if (!row) return res.status(404).json({ error: 'Combo not found' });
      return res.json({
        combo: {
          blade: row.blade,
          assistBlade: row.assistBlade,
          ratchet: row.ratchet,
          bit: row.bit,
          lockChip: row.lockChip,
          primiPosti: row.primiPosti,
          secondiPosti: row.secondiPosti,
          terziPosti: row.terziPosti,
          punteggioTotale: row.punteggioTotale,
          dataCreazione: row.dataCreazione,
        }, rank: Number(row.rank)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch combo by key' });
    }
  });
  app.get('/api/stats/combos/by-slug', async (req, res) => {
    try {
      const slug = String(req.query.slug || '').trim();
      if (!slug) return res.status(400).json({ error: 'Missing slug' });
      const result = await db.execute(sql`
        WITH ranked AS (
          SELECT blade, assist_blade, ratchet, bit, lock_chip,
                 primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione,
                 ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank
          FROM combo_stats
        )
        SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
               primi_posti AS "primiPosti", secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti",
               punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione", rank
        FROM ranked
        WHERE concat_ws('-',
          CASE WHEN lower(lock_chip) <> 'none' THEN lower(regexp_replace(regexp_replace(trim(lock_chip), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) END,
          lower(regexp_replace(regexp_replace(trim(blade), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')),
          CASE WHEN lower(assist_blade) <> 'none' THEN lower(regexp_replace(regexp_replace(trim(assist_blade), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) END,
          CASE WHEN lower(ratchet) <> 'none' THEN lower(regexp_replace(regexp_replace(trim(ratchet), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) END,
          lower(regexp_replace(regexp_replace(trim(bit), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g'))
        ) = ${slug}
        LIMIT 1
      `);
      const row = (result.rows as any[])[0];
      if (!row) return res.status(404).json({ error: 'Combo not found' });
      return res.json({
        combo: {
          blade: row.blade,
          assistBlade: row.assistBlade,
          ratchet: row.ratchet,
          bit: row.bit,
          lockChip: row.lockChip,
          primiPosti: row.primiPosti,
          secondiPosti: row.secondiPosti,
          terziPosti: row.terziPosti,
          punteggioTotale: row.punteggioTotale,
          dataCreazione: row.dataCreazione,
        }, rank: Number(row.rank)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch combo by slug' });
    }
  });

  // Analytics Meta Endpoint (Proportional Scoring)
  app.get('/api/analytics/meta', async (req, res) => {
    try {
      const seasonRaw = String(req.query.season || '').trim();
      // If season param is missing or empty, default to "all" to match behavior if intended, or specific season.
      // Based on previous logic, usually we want a specific season or all.
      const platform = String(req.query.platform || 'all').trim().toLowerCase();

      let query = db.select().from(unifiedMetaView);

      const conditions = [];
      if (seasonRaw && seasonRaw.toLowerCase() !== 'all') {
        conditions.push(eq(unifiedMetaView.date, seasonRaw as any)); // Wait, unifiedMetaView has `date` but we might need filtering by season string if view doesn't have it?
        // View has `date` column. `determineSeason` is a helper. We can't filter by determined season continuously easily in SQL without a function.
        // BUT the prompt says "Mantieni i filtri season...". The view `unified_meta_view` was modified by USER in Step 826/827 but I didn't see `season` column added, only `participantCount`. 
        // Providing season filtering might require JS filtering if not in view.
        // Let's check schema again. unifiedMetaView has `date`.
      }
      if (platform && platform !== 'all') {
        conditions.push(eq(unifiedMetaView.platform, platform));
      }

      if (conditions.length > 0) {
        query = (query as any).where(and(...conditions));
      }

      const rows = await query;

      // In-memory aggregation
      const topBlades: any = {};
      const topRatchets: any = {};
      const topBits: any = {};
      const topCombos: any = {};
      // Helper for counts
      const countBlades: any = {};
      const countRatchets: any = {};
      const countBits: any = {};
      const countCombos: any = {};

      for (const row of rows) {
        // FILTER: Strict Top 3
        const rank = row.rank as number;
        if (!rank || rank > 4) continue;

        // Season Filter (in memory if needed)
        if (seasonRaw && seasonRaw.toLowerCase() !== 'all') {
          const d = row.date ? new Date(row.date) : null;
          if (!d || determineSeason(d) !== seasonRaw) continue;
        }

        // SCORING LOGIC
        let baseScore = 0;
        if (rank === 1) baseScore = 10;
        else if (rank === 2) baseScore = 7;
        else if (rank === 3) baseScore = 5;
        else if (rank === 4) baseScore = 3;

        // Multiplier
        let multiplier = (row.participantCount as number) || 0;
        // Safety: if 0 participants, 0 points? Yes.

        const points = baseScore * multiplier;

        if (points === 0) continue;

        // Aggregation
        if (row.blade) {
          const b = row.blade;
          topBlades[b] = (topBlades[b] || 0) + points;
          countBlades[b] = (countBlades[b] || 0) + 1;
        }
        if (row.ratchet) {
          const r = row.ratchet;
          topRatchets[r] = (topRatchets[r] || 0) + points;
          countRatchets[r] = (countRatchets[r] || 0) + 1;
        }
        if (row.bit) {
          const b = row.bit;
          topBits[b] = (topBits[b] || 0) + points;
          countBits[b] = (countBits[b] || 0) + 1;
        }

        // Combo Key
        if (row.blade && row.ratchet && row.bit) {
          const assist = (row.assistBlade && row.assistBlade !== 'None') ? row.assistBlade : null;
          const chip = (row.lockChip && row.lockChip !== 'None') ? row.lockChip : null;
          // Construct key: Blade + Assist + Ratchet + Bit + Chip
          // "Blade (Assist) - Ratchet - Bit (Chip)"
          let key = row.blade;
          if (assist) key += ` (${assist})`;
          key += ` ${row.ratchet} ${row.bit}`;
          if (chip) key += ` (${chip})`;

          // Or use object key? The requirement says "return list". 
          // Usually we return structured data. Let's return the key + components in result.
          topCombos[key] = (topCombos[key] || 0) + points;
          countCombos[key] = (countCombos[key] || 0) + 1;
        }
      }

      // Formatting
      const formatList = (pointsMap: any, countsMap: any) => {
        return Object.entries(pointsMap).map(([name, totalPoints]) => ({
          name,
          totalPoints: Number(totalPoints),
          count: countsMap[name] || 0
        })).sort((a, b) => b.totalPoints - a.totalPoints);
      };

      res.json({
        topBlades: formatList(topBlades, countBlades),
        topRatchets: formatList(topRatchets, countRatchets),
        topBits: formatList(topBits, countBits),
        topCombos: formatList(topCombos, countCombos) // Simple string key for now
      });

    } catch (error) {
      console.error('Analytics Meta Error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics meta' });
    }
  });
  app.get('/api/stats/top/components', async (req, res) => {
    try {
      const seasonRaw = String(req.query.season || '').trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';
      const targetSeason = seasonRaw || 'Off Season 2025';
      const result = await db.execute(
        isAllTime
          ? sql`
            SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
            FROM (
              SELECT
                component_type,
                name,
                SUM(primi_posti) AS primi_posti,
                SUM(secondi_posti) AS secondi_posti,
                SUM(terzi_posti) AS terzi_posti,
                SUM(punteggio_totale) AS punteggio_totale,
                ROW_NUMBER() OVER (
                  PARTITION BY component_type
                  ORDER BY SUM(primi_posti) DESC, SUM(punteggio_totale) DESC, name ASC
                ) AS rn
              FROM top_component_snapshot
              GROUP BY component_type, name
            ) t
            WHERE rn = 1
          `
          : sql`
            SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
            FROM (
              SELECT
                component_type,
                name,
                primi_posti,
                secondi_posti,
                terzi_posti,
                punteggio_totale,
                ROW_NUMBER() OVER (
                  PARTITION BY component_type
                  ORDER BY primi_posti DESC, punteggio_totale DESC, name ASC
                ) AS rn
              FROM top_component_snapshot
              WHERE season = ${targetSeason}
            ) t
            WHERE rn = 1
          `
      );

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

  app.post('/api/tournaments/claim', requireAuth, async (req, res) => {
    try {
      const BodySchema = z.object({
        tournamentId: z.string().min(1).max(64).transform((s) => s.trim()),
        combos: z.array(tournamentComboSchema).length(3),
        rank: z.number().min(1).max(9999).optional(), // Added rank
        platform: z.enum(['challengermode', 'challonge']).optional().default('challengermode') // Added platform
      });
      const parsed = BodySchema.parse(req.body);

      if (parsed.rank && parsed.rank > 3) {
        return res.status(400).json({ error: "Only Top 3 ranks are allowed" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: 'User not found' });

      const platform = parsed.platform || 'challengermode';

      if (platform === 'challonge') {
        // --- CHALLONGE CLAIM LOGIC ---
        // Verify User is authenticated (done by requireAuth)
        // Verify Tournament exists in Challonge table and get tournament name
        const tCheck = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${parsed.tournamentId}`);
        if (tCheck.rows.length === 0) return res.status(404).json({ error: 'Torneo Challonge non trovato' });

        // Extract tournament name from JSONB data
        const tournamentData = tCheck.rows[0]?.data as any;
        const tournamentName = tournamentData?.name || tournamentData?.tournament?.name || null;

        // Transaction: Delete existing -> Insert New
        await db.transaction((async (tx: any) => {
          await tx.execute(sql`DELETE FROM challonge_reported_combos WHERE tournament_id = ${parsed.tournamentId} AND user_id = ${user.id}`);

          for (let i = 0; i < parsed.combos.length; i++) {
            const c = parsed.combos[i];
            await tx.insert(challongeReportedCombos).values({
              userId: user.id,
              tournamentId: parsed.tournamentId,
              tournamentName: tournamentName,
              comboNumber: i + 1,
              blade: c.blade,
              ratchet: c.ratchet,
              bit: c.bit,
              assistBlade: c.assistBlade || null,
              lockChip: c.lockChip || null,
              rank: parsed.rank || 0,
            } as any); // Type assertion needed until schema types update fully propagates
          }
        }) as any); // Type assertion needed until schema types update fully propagates

        return res.json({ success: true, message: 'Deck Challonge registrato' });
      } else {
        // --- CHALLENGERMODE CLAIM LOGIC (Existing) ---
        const challengerId = (user as any)?.challengerId as string | undefined;
        if (!challengerId) return res.status(400).json({ error: 'Devi effettuare il login con Challengermode' });

        const verified = await checkTournamentPlacement(parsed.tournamentId, challengerId);
        if (!verified) return res.status(403).json({ error: 'Non risulti nella Top 4 di questo torneo' });

        // ... existing CM logic ...
        // I will copy-paste existing logic here but reusing 'parsed' variables

        await db.insert(cmPlayers).values({ id: challengerId, nickname: user?.displayName || challengerId, avatar: null as any }).onConflictDoNothing();

        let placement: number | null = null;
        let totalParticipants: number | null = null;
        let tournamentDate: Date | null = null;
        try {
          const detail = await fetchTournamentDetail(parsed.tournamentId);
          const startedAtStr = detail?.schedule?.startedAt as string | undefined;
          if (startedAtStr) {
            const dateOnly = String(startedAtStr).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
              tournamentDate = new Date(dateOnly);
            }
          }
          const userCount = detail?.attendance?.signups?.userCount as number | undefined;
          if (typeof userCount === 'number' && userCount > 0) totalParticipants = userCount;
          const lineups: any[] = detail?.attendance?.signups?.lineups || [];
          const found = lineups.find(l => Array.isArray(l.members) && l.members.some((m: any) => m?.user?.userId === challengerId));
          const disp = found?.placement?.displayPlacement as string | undefined;
          if (disp) {
            const p = parseInt(String(disp), 10);
            if (!Number.isNaN(p)) placement = p;
          }
        } catch { }

        await db.execute(sql`DELETE FROM external_player_combos WHERE tournament_id = ${parsed.tournamentId} AND player_id = ${challengerId}`);

        const seasonVal = tournamentDate ? determineSeason(tournamentDate) : determineSeason(new Date());
        const values = parsed.combos.map((c, idx) => ({
          tournamentId: parsed.tournamentId,
          playerId: challengerId,
          comboNumber: idx + 1,
          blade: c.blade,
          assistBlade: c.assistBlade,
          ratchet: c.ratchet,
          bit: c.bit,
          lockChip: c.lockChip,
          placement: placement ?? null,
          totalParticipants: totalParticipants ?? null,
          tournamentDate: tournamentDate ?? null,
          season: seasonVal,
        }));
        const inserted = await db.insert(externalPlayerCombos).values(values).returning();

        if (tournamentDate) {
          const baseCombos = inserted.map((r) => ({
            blade: r.blade,
            assistBlade: r.assistBlade,
            ratchet: r.ratchet,
            bit: r.bit,
            lockChip: r.lockChip,
            season: seasonVal,
          }));
          if (baseCombos.length > 0) {
            await db.insert(comboStats).values(baseCombos as any).onConflictDoNothing();
          }

          const cmValues = inserted.map((r, idx) => ({
            tournamentId: parsed.tournamentId,
            playerId: challengerId,
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
            target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any,
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

        if (placement && totalParticipants && placement >= 1 && placement <= 3 && totalParticipants > 0) {
          for (const r of inserted) {
            await processExternalCombo({
              blade: r.blade,
              assistBlade: r.assistBlade,
              ratchet: r.ratchet,
              bit: r.bit,
              lockChip: r.lockChip,
              season: seasonVal,
              placement,
              totalParticipants,
            });
          }
        }

        try {
          const { recalculateRegionalStatsForTournament } = await import('./lib/regionalScoring');
          await recalculateRegionalStatsForTournament(parsed.tournamentId);
        } catch { }

        res.json({ success: true });
      }
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Invalid request' });
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
      const season = req.query.season as string | undefined;

      // Determine if we need aggregation (All Time view)
      const isAllTime = !season || season.toLowerCase() === 'all time' || season.toLowerCase() === 'all-time';

      let rows: any[] = [];

      if (type === 'blade') {
        if (isAllTime) {
          // Aggregate all seasons
          rows = await db.select({
            blade: bladeStats.blade,
            punteggioTotale: sql<number>`sum(${bladeStats.punteggioTotale})`.as('punteggioTotale'),
            primiPosti: sql<number>`sum(${bladeStats.primiPosti})`.as('primiPosti'),
            secondiPosti: sql<number>`sum(${bladeStats.secondiPosti})`.as('secondiPosti'),
            terziPosti: sql<number>`sum(${bladeStats.terziPosti})`.as('terziPosti'),
          })
            .from(bladeStats)
            .groupBy(bladeStats.blade)
            .orderBy(desc(sql`sum(${bladeStats.punteggioTotale})`))
            .limit(limit);
        } else {
          // Filter by specific season
          rows = await db.select()
            .from(bladeStats)
            .where(eq(bladeStats.season, season))
            .orderBy(desc(bladeStats.punteggioTotale))
            .limit(limit);
        }
      } else if (type === 'ratchet') {
        if (isAllTime) {
          // Aggregate all seasons
          rows = await db.select({
            ratchet: ratchetStats.ratchet,
            punteggioTotale: sql<number>`sum(${ratchetStats.punteggioTotale})`.as('punteggioTotale'),
            primiPosti: sql<number>`sum(${ratchetStats.primiPosti})`.as('primiPosti'),
            secondiPosti: sql<number>`sum(${ratchetStats.secondiPosti})`.as('secondiPosti'),
            terziPosti: sql<number>`sum(${ratchetStats.terziPosti})`.as('terziPosti'),
          })
            .from(ratchetStats)
            .groupBy(ratchetStats.ratchet)
            .orderBy(desc(sql`sum(${ratchetStats.punteggioTotale})`))
            .limit(limit);
        } else {
          // Filter by specific season
          rows = await db.select()
            .from(ratchetStats)
            .where(eq(ratchetStats.season, season))
            .orderBy(desc(ratchetStats.punteggioTotale))
            .limit(limit);
        }
      } else if (type === 'bit') {
        if (isAllTime) {
          // Aggregate all seasons
          rows = await db.select({
            bit: bitStats.bit,
            punteggioTotale: sql<number>`sum(${bitStats.punteggioTotale})`.as('punteggioTotale'),
            primiPosti: sql<number>`sum(${bitStats.primiPosti})`.as('primiPosti'),
            secondiPosti: sql<number>`sum(${bitStats.secondiPosti})`.as('secondiPosti'),
            terziPosti: sql<number>`sum(${bitStats.terziPosti})`.as('terziPosti'),
          })
            .from(bitStats)
            .groupBy(bitStats.bit)
            .orderBy(desc(sql`sum(${bitStats.punteggioTotale})`))
            .limit(limit);
        } else {
          // Filter by specific season
          rows = await db.select()
            .from(bitStats)
            .where(eq(bitStats.season, season))
            .orderBy(desc(bitStats.punteggioTotale))
            .limit(limit);
        }
      } else {
        return res.status(400).json({ error: 'Invalid type. Use blade, ratchet, or bit.' });
      }

      res.json({ items: rows, type, limit, season: season || 'All Time' });
    } catch (error) {
      console.error('Leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  // Player Leaderboard - Aggregated or filtered by platform
  app.get('/api/stats/leaderboard', async (req, res) => {
    try {
      const platform = req.query.platform as string | undefined;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 50;

      if (platform && platform !== 'challengermode' && platform !== 'challonge') {
        return res.status(400).json({ error: 'Invalid platform. Use challengermode or challonge.' });
      }

      let rows: any[] = [];

      if (platform) {
        // Filter by specific platform
        rows = await db.select()
          .from(playerPlatformStats)
          .where(eq(playerPlatformStats.platform, platform))
          .orderBy(desc(playerPlatformStats.totalPoints))
          .limit(limit);
      } else {
        // Aggregated view (all platforms combined)
        rows = await db.select()
          .from(playerLeaderboardView)
          .orderBy(desc(playerLeaderboardView.totalPoints))
          .limit(limit);
      }

      const players = rows.map((r: any) => ({
        id: r.playerId || r.nickname,
        nickname: r.nickname,
        avatar: r.avatar,
        totalPoints: Number(r.totalPoints || 0),
        tournamentsPlayed: Number(r.tournamentsPlayed || 0),
        wins: Number(r.wins || 0),
        top3Finishes: Number(r.top3Finishes || 0),
        platform: r.platform || 'mixed'
      }));

      res.json({ players });
    } catch (error) {
      console.error('Player leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch player leaderboard' });
    }
  });

  // Player Profile - Platform breakdown
  app.get('/api/stats/player/:nickname', async (req, res) => {
    try {
      const nickname = req.params.nickname;
      if (!nickname) {
        return res.status(400).json({ error: 'Nickname is required' });
      }

      const platformStats = await db.select()
        .from(playerPlatformStats)
        .where(eq(playerPlatformStats.nickname, nickname))
        .orderBy(desc(playerPlatformStats.totalPoints));

      if (platformStats.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }

      res.json(platformStats);
    } catch (error) {
      console.error('Player profile error:', error);
      res.status(500).json({ error: 'Failed to fetch player profile' });
    }
  });

  // Unified Player Profile - By Nickname (supports both CM and Challonge)
  app.get('/api/players/by-nickname/:nickname', async (req, res) => {
    try {
      const nickname = String(req.params.nickname || '').trim();
      if (!nickname) return res.status(400).json({ error: 'Missing nickname' });

      const seasonRaw = String((req.query.season ?? 'Off Season 2025') as string).trim();
      const season = seasonRaw || 'Off Season 2025';

      // Try to find player in both CM and Challonge
      const cmPlayerRows = await db.select().from(cmPlayers).where(eq(cmPlayers.nickname, nickname)).limit(1);
      const challongePlayerRows = await db.select().from(challongePlayers).where(eq(challongePlayers.nickname, nickname)).limit(1);

      const cmPlayer = cmPlayerRows[0] || null;
      const challongePlayer = challongePlayerRows[0] || null;

      if (!cmPlayer && !challongePlayer) {
        return res.status(404).json({ error: 'Player not found' });
      }

      // Get platform stats for this player (with top-3 calculation)
      const platformStats = await db.select()
        .from(playerPlatformStats)
        .where(eq(playerPlatformStats.nickname, nickname))
        .orderBy(desc(playerPlatformStats.totalPoints));

      // Calculate top-3 finishes for each platform
      const platformStatsWithTop3 = await Promise.all(platformStats.map(async (stat) => {
        let top3Count = 0;

        if (stat.platform === 'challengermode' && cmPlayer) {
          const top3Query = await db.execute(sql`
            SELECT COUNT(DISTINCT tournament_id) as top3_count
            FROM cm_match_results
            WHERE player_id = ${cmPlayer.id} AND piazzamento <= 3
          `);
          top3Count = Number(top3Query.rows[0]?.top3_count || 0);
        } else if (stat.platform === 'challonge') {
          // Get user for Challonge
          const userRows = await db.select()
            .from(users)
            .where(eq(users.challongeUsername, nickname))
            .limit(1);

          if (userRows.length > 0) {
            const user = userRows[0];
            const top3Query = await db.execute(sql`
              SELECT COUNT(DISTINCT tournament_id) as top3_count
              FROM challonge_reported_combos
              WHERE user_id = ${user.id} AND rank <= 3
            `);
            top3Count = Number(top3Query.rows[0]?.top3_count || 0);
          }
        }

        return {
          platform: stat.platform,
          totalPoints: stat.totalPoints,
          tournamentsPlayed: stat.tournamentsPlayed,
          top3Finishes: top3Count,
        };
      }));

      const totalPoints = platformStatsWithTop3.reduce((sum, stat) => sum + stat.totalPoints, 0);

      // Get most used combo from CM if available
      let mostUsedCombo = null;
      if (cmPlayer) {
        let comboQuery;
        if (season) {
          comboQuery = await db.execute(sql`
            SELECT blade, assist_blade, ratchet, bit, lock_chip,
                   COUNT(*) AS use_count,
                   COALESCE(SUM(
                     CASE placement
                       WHEN 1 THEN 10
                       WHEN 2 THEN 7
                       WHEN 3 THEN 5
                       ELSE 0
                     END * total_participants
                   ), 0) AS points
            FROM external_player_combos
            WHERE player_id = ${cmPlayer.id} AND season = ${season}
            GROUP BY blade, assist_blade, ratchet, bit, lock_chip
            ORDER BY use_count DESC, points DESC
            LIMIT 1;
          `);
        } else {
          comboQuery = await db.execute(sql`
            SELECT blade, assist_blade, ratchet, bit, lock_chip,
                   COUNT(*) AS use_count,
                   COALESCE(SUM(
                     CASE placement
                       WHEN 1 THEN 10
                       WHEN 2 THEN 7
                       WHEN 3 THEN 5
                       ELSE 0
                     END * total_participants
                   ), 0) AS points
            FROM external_player_combos
            WHERE player_id = ${cmPlayer.id}
            GROUP BY blade, assist_blade, ratchet, bit, lock_chip
            ORDER BY use_count DESC, points DESC
            LIMIT 1;
          `);
        }
        const muc = comboQuery.rows[0] || null;
        if (muc) {
          mostUsedCombo = {
            blade: String(muc.blade || ''),
            assistBlade: String(muc.assist_blade || ''),
            ratchet: String(muc.ratchet || ''),
            bit: String(muc.bit || ''),
            lockChip: String(muc.lock_chip || ''),
            count: Number(muc.use_count || 0),
            points: Number(muc.points || 0),
          };
        }
      }

      // Get favorite blade from CM if available
      let favoriteBlade = null;
      if (cmPlayer) {
        let bladeQuery;
        if (season) {
          bladeQuery = await db.execute(sql`
            SELECT blade,
                   COUNT(*) AS use_count,
                   COALESCE(SUM(
                     CASE placement
                       WHEN 1 THEN 10
                       WHEN 2 THEN 7
                       WHEN 3 THEN 5
                       ELSE 0
                     END * total_participants
                   ), 0) AS points
            FROM external_player_combos
            WHERE player_id = ${cmPlayer.id} AND season = ${season}
            GROUP BY blade
            ORDER BY use_count DESC, points DESC
            LIMIT 1;
          `);
        } else {
          bladeQuery = await db.execute(sql`
            SELECT blade,
                   COUNT(*) AS use_count,
                   COALESCE(SUM(
                     CASE placement
                       WHEN 1 THEN 10
                       WHEN 2 THEN 7
                       WHEN 3 THEN 5
                       ELSE 0
                     END * total_participants
                   ), 0) AS points
            FROM external_player_combos
            WHERE player_id = ${cmPlayer.id}
            GROUP BY blade
            ORDER BY use_count DESC, points DESC
            LIMIT 1;
          `);
        }
        const fb = bladeQuery.rows[0] || null;
        if (fb) {
          favoriteBlade = {
            blade: String(fb.blade || ''),
            count: Number(fb.use_count || 0),
            points: Number(fb.points || 0),
          };
        }
      }

      // Get most used combo from Challonge if available
      let challongeMostUsedCombo = null;
      const userRows = await db.select()
        .from(users)
        .where(eq(users.challongeUsername, nickname))
        .limit(1);

      if (userRows.length > 0) {
        const user = userRows[0];
        const challongeComboQuery = await db.execute(sql`
          SELECT blade, assist_blade, ratchet, bit, lock_chip,
                 COUNT(*) AS use_count
          FROM challonge_reported_combos
          WHERE user_id = ${user.id}
          GROUP BY blade, assist_blade, ratchet, bit, lock_chip
          ORDER BY use_count DESC
          LIMIT 1;
        `);
        const chc = challongeComboQuery.rows[0] || null;
        if (chc) {
          challongeMostUsedCombo = {
            blade: String(chc.blade || ''),
            assistBlade: String(chc.assist_blade || ''),
            ratchet: String(chc.ratchet || ''),
            bit: String(chc.bit || ''),
            lockChip: String(chc.lock_chip || ''),
            count: Number(chc.use_count || 0),
            points: 0, // Challonge doesn't have points calculation yet
          };
        }
      }

      // Get favorite blade from Challonge if available
      let challongeFavoriteBlade = null;
      if (userRows.length > 0) {
        const user = userRows[0];
        let challongeBladeQuery;
        if (season) {
          challongeBladeQuery = await db.execute(sql`
            SELECT blade, COUNT(*) AS use_count
            FROM challonge_reported_combos c
            JOIN challonge_match_results m ON c.tournament_id = m.tournament_id
            WHERE c.user_id = ${user.id}
              AND m.data->>'season' = ${season}
            GROUP BY blade
            ORDER BY use_count DESC
            LIMIT 1;
          `);
        } else {
          challongeBladeQuery = await db.execute(sql`
            SELECT blade, COUNT(*) AS use_count
            FROM challonge_reported_combos
            WHERE user_id = ${user.id}
            GROUP BY blade
            ORDER BY use_count DESC
            LIMIT 1;
          `);
        }
        const chb = challongeBladeQuery.rows[0] || null;
        if (chb) {
          challongeFavoriteBlade = {
            blade: String(chb.blade || ''),
            count: Number(chb.use_count || 0),
            points: 0, // Challonge doesn't have points calculation yet
          };
        }
      }

      // Use Challonge combo if CM combo is not available
      if (!mostUsedCombo && challongeMostUsedCombo) {
        mostUsedCombo = challongeMostUsedCombo;
      }

      // Use Challonge blade if CM blade is not available
      if (!favoriteBlade && challongeFavoriteBlade) {
        favoriteBlade = challongeFavoriteBlade;
      }

      // Return unified profile
      res.json({
        player: {
          nickname,
          avatar: cmPlayer?.avatar || challongePlayer?.avatar || null,
          platforms: platformStatsWithTop3.map(s => s.platform),
        },
        stats: {
          totalPoints,
          mostUsedCombo,
          favoriteBlade,
        },
        platformStats: platformStatsWithTop3,
      });
    } catch (error) {
      console.error('Unified player profile error:', error);
      res.status(500).json({ error: 'Failed to fetch player profile' });
    }
  });

  // Unified Player Tournaments - By Nickname (supports both CM and Challonge)
  app.get('/api/players/by-nickname/:nickname/tournaments', async (req, res) => {
    try {
      const nickname = String(req.params.nickname || '').trim();
      if (!nickname) return res.status(400).json({ error: 'Missing nickname' });

      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const season = seasonRaw || '';

      // Helper function for Challonge Scoring (Tiering Dinamico) based on ANTIGRAVITY_WORKFLOW.md
      const calculateChallongePoints = (rank: number | null, total: number | null): number => {
        if (!rank || !total) return 0;

        // 49-64+ Players
        if (total >= 49) {
          if (rank === 1) return 400;
          if (rank === 2) return 280;
          if (rank === 3) return 160;
          if (rank === 4) return 120;
          if (rank >= 5 && rank <= 8) return 90;
          if (rank >= 9 && rank <= 12) return 65;
          if (rank >= 13 && rank <= 16) return 50;
          if (rank >= 17 && rank <= 24) return 40;
          if (rank >= 25 && rank <= 32) return 30;
          if (rank >= 33 && rank <= 48) return 15;
          if (rank >= 49) return 10;
        }
        // 33-48 Players
        else if (total >= 33) {
          if (rank === 1) return 350;
          if (rank === 2) return 240;
          if (rank === 3) return 140;
          if (rank === 4) return 110;
          if (rank >= 5 && rank <= 8) return 80;
          if (rank >= 9 && rank <= 12) return 55;
          if (rank >= 13 && rank <= 16) return 40;
          if (rank >= 17 && rank <= 24) return 30;
          if (rank >= 25 && rank <= 32) return 15;
          if (rank >= 33) return 10;
        }
        // 25-32 Players
        else if (total >= 25) {
          if (rank === 1) return 300;
          if (rank === 2) return 200;
          if (rank === 3) return 120;
          if (rank === 4) return 90;
          if (rank >= 5 && rank <= 8) return 70;
          if (rank >= 9 && rank <= 12) return 45;
          if (rank >= 13 && rank <= 16) return 30;
          if (rank >= 17 && rank <= 24) return 15;
          if (rank >= 25) return 10;
        }
        // 17-24 Players
        else if (total >= 17) {
          if (rank === 1) return 250;
          if (rank === 2) return 160;
          if (rank === 3) return 100;
          if (rank === 4) return 80;
          if (rank >= 5 && rank <= 8) return 60;
          if (rank >= 9 && rank <= 12) return 30;
          if (rank >= 13 && rank <= 16) return 15;
          if (rank >= 17) return 10;
        }
        // 13-16 Players
        else if (total >= 13) {
          if (rank === 1) return 200;
          if (rank === 2) return 120;
          if (rank === 3) return 80;
          if (rank === 4) return 60;
          if (rank >= 5 && rank <= 8) return 30;
          if (rank >= 9 && rank <= 12) return 15;
          if (rank >= 13) return 10;
        }
        // 8-12 Players
        else if (total >= 8) {
          if (rank === 1) return 150;
          if (rank === 2) return 80;
          if (rank === 3) return 60;
          if (rank === 4) return 40;
          if (rank >= 5 && rank <= 8) return 20;
          if (rank >= 9) return 10;
        }
        // 6-7 Players
        else if (total >= 6) {
          if (rank === 1) return 100;
          if (rank === 2) return 70;
          if (rank === 3) return 50;
          if (rank === 4) return 30;
          if (rank >= 5) return 10;
        }

        return 0;
      };

      // Try to find player in both CM and Challonge
      const cmPlayerRows = await db.select().from(cmPlayers).where(eq(cmPlayers.nickname, nickname)).limit(1);
      const cmPlayer = cmPlayerRows[0] || null;

      const tournaments: any[] = [];

      // Get CM tournaments if player exists in CM
      if (cmPlayer) {
        let cmTournamentsQuery;
        if (season) {
          cmTournamentsQuery = await db.execute(sql`
            SELECT
              tournament_id AS tournament_id,
              MAX(data_torneo) AS date,
              MIN(piazzamento) AS best_placement,
              SUM(punti_guadagnati) AS total_points,
              COUNT(*) AS combo_count,
              'challengermode' AS platform
            FROM cm_match_results
            WHERE player_id = ${cmPlayer.id} AND season = ${season}
            GROUP BY tournament_id
            ORDER BY date DESC
            LIMIT 25;
          `);
        } else {
          cmTournamentsQuery = await db.execute(sql`
            SELECT
              tournament_id AS tournament_id,
              MAX(data_torneo) AS date,
              MIN(piazzamento) AS best_placement,
              SUM(punti_guadagnati) AS total_points,
              COUNT(*) AS combo_count,
              'challengermode' AS platform
            FROM cm_match_results
            WHERE player_id = ${cmPlayer.id}
            GROUP BY tournament_id
            ORDER BY date DESC
            LIMIT 25;
          `);
        }

        const cmTournaments = await Promise.all((cmTournamentsQuery.rows || []).map(async (r: any) => {
          try {
            const detail = await fetchTournamentDetail(String(r.tournament_id));
            const name = detail?.name || null;
            const startedAt = detail?.schedule?.startedAt as string | undefined;
            const dateFromDetail = startedAt ? String(startedAt).slice(0, 10) : null;
            return {
              tournamentId: String(r.tournament_id),
              date: r.date ? String(r.date) : dateFromDetail,
              name: name || null,
              bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
              totalPoints: Number(r.total_points || 0),
              comboCount: Number(r.combo_count || 0),
              platform: 'challengermode',
            };
          } catch {
            return {
              tournamentId: String(r.tournament_id),
              date: r.date ? String(r.date) : null,
              name: null,
              bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
              totalPoints: Number(r.total_points || 0),
              comboCount: Number(r.combo_count || 0),
              platform: 'challengermode',
            };
          }
        }));

        tournaments.push(...cmTournaments);
      }

      // Get Challonge tournaments
      // Case 1: Linked via user account
      const userRows = await db.select()
        .from(users)
        .where(eq(users.challongeUsername, nickname))
        .limit(1);

      if (userRows.length > 0) {
        const user = userRows[0];
        let challongeTournamentsQuery;

        // We JOIN with challonge_match_results to get participants count
        const baseQueryText = `
            SELECT
              c.tournament_id,
              MAX(c.tournament_name) AS tournament_name,
              MIN(c.rank) AS best_placement,
              COUNT(DISTINCT c.id) AS combo_count, -- count combo entries
              'challonge' AS platform,
              MAX(c.created_at) AS date,
              COALESCE(
                  NULLIF((m.data->>'participants_count')::int, 0),
                  NULLIF((m.data->>'total_players')::int, 0),
                  jsonb_array_length(m.data->'standings')
              ) as total_participants
            FROM challonge_reported_combos c
            LEFT JOIN challonge_match_results m ON c.tournament_id = m.tournament_id
            WHERE c.user_id = $1
            ${season ? 'AND c.season = $2' : ''}
            GROUP BY c.tournament_id, m.data
            ORDER BY date DESC
            LIMIT 25;
        `;

        if (season) {
          challongeTournamentsQuery = await db.execute(sql`
                SELECT
                c.tournament_id,
                MAX(c.tournament_name) AS tournament_name,
                MIN(c.rank) AS best_placement,
                COUNT(DISTINCT c.id) AS combo_count,
                'challonge' AS platform,
                MAX(c.created_at) AS date,
                COALESCE(
                    NULLIF((m.data->>'participants_count')::int, 0),
                    NULLIF((m.data->>'total_players')::int, 0),
                    jsonb_array_length(m.data->'standings')
                ) as total_participants
                FROM challonge_reported_combos c
                LEFT JOIN challonge_match_results m ON c.tournament_id = m.tournament_id
                WHERE c.user_id = ${user.id} AND c.season = ${season}
                GROUP BY c.tournament_id, m.data
                ORDER BY date DESC
                LIMIT 25;
            `);
        } else {
          challongeTournamentsQuery = await db.execute(sql`
                SELECT
                c.tournament_id,
                MAX(c.tournament_name) AS tournament_name,
                MIN(c.rank) AS best_placement,
                COUNT(DISTINCT c.id) AS combo_count,
                'challonge' AS platform,
                MAX(c.created_at) AS date,
                COALESCE(
                    NULLIF((m.data->>'participants_count')::int, 0),
                    NULLIF((m.data->>'total_players')::int, 0),
                    jsonb_array_length(m.data->'standings')
                ) as total_participants
                FROM challonge_reported_combos c
                LEFT JOIN challonge_match_results m ON c.tournament_id = m.tournament_id
                WHERE c.user_id = ${user.id}
                GROUP BY c.tournament_id, m.data
                ORDER BY date DESC
                LIMIT 25;
            `);
        }

        const challongeTournaments = (challongeTournamentsQuery.rows || []).map((r: any) => ({
          tournamentId: String(r.tournament_id),
          date: r.date ? String(r.date).slice(0, 10) : null,
          name: r.tournament_name ? String(r.tournament_name) : null,
          bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
          totalPoints: calculateChallongePoints(Number(r.best_placement), Number(r.total_participants)),
          comboCount: Number(r.combo_count || 0),
          platform: 'challonge',
        }));

        tournaments.push(...challongeTournaments);
      } else {
        // Case 2: Ghost Player (Not linked to a user, but present in challonge_match_results)
        // We look into the 'data' blob of all Challonge tournaments
        const ghostToursQuery = await db.execute(sql`
          SELECT 
            c.tournament_id,
            c.data->>'tournament_name' as tournament_name,
            c.data->>'start_date' as date,
            (s->>'rank')::int as rank,
            COALESCE(
              NULLIF((c.data->>'participants_count')::int, 0), 
              NULLIF((c.data->>'total_players')::int, 0), 
              jsonb_array_length(c.data->'standings')
            ) as total_participants
          FROM challonge_match_results c,
          jsonb_array_elements(c.data->'standings') as s
          WHERE COALESCE(s->'participant'->>'name', s->>'name', s->'participant'->>'display_name') = ${nickname}
          ORDER BY c.data->>'start_date' DESC
          LIMIT 50;
        `);

        if (ghostToursQuery.rows.length > 0) {
          const ghostTournaments = ghostToursQuery.rows.map((r: any) => {
            const rank = r.rank;
            const total = r.total_participants;
            const points = calculateChallongePoints(rank, total);

            return {
              tournamentId: String(r.tournament_id),
              date: r.date ? String(r.date).slice(0, 10) : null,
              name: r.tournament_name || `Torneo ${r.tournament_id}`,
              bestPlacement: rank,
              totalPoints: points,
              comboCount: 0,
              platform: 'challonge',
            };
          });
          tournaments.push(...ghostTournaments);
        }
      }

      // Sort all tournaments by date
      tournaments.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      res.json({ tournaments: tournaments.slice(0, 50) });
    } catch (error) {
      console.error('Unified player tournaments error:', error);
      res.status(500).json({ error: 'Failed to fetch player tournaments' });
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

      // Check limit: max 20 combos per user
      const MAX_COMBOS = 20;
      const [existingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(favoriteCombos)
        .where(eq(favoriteCombos.userId, comboData.userId));

      if (Number(existingCount?.count || 0) >= MAX_COMBOS) {
        return res.status(400).json({ error: `You can only save up to ${MAX_COMBOS} combos. Delete a combo to add a new one.` });
      }

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

      // Check limit: max 20 decks per user
      const MAX_DECKS = 20;
      const [existingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(favoriteDecks)
        .where(eq(favoriteDecks.userId, req.session.userId!));

      if (Number(existingCount?.count || 0) >= MAX_DECKS) {
        return res.status(400).json({ error: `You can only save up to ${MAX_DECKS} decks. Delete a deck to add a new one.` });
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
        .groupBy(bladeStats.blade)
        .orderBy(asc(bladeStats.blade));

      const assistBlades = await db.select({ name: assistBladeStats.assistBlade })
        .from(assistBladeStats)
        .groupBy(assistBladeStats.assistBlade)
        .orderBy(asc(assistBladeStats.assistBlade));

      const ratchets = await db.select({ name: ratchetStats.ratchet })
        .from(ratchetStats)
        .groupBy(ratchetStats.ratchet)
        .orderBy(asc(ratchetStats.ratchet));

      const bits = await db.select({ name: bitStats.bit, isRatchetLess: bitStats.isRatchetLess })
        .from(bitStats)
        .groupBy(bitStats.bit, bitStats.isRatchetLess)
        .orderBy(asc(bitStats.bit));

      const lockChips = await db.select({ name: lockChipStats.lockChip })
        .from(lockChipStats)
        .groupBy(lockChipStats.lockChip)
        .orderBy(asc(lockChipStats.lockChip));

      // Filter out None/empty values and sort alphabetically
      res.json({
        blades: blades.map((b: { name: string }) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        assistBlades: assistBlades.map((b: { name: string }) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        ratchets: ratchets.map((b: { name: string }) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        bits: bits
          .filter((b: { name: string; isRatchetLess: boolean }) => b.name && b.name.toUpperCase() !== 'NONE' && b.name !== '-')
          .map((b: { name: string; isRatchetLess: boolean }) => ({ name: b.name, isRatchetLess: !!b.isRatchetLess })),
        lockChips: lockChips.map((b: { name: string }) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
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
        return rows.map((r: any) => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip }));
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
        target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any,
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
      const seasonValAdmin = determineSeason(new Date(data.dataTorneo));
      for (const [idx, combo] of firstCombos.entries()) {
        const key = `${data.firstPlacePlayerId}|${idx + 1}`;
        if (!existingKeySet.has(key)) {
          await processExternalCombo({
            blade: combo.blade,
            assistBlade: combo.assistBlade,
            ratchet: combo.ratchet,
            bit: combo.bit,
            lockChip: combo.lockChip,
            season: seasonValAdmin,
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
            season: seasonValAdmin,
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
            season: seasonValAdmin,
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

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_leaderboard`);
      } catch (refreshError2) {
        console.warn('player_leaderboard concurrent refresh failed, falling back:', refreshError2);
        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW player_leaderboard`);
        } catch (fallbackError2) {
          console.error('Failed to refresh player_leaderboard:', fallbackError2);
        }
      }

      try {
        const { recalculateRegionalStatsForTournament } = await import('./lib/regionalScoring');
        await recalculateRegionalStatsForTournament(data.tournamentId);
      } catch { }

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
      const nodes = await fetchTournamentsForGame(after);
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

      const firstPlaceCombos = results.filter((r: any) => r.piazzamento === 1).map((r: any) => ({
        blade: r.blade,
        assistBlade: r.assistBlade,
        ratchet: r.ratchet,
        bit: r.bit,
        lockChip: r.lockChip,
        puntiGuadagnati: r.puntiGuadagnati,
      }));
      const secondPlaceCombos = results.filter((r: any) => r.piazzamento === 2).map((r: any) => ({
        blade: r.blade,
        assistBlade: r.assistBlade,
        ratchet: r.ratchet,
        bit: r.bit,
        lockChip: r.lockChip,
        puntiGuadagnati: r.puntiGuadagnati,
      }));
      const thirdPlaceCombos = results.filter((r: any) => r.piazzamento === 3).map((r: any) => ({
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
      const seasonRaw = String(req.query.season || '').trim();
      // If season is provided and not "All Time", filter by it.
      // Note: We assume cm_match_results has a 'season' column or we filter by date.
      // Based on other queries, 'season' column exists in use even if missing in Drizzle schema sometimes.
      // But looking at schema.ts, cm_match_results doesn't have it.
      // However, external_player_combos does.
      // Let's assume for now we filter by season column if it exists, or we might need to rely on date.
      // Given previous context, let's treat 'season' as a column that likely exists or should be added.
      // Actually, relying on date is safer if we define seasons.
      // But let's look at line 1547 of routes.ts: 'WHERE ... AND season = ${season}' on cm_match_results.
      // This implies the column exists. We will use it.

      let seasonFilter = sql``;
      if (seasonRaw === 'Season 2026') {
        seasonFilter = sql` AND cm.data_torneo >= '2026-02-01'`;
      } else if (seasonRaw === 'Off Season 2025') {
        seasonFilter = sql` AND cm.data_torneo >= '2025-10-01' AND cm.data_torneo <= '2026-01-31'`;
      } else if (seasonRaw === 'Season 2025') {
        seasonFilter = sql` AND cm.data_torneo >= '2025-01-01' AND cm.data_torneo < '2025-10-01'`;
      }

      let query;

      if (granularity === 'month' && metric === 'points') {
        query = sql`
          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
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
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.bit
        `;
      } else if (granularity === 'month' && metric === 'count') {
        let externalSeasonFilter = sql``;
        if (seasonRaw === 'Season 2026') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2026-02-01'`;
        } else if (seasonRaw === 'Off Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-10-01' AND epc.tournament_date <= '2026-01-31'`;
        } else if (seasonRaw === 'Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-01-01' AND epc.tournament_date < '2025-10-01'`;
        }

        query = sql`
          WITH combined_data AS (
            SELECT data_torneo as date, blade, ratchet, bit 
            FROM cm_match_results cm
            WHERE 1=1 ${seasonFilter}
            
            UNION ALL
            
            SELECT tournament_date as date, blade, ratchet, bit 
            FROM external_player_combos epc
            WHERE 1=1 ${externalSeasonFilter}
          )
          SELECT
            to_char(date, 'YYYY-MM-01') AS month,
            'blade' AS component_type,
            blade AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY month, blade

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-01') AS month,
            'ratchet' AS component_type,
            ratchet AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY month, ratchet

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-01') AS month,
            'bit' AS component_type,
            bit AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY month, bit
        `;
      } else {
        // week + count (Actually using daily granularity to avoid confusion with week start dates)
        // We include external_player_combos here.

        let externalSeasonFilter = sql``;
        if (seasonRaw === 'Season 2026') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2026-02-01'`;
        } else if (seasonRaw === 'Off Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-10-01' AND epc.tournament_date <= '2026-01-31'`;
        } else if (seasonRaw === 'Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-01-01' AND epc.tournament_date < '2025-10-01'`;
        }

        query = sql`
          WITH combined_data AS (
            SELECT data_torneo as date, blade, ratchet, bit 
            FROM cm_match_results cm
            WHERE 1=1 ${seasonFilter}
            
            UNION ALL
            
            SELECT tournament_date as date, blade, ratchet, bit 
            FROM external_player_combos epc
            WHERE 1=1 ${externalSeasonFilter}
          )
          SELECT
            to_char(date, 'YYYY-MM-DD') AS month,
            'blade' AS component_type,
            blade AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY date, blade

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-DD') AS month,
            'ratchet' AS component_type,
            ratchet AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY date, ratchet

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-DD') AS month,
            'bit' AS component_type,
            bit AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY date, bit
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

  app.get('/sitemap.xml', async (_req, res) => {
    try {
      const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || '5000'}`;
      const staticPaths = [
        { path: '/', priority: '0.9', changefreq: 'daily', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/analytics', priority: '0.8', changefreq: 'daily', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/favorites', priority: '0.5', changefreq: 'weekly', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/tournaments', priority: '0.7', changefreq: 'daily', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/players', priority: '0.7', changefreq: 'daily', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/leaderboard/blade', priority: '0.6', changefreq: 'weekly', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/leaderboard/ratchet', priority: '0.6', changefreq: 'weekly', lastmod: new Date().toISOString().slice(0, 10) },
        { path: '/leaderboard/bit', priority: '0.6', changefreq: 'weekly', lastmod: new Date().toISOString().slice(0, 10) }
      ];
      const nodes = await fetchTournamentsForGame('2024-01-01T00:00:00Z');
      const limit = 6;
      const details: Record<string, string | null> = {};
      let i = 0;
      const worker = async () => {
        while (i < (nodes as any[]).length) {
          const idx = i++;
          const id = String((nodes as any[])[idx].id);
          try {
            const det = await fetchTournamentDetail(id);
            const d = det?.schedule?.startedAt ? String(det.schedule.startedAt).slice(0, 10) : null;
            details[id] = d;
          } catch {
            details[id] = null;
          }
        }
      };
      await Promise.all(Array.from({ length: limit }, () => worker()));
      const tournamentPaths = (nodes as any[]).map((n: any) => ({
        path: `/tournaments/${String(n.id)}`,
        priority: '0.6',
        changefreq: 'weekly',
        lastmod: details[String(n.id)] || new Date().toISOString().slice(0, 10),
      }));
      const topPlayers = await db
        .select()
        .from(playerLeaderboardView)
        .orderBy(desc(playerLeaderboardView.totalPoints))
        .limit(100);
      const playerIds = topPlayers.map((r: any) => String(r.playerId));
      const playerLastMap = new Map<string, string>();
      if (playerIds.length > 0) {
        const concurrency = 6;
        let j = 0;
        const worker2 = async () => {
          while (j < playerIds.length) {
            const idx = j++;
            const pid = playerIds[idx];
            try {
              const row = await db.execute(sql`
                SELECT MAX(updated_at) AS last
                FROM cm_match_results
                WHERE player_id = ${pid}
              `);
              const last = (row.rows as any[])[0]?.last ? String((row.rows as any[])[0].last).slice(0, 10) : new Date().toISOString().slice(0, 10);
              playerLastMap.set(pid, last);
            } catch {
              playerLastMap.set(pid, new Date().toISOString().slice(0, 10));
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker2()));
      }
      const playerPaths = topPlayers.map((r: any) => ({
        path: `/players/${String(r.playerId)}`,
        priority: '0.6',
        changefreq: 'weekly',
        lastmod: playerLastMap.get(String(r.playerId)) || new Date().toISOString().slice(0, 10),
      }));
      const combosRows = await db.execute(sql`
        SELECT blade, assist_blade, ratchet, bit, lock_chip, data_creazione
        FROM combo_stats
        ORDER BY punteggio_totale DESC, data_creazione DESC
        LIMIT 300
      `);
      const toSlug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
      const comboPaths = (combosRows.rows as any[]).map((r: any) => {
        const parts = [
          (String(r.lock_chip || '') && String(r.lock_chip).toLowerCase() !== 'none') ? String(r.lock_chip) : '',
          String(r.blade),
          (String(r.assist_blade || '') && String(r.assist_blade).toLowerCase() !== 'none') ? String(r.assist_blade) : '',
          (String(r.ratchet || '') && String(r.ratchet).toLowerCase() !== 'none') ? String(r.ratchet) : '',
          String(r.bit),
        ].filter(Boolean).map(toSlug);
        const slug = parts.join('-');
        const lastmod = (r.data_creazione ? String(r.data_creazione).slice(0, 10) : new Date().toISOString().slice(0, 10));
        return {
          path: `/combo/${slug}`,
          priority: '0.6',
          changefreq: 'weekly',
          lastmod,
        };
      });
      const entries = [...staticPaths, ...tournamentPaths, ...playerPaths, ...comboPaths];
      const urls = entries.map((e) => {
        const loc = `${base}${e.path}`;
        return `<url><loc>${loc}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`;
      }).join('');
      const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
      res.setHeader('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error: any) {
      res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
  });

  // Unified tournaments list with region filter and organizer logo (read-only)
  app.get('/api/tournaments', async (req, res) => {
    try {
      const region = String((req.query.region ?? '') as string).trim();
      const platform = String((req.query.platform ?? 'all') as string).trim().toLowerCase(); // 'all', 'challengermode', 'challonge'
      const season = String((req.query.season ?? '') as string).trim(); // Added season filter
      const after = String(req.query.after || '2024-01-01T00:00:00Z');

      // 1. Fetch CM tournaments (if applicable)
      let cmNodes: any[] = [];
      if (platform === 'all' || platform === 'challengermode') {
        try {
          cmNodes = await fetchTournamentsForGame(after);
        } catch (e) { console.error('Error fetching CM tournaments:', e); }
      }

      // 2. Fetch Challonge Tournaments (from our DB mirror)
      // We filter by date in memory because the date is inside JSONB 'data' or we rely on 'fetched_at'?
      // Let's fetch all and filter or try to use JSON operator if possible. For now verify memory filter.
      let challongeNodes: any[] = [];
      if (platform === 'all' || platform === 'challonge') {
        // Query db for challonge_match_results (using jsonb data) OR we need a view/helper
        // Since we don't have a helper exported yet, let's query the table directly
        const rawChallonge = await db.execute(sql`
           SELECT tournament_id, data, fetched_at FROM challonge_match_results
         `);
        // Map raw DB rows to "TorneoCard" like structure
        challongeNodes = (rawChallonge.rows as any[]).map(r => {
          const d = r.data || {};
          // Fix: Handle flat JSON properties from Admin Import vs standard Challonge Nested
          const tName = d.tournament_name || d.name || (d.tournament && d.tournament.name) || 'Unknown Tournament';
          const tDesc = d.description || (d.tournament && d.tournament.description) || '';
          const tState = d.state || (d.tournament && d.tournament.state) || 'ended';
          const tStartDate = d.start_date || d.started_at || (d.tournament && d.tournament.started_at) || null;
          const tPlayers = d.total_players || d.participants_count || (d.tournament && d.tournament.participants_count) || 0;
          const tUrl = d.full_challonge_url || (d.tournament && d.tournament.full_challonge_url) || null;

          return {
            id: r.tournament_id,
            name: tName,
            description: tDesc,
            state: tState,
            contactUrl: tUrl,
            schedule: { startedAt: tStartDate },
            gameTitle: { title: 'Beyblade X' },
            hasCombos: false, // We will check later
            region: null,
            city: null,
            organizerName: null,
            platform: 'challonge',
            participants: {
              // Frontend might expect different structure. The Challengermode node has `attendance.signups.count`?
              // Looking at Challengermode.ts -> mapToTorneoCards uses `attendance?.signups?.uCount`
              // But here we are building "TournamentNode" or "TorneoCard"?
              // The endpoint returns `res.json({ tournaments })` which are consumed by frontend.
              // Frontend `Tournaments.tsx` uses `t.attendance?.signups?.uCount` usually.
              // Let's mimic that structure if possible or ensure frontend handles it.
              // Wait, the previous code didn't set `attendance` at all!
              // Step 1720 show lines 2023-2040 and it didn't include `attendance`.
              // But User Request in Step 1674 said: "participants: usa row.data.total_players."
              // and "attendance: { signups: { uCount: ... } }" in my thought process?
              // Let's look at `mapToTorneoCards` usage in line 1566.
              // Use `participants` count field if frontend supports it, otherwise mimicking CM structure might be safer.
              // I'll stick to what the user asked in Step 1674: "participants: usa row.data.total_players." 
              // BUT User provided example output: "participants: usa row.data.total_players."
              // User didn't specify nested object structure in request description for *this* step, 
              // but in Step 1674 they said "participants: usa row.data.total_players."
              // Actually, `TournamentCard` interface usually has `attendance` property. 
              // Let's add `attendance` object to be safe and consistent with CM.
            },
            attendance: {
              signups: {
                uCount: tPlayers,
                count: tPlayers // redundancy
              }
            }
          };
        });

        // Filter Challonge by season if requested
        if (season) {
          challongeNodes = challongeNodes.filter(n => {
            const d = n.schedule?.startedAt ? new Date(n.schedule.startedAt) : null;
            if (!d) return false; // If no date, exclude if filtering by season
            const s = determineSeason(d);
            return s === season;
          });
        }
      }

      const allNodes = [...cmNodes, ...challongeNodes];

      const ids = allNodes.map((n) => String(n.id));

      // Helper for CM meta
      const metaRows = await db.execute(
        region
          ? sql`SELECT id, region, city, organizer_name FROM tournaments_view WHERE region = ${region}`
          : sql`SELECT id, region, city, organizer_name FROM tournaments_view`
      );
      const metaMap = new Map<string, { region: string | null; city: string | null; organizer_name: string | null }>();
      for (const r of (metaRows.rows as any[]) || []) {
        metaMap.set(String(r.id), {
          region: (r.region ?? null) as any,
          city: (r.city ?? null) as any,
          organizer_name: (r.organizer_name ?? null) as any,
        });
      }

      // Check hasCombos
      const rowsCombos = await db.execute(sql`SELECT DISTINCT tournament_id FROM cm_match_results UNION SELECT DISTINCT tournament_id FROM challonge_reported_combos`);
      const idSet = new Set<string>((rowsCombos.rows as any[]).map((r) => String((r as any).tournament_id || (r as any).tournamentId)));

      // Fetch details only for CM (limitation of current fetchTournamentDetail) or unify?
      // For list view, we just need basic info. CM nodes normally come with minimal info, we enrich.
      // Challonge nodes we already built from DB.

      // We process CM nodes to enrich, passing Challonge nodes through.
      const limit = 6;
      let out: any[] = [];

      // Process CM nodes
      let i = 0;
      const cmWorker = async () => {
        while (i < cmNodes.length) {
          const idx = i++;
          const base = cmNodes[idx] as any;
          const id = String(base.id);
          try {
            const detail = await fetchTournamentDetail(id);
            const meta = metaMap.get(id) || { region: null, city: null, organizer_name: null };
            const enriched = {
              ...base,
              hosts: detail?.hosts || undefined,
              schedule: detail?.schedule || undefined,
              hasCombos: idSet.has(id),
              region: meta.region || null,
              city: meta.city || null,
              organizerName: meta.organizer_name || (detail?.hosts?.spaces?.[0]?.name ?? undefined),
              platform: 'challengermode'
            };
            out.push(enriched);
          } catch {
            // Fallback
            const meta = metaMap.get(id) || { region: null, city: null, organizer_name: null };
            out.push({
              ...base,
              hasCombos: idSet.has(id),
              region: meta.region || null,
              city: meta.city || null,
              organizerName: meta.organizer_name || undefined,
              platform: 'challengermode'
            });
          }
        }
      };

      // Don't process Challonge nodes here, they are already formatted above
      challongeNodes.forEach(c => {
        c.hasCombos = idSet.has(String(c.id));
        // Filter by region if set? Challonge currently has no region unless we map it. 
        // Assuming for now they show up if region is empty or "ALL"
        if (!region) out.push(c);
      });

      if (cmNodes.length > 0) {
        await Promise.all(Array.from({ length: limit }, () => cmWorker()));
      }

      // Sort by date desc
      out.sort((a, b) => {
        const da = new Date(a.schedule?.startedAt || a.dataTorneo || 0).getTime();
        const db = new Date(b.schedule?.startedAt || b.dataTorneo || 0).getTime();
        return db - da;
      });

      // Filter by Season for CM nodes as well
      if (season) {
        out = out.filter(t => {
          const d = t.schedule?.startedAt ? new Date(t.schedule.startedAt) : (t.dataTorneo ? new Date(t.dataTorneo) : null);
          if (!d) return false;
          return determineSeason(d) === season;
        });
      }

      res.json({ tournaments: out.filter((t) => (region ? (t.region === region) : true)) });
    } catch (error: any) {
      console.error('Error fetching unified tournaments:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch tournaments' });
    }
  });
  // Current user's Challengermode participations (requires OAuth session token)
  app.get('/api/challenger/participations', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(400).json({ error: 'Devi effettuare il login con Challengermode' });
      const accessToken = (req.session as any).cm_access_token as string | undefined;
      if (!accessToken) return res.status(400).json({ error: 'Sessione Challengermode non disponibile. Effettua nuovamente il login con Challengermode.' });

      const parts = await fetchUserParticipations(accessToken);
      const ids = Array.from(new Set(parts.map(p => p.tournamentId).filter(Boolean)));

      const rows = await db.execute(sql`SELECT DISTINCT tournament_id FROM cm_match_results`);
      const existingSet = new Set<string>((rows.rows as any[]).map(r => String((r as any).tournament_id || (r as any).tournamentId)));

      const enriched = await Promise.all(ids.map(async (tid) => {
        try {
          const detail = await fetchTournamentDetail(tid);
          return {
            tournamentId: tid,
            name: detail?.name || null,
            state: detail?.state || null,
            date: (detail?.schedule?.startedAt ? String(detail.schedule.startedAt).slice(0, 10) : null),
            hasCombos: existingSet.has(tid),
          };
        } catch {
          return { tournamentId: tid, name: null, state: null, date: null, hasCombos: existingSet.has(tid) };
        }
      }));

      res.json({ participations: enriched });
    } catch (error: any) {
      console.error('Error fetching user participations:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch participations' });
    }
  });

  // Unified "My Tournaments" endpoint (CM + Challonge)
  app.get('/api/me/tournaments', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const tournaments: any[] = [];

      // 1. Challengermode Tournaments
      // We can fetch from DB if we have them linked via ID, OR fetch from CM API if we have token.
      // Ideally we use DB data (cm_match_results) for consistency with stats.
      // But CM API gives "participations" even if no results yet.
      // Let's stick to DB results for now to show "History" with stats.

      if (user?.challengerId) {
        const cmTours = await db.execute(sql`
            SELECT
              tournament_id,
              MAX(data_torneo) AS date,
              MIN(piazzamento) AS best_placement,
              SUM(punti_guadagnati) AS total_points,
              COUNT(*) AS combo_count,
              'challengermode' AS platform
            FROM cm_match_results
            WHERE player_id = ${user.challengerId}
            GROUP BY tournament_id
         `);

        const enrichedCM = await Promise.all((cmTours.rows || []).map(async (r: any) => {
          // enrichment
          let name = null;
          let date = r.date ? String(r.date) : null;
          try {
            const detail = await fetchTournamentDetail(String(r.tournament_id));
            name = detail?.name || null;
            if (!date && detail?.schedule?.startedAt) {
              date = String(detail.schedule.startedAt).slice(0, 10);
            }
          } catch { }

          return {
            tournamentId: String(r.tournament_id),
            date,
            name,
            bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
            totalPoints: Number(r.total_points || 0),
            comboCount: Number(r.combo_count || 0),
            platform: 'challengermode'
          };
        }));
        tournaments.push(...enrichedCM);
      }

      // 2. Challonge Tournaments
      // Linked via user_id
      const challongeTours = await db.execute(sql`
        SELECT
           tournament_id,
           MAX(tournament_name) AS tournament_name,
           MIN(rank) AS best_placement,
           COUNT(*) AS combo_count,
           'challonge' AS platform,
           MAX(created_at) AS date
        FROM challonge_reported_combos
        WHERE user_id = ${user?.id}
        GROUP BY tournament_id
      `);

      const enrichedChallonge = (challongeTours.rows || []).map((r: any) => ({
        tournamentId: String(r.tournament_id),
        date: r.date ? String(r.date).slice(0, 10) : null,
        name: r.tournament_name ? String(r.tournament_name) : null,
        bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
        totalPoints: 0, // Challonge points TODO if we want
        comboCount: Number(r.combo_count || 0),
        platform: 'challonge'
      }));
      tournaments.push(...enrichedChallonge);

      // Sort by date desc
      tournaments.sort((a, b) => {
        const dA = a.date ? new Date(a.date).getTime() : 0;
        const dB = b.date ? new Date(b.date).getTime() : 0;
        return dB - dA;
      });

      res.json({ tournaments });
    } catch (error: any) {
      console.error('Error fetching my tournaments:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch tournaments' });
    }
  });

  // Universal Tournament Detail (CM or Challonge)
  app.get('/api/tournaments/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      // console.log(`[DEBUG] GET /api/tournaments/${id} hit. User present? ${!!req.user}`);

      if (!id) return res.status(400).json({ error: 'Missing tournament id' });

      // 1. Check if it's a Challonge ID (exists in challonge_match_results)
      const challongeRes = await db.execute(sql`SELECT * FROM challonge_match_results WHERE tournament_id = ${id} LIMIT 1`);
      if (challongeRes.rows.length > 0) {
        const row = challongeRes.rows[0] as any;
        const data = row.data || {};

        // Fetch reported combos (User Self-Reported)
        const combosRes = await db.execute(sql`
          SELECT c.*, u.display_name, u.photo_url, 'challonge' as source_type
          FROM challonge_reported_combos c
          JOIN users u ON u.id = c.user_id
          WHERE c.tournament_id = ${id}
          ORDER BY c.rank ASC, c.combo_number ASC
        `);
        const userCombos = combosRes.rows;

        // Fetch external combos (Admin-Reported)
        const externalCombosRes = await db.execute(sql`
          SELECT e.*, e.placement as rank, 'admin' as source_type
          FROM external_player_combos e
          WHERE e.tournament_id = ${id} AND e.platform = 'challonge'
          ORDER BY e.combo_number ASC
        `);
        const adminCombos = externalCombosRes.rows;

        // Merge logic: Admin combos override or add to User combos
        // We need to map admin combos to the same structure as user combos for the frontend
        // The frontend likely expects: { user_id, combo_number, blade, ... }
        // For admin combos, we might not have a user_id if it's a ghost player.
        // We need to match admin combos to the participant list by player_id (which might be a name or ID).

        const combinedCombos = [...userCombos];

        for (const adminCombo of adminCombos) {
          // Check if we already have this combo from user report (anti-duplication is handled in PUT but for display let's be safe)
          // Actually, the PUT deletes user reported combos if found. So we might just push.
          // But wait, admin combos have 'player_id'. User combos have 'user_id'.
          // We need to attach these admin combos to the correct participant object in the response.

          // Let's adapt the admin combo to match the shape expected by frontend or separate them?
          // The frontend iterates `participants` and looks for combos.
          // See `TournamentDetail.tsx`. It likely doesn't receive `fetchedCombos` directly but uses them to populate `deck`.

          // Current route logic (lines 3006): `deck: [] // filled by frontend`? 
          // NO, the backend sends `fetchedCombos` in `detail`. 
          // The frontend `TournamentDetail.tsx` (lines 200+) processes `detail.fetchedCombos`.

          // adaptation:
          combinedCombos.push({
            ...adminCombo,
            // Map fields if necessary. external_player_combos has: player_id, blade, ...
            // challonge_reported_combos has: user_id, blade, ...
            // Frontend checks: `c.userId === p.userId` (if mapped) OR `c.user?.username`?
            // Let's look at `TournamentDetail.tsx` again to see how it matches combos to players.
            // It seems it matches by `userId`.

            // Issue: Admin combos for ghost players have `player_id` as the name/ID string.
            // They don't have a numeric `user_id` from the `users` table.
            // We need to ensure the frontend can match these.

            // If the participant is a ghost, `p.id` is their name/ID.
            // If the participant is a user, `p.id` is their Challonge ID (if available) or name.

            // We'll pass `player_id` as `identifier` to help frontend match.
            player_identifier: adminCombo.player_id
          });
        }


        // PERMISSION LOGIC: Determine valid names for the current user
        let validUserNames: string[] = [];
        const normalize = (s: string) => s?.trim().toLowerCase() || '';

        if (req.user) {

          // Fetch aliases
          const aliasesRes = await db.execute(sql`
             SELECT alias FROM user_aliases 
             WHERE user_id = ${req.user.id} AND is_verified = TRUE
           `);
          const aliases = aliasesRes.rows.map((r: any) => r.alias);
          validUserNames = [...aliases];

          // If users table has challonge_username (user.challongeUsername), add it
          if (req.user.challongeUsername) {
            validUserNames.push(req.user.challongeUsername);
          }
        }

        // Extract Top 3 from standings
        const standings = data.standings || [];
        const top3 = standings
          .filter((p: any) => p.rank <= 4)
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((p: any) => {
            const pName = p.name || p.username || '';
            const pNameNorm = normalize(pName);

            // Check permission
            const isCurrentUser = validUserNames.some(v => {
              const vNorm = normalize(v);
              const match = vNorm === pNameNorm;
              if (!match && req.user) {
                // Verbose debug only if failing? Or maybe just log matches to reduce noise?
                // Let's log potential near-matches or just one line per check if needed.
                // console.log(`[DEBUG] Compare '${vNorm}' vs '${pNameNorm}' -> ${match}`);
              }
              return match;
            });

            if (req.user) {
              // console.log(`[DEBUG] Participant '${pName}' (norm: '${pNameNorm}') isCurrentUser? ${isCurrentUser}`);
            }

            return {
              id: p.name || p.id,
              username: pName,
              placement: p.rank,
              isCurrentUser: isCurrentUser, // Permission flag
              deck: [] // filled by frontend
            };
          });

        // Construct standard response
        const detail = {
          id: row.tournament_id,
          name: data.tournament_name || 'Unknown Tournament',
          date: data.start_date,
          schedule: { startedAt: data.start_date },
          platform: 'challonge',
          state: 'COMPLETED',
          participants: (top3 as any[]).map(p => {
            // Try to find combos for this participant
            // 1. Check userCombos by matching p.username (normalized) to u.challonge_username or aliases? 
            //    Actually, userCombos have `user_id`. We'd need to know the `user_id` of this participant `p`.
            //    `p` comes from Challonge JSON, usually has `email_hash` or `username`.

            // 2. Check adminCombos by matching `p.name` or `p.username` to `adminCombo.player_id`.

            // Ideally, we return the raw list and let frontend handle it, OR we populate `deck` here.
            // Line 3006 said `deck: [] // filled by frontend`.
            // If we leave it empty, we rely on `fetchedCombos`.

            // So we just need to ensure `fetchedCombos` contains data that the frontend can link to `p`.
            return p;
          }),
          fetchedCombos: combinedCombos,
          hasCombos: combinedCombos.length > 0,
          // Add minimal attendance structure
          attendance: {
            signups: {
              uCount: data.total_players || 0,
              lineups: []
            }
          }
        };

        return res.json({ detail });
      }

      // 2. Fallback to Challengermode from API
      try {
        const detail = await fetchTournamentDetail(id);
        const metaRows = await db.execute(sql`SELECT region, city, organizer_name FROM tournaments_view WHERE id = ${id}`);
        const meta = (metaRows.rows as any[])[0] || {};

        const enriched = {
          ...detail,
          region: meta.region || null,
          city: meta.city || null,
          organizerName: meta.organizer_name || (detail?.hosts?.spaces?.[0]?.name ?? undefined),
          platform: 'challengermode'
        };
        return res.json({ detail: enriched });
      } catch (e: any) {
        console.warn(`Tournament ${id} not found in CM or DB.`);
        return res.status(404).json({ error: 'Tournament not found' });
      }
    } catch (error) {
      console.error('Error fetching tournament detail:', error);
      res.status(500).json({ error: 'Failed to fetch tournament detail' });
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

      // Check for Challonge combos first
      // Assuming playerId passed here is Internal User ID for Challonge players?
      // Or we check `challonge_reported_combos` with `user_id` = playerId (if UUID)
      // or `cm_match_results` logic.

      // Let's check both tables.

      // 1. Challonge
      // Note: `playerId` from frontend for Challonge might be our internal UUID if we integrated properly, 
      // OR a fake ID if coming from list. But to fetch combos, we probably want the User ID.

      let rows: any[] = [];
      const challongeRows = await db.execute(sql`
        SELECT * FROM challonge_reported_combos WHERE tournament_id = ${tournamentId} AND user_id = ${playerId} ORDER BY combo_number ASC
      `);

      if (challongeRows.rows.length > 0) {
        rows = challongeRows.rows;
      } else {
        // 2. Challengermode (externalPlayerCombos)
        rows = await db.select().from(externalPlayerCombos)
          .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, playerId)))
          .orderBy(asc(externalPlayerCombos.comboNumber));
      }

      const combos = rows.map((r: any) => ({
        blade: r.blade,
        assistBlade: r.assistBlade || r.assist_blade || 'None',
        ratchet: r.ratchet,
        bit: r.bit,
        lockChip: r.lockChip || r.lock_chip || 'None',
        season: r.season || undefined
      }));
      res.json({ combos });
    } catch (error: any) {
      console.error('Failed to fetch player combos:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to fetch player combos' });
    }
  });


  app.get('/api/leaderboard/regional', async (req, res) => {
    try {
      const region = String((req.query.region ?? '') as string).trim();
      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const season = seasonRaw || 'All Time';
      if (season === 'All Time') {
        if (region) {
          const rows = await db.execute(sql`
            SELECT prs.player_id,
                   MAX(prs.player_name) AS player_name,
                   prs.region,
                   'All Time' AS season,
                   SUM(prs.points) AS points,
                   SUM(prs.tournaments_played) AS tournaments_played,
                   SUM(prs.wins) AS wins,
                   SUM(prs.top4) AS top4,
                   MAX(p.avatar) AS avatar
            FROM player_regional_stats prs
            LEFT JOIN cm_players p ON p.id = prs.player_id
            WHERE prs.region = ${region}
            GROUP BY prs.player_id, prs.region
            ORDER BY points DESC, wins DESC, top4 DESC
          `);
          res.json({ leaderboard: rows.rows });
        } else {
          const rows = await db.execute(sql`
            SELECT prs.player_id,
                   MAX(prs.player_name) AS player_name,
                   'Global' AS region,
                   'All Time' AS season,
                   SUM(prs.points) AS points,
                   SUM(prs.tournaments_played) AS tournaments_played,
                   SUM(prs.wins) AS wins,
                   SUM(prs.top4) AS top4,
                   MAX(p.avatar) AS avatar
            FROM player_regional_stats prs
            LEFT JOIN cm_players p ON p.id = prs.player_id
            GROUP BY prs.player_id
            ORDER BY points DESC, wins DESC, top4 DESC
          `);
          res.json({ leaderboard: rows.rows });
        }
      } else {
        const legacyOff = 'Off Season';
        const isOffSeason2025 = season.toLowerCase().startsWith('off season');
        const platform = req.query.platform ? String(req.query.platform).trim() : 'all'; // Default to all

        if (region) {
          if (isOffSeason2025) {
            let query = sql`
              SELECT prs.player_id,
                     MAX(prs.player_name) AS player_name,
                     prs.region,
                     'Off Season 2025' AS season,
                     SUM(prs.points) AS points,
                     SUM(prs.tournaments_played) AS tournaments_played,
                     SUM(prs.wins) AS wins,
                     SUM(prs.top4) AS top4,
                     MAX(p.avatar) AS avatar
              FROM player_regional_stats prs
              LEFT JOIN cm_players p ON p.id = prs.player_id
              WHERE prs.region = ${region} AND (prs.season = ${season} OR prs.season = ${legacyOff})
            `;

            if (platform !== 'all' && platform !== '') {
              query.append(sql` AND prs.platform = ${platform}`);
            }

            query.append(sql`
              GROUP BY prs.player_id, prs.region
              ORDER BY points DESC, wins DESC, top4 DESC
            `);

            const rows = await db.execute(query);
            res.json({ leaderboard: rows.rows });
          } else {
            let query = sql`
              SELECT prs.player_id,
                     prs.player_name,
                     prs.region,
                     prs.season,
                     prs.points,
                     prs.tournaments_played,
                     prs.wins,
                     prs.top4,
                     p.avatar
              FROM player_regional_stats prs
              LEFT JOIN cm_players p ON p.id = prs.player_id
              WHERE prs.season = ${season} AND prs.region = ${region}
            `;

            if (platform !== 'all' && platform !== '') {
              query.append(sql` AND prs.platform = ${platform}`);
            }

            query.append(sql` ORDER BY prs.points DESC, prs.wins DESC, prs.top4 DESC`);

            const rows = await db.execute(query);
            res.json({ leaderboard: rows.rows });
          }
        } else {
          if (isOffSeason2025) {
            let query = sql`
              SELECT prs.player_id,
                     MAX(prs.player_name) AS player_name,
                     'Global' AS region,
                     'Off Season 2025' AS season,
                     SUM(prs.points) AS points,
                     SUM(prs.tournaments_played) AS tournaments_played,
                     SUM(prs.wins) AS wins,
                     SUM(prs.top4) AS top4,
                     MAX(p.avatar) AS avatar
              FROM player_regional_stats prs
              LEFT JOIN cm_players p ON p.id = prs.player_id
              WHERE (prs.season = ${season} OR prs.season = ${legacyOff})
            `;

            if (platform !== 'all' && platform !== '') {
              query.append(sql` AND prs.platform = ${platform}`);
            }

            query.append(sql`
              GROUP BY prs.player_id
              ORDER BY points DESC, wins DESC, top4 DESC
            `);

            const rows = await db.execute(query);
            res.json({ leaderboard: rows.rows });
          } else {
            let query = sql`
              SELECT prs.player_id,
                     MAX(prs.player_name) AS player_name,
                     'Global' AS region,
                     prs.season,
                     SUM(prs.points) AS points,
                     SUM(prs.tournaments_played) AS tournaments_played,
                     SUM(prs.wins) AS wins,
                     SUM(prs.top4) AS top4,
                     MAX(p.avatar) AS avatar
              FROM player_regional_stats prs
              LEFT JOIN cm_players p ON p.id = prs.player_id
              WHERE prs.season = ${season}
            `;

            if (platform !== 'all' && platform !== '') {
              query.append(sql` AND prs.platform = ${platform}`);
            }

            query.append(sql`
              GROUP BY prs.player_id, prs.season
              ORDER BY points DESC, wins DESC, top4 DESC
            `);

            const rows = await db.execute(query);
            res.json({ leaderboard: rows.rows });
          }
        }
      }
    } catch (error: any) {
      console.error('Error fetching regional leaderboard:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to fetch regional leaderboard' });
    }
  });

  app.get('/api/seasons', async (_req, res) => {
    try {
      const seasonsSet = new Set<string>();
      try {
        const r1 = await db.execute(sql`SELECT DISTINCT season FROM player_regional_stats`);
        for (const r of r1.rows as any[]) { const s = String((r as any).season || '').trim(); if (s) seasonsSet.add(s); }
      } catch { }
      try {
        const r2 = await db.execute(sql`SELECT DISTINCT season FROM combo_stats`);
        for (const r of r2.rows as any[]) { const s = String((r as any).season || '').trim(); if (s) seasonsSet.add(s); }
      } catch { }
      try {
        const r3 = await db.execute(sql`SELECT DISTINCT season FROM blade_stats`);
        for (const r of r3.rows as any[]) { const s = String((r as any).season || '').trim(); if (s) seasonsSet.add(s); }
      } catch { }
      try {
        const r4 = await db.execute(sql`SELECT DISTINCT season FROM ratchet_stats`);
        for (const r of r4.rows as any[]) { const s = String((r as any).season || '').trim(); if (s) seasonsSet.add(s); }
      } catch { }
      try {
        const r5 = await db.execute(sql`SELECT DISTINCT season FROM bit_stats`);
        for (const r of r5.rows as any[]) { const s = String((r as any).season || '').trim(); if (s) seasonsSet.add(s); }
      } catch { }
      try {
        const hasSeason = await db.execute(sql`
          SELECT EXISTS(
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'top_component_snapshot' AND column_name = 'season'
          ) AS has_season
        `);
        const ok = Boolean((hasSeason.rows[0] as any)?.has_season);
        if (ok) {
          const r6 = await db.execute(sql`SELECT DISTINCT season FROM top_component_snapshot`);
          for (const r of r6.rows as any[]) { const s = String((r as any).season || '').trim(); if (s) seasonsSet.add(s); }
        }
      } catch { }
      const result = ['Season 2026', 'All Time', 'Off Season 2025'];
      for (const s of Array.from(seasonsSet)) {
        if (!result.includes(s)) result.push(s);
      }
      res.json({ seasons: result });
    } catch (error: any) {
      console.error('Error fetching seasons:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to fetch seasons' });
    }
  });

  app.post('/api/admin/tournaments/:id/combos/reset', requireAdmin, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      if (!tournamentId) {
        return res.status(400).json({ error: 'Missing tournament id' });
      }

      let affected = 0;
      await db.transaction(async (tx: any) => {
        const resRows = await tx.execute(sql`
          SELECT blade,
                 assist_blade AS "assistBlade",
                 ratchet,
                 bit,
                 lock_chip AS "lockChip",
                 data_torneo AS "dataTorneo",
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
            const seasonForRevert = r.dataTorneo ? determineSeason(new Date(r.dataTorneo)) : determineSeason(new Date());
            await revertExternalComboTx(tx, {
              blade: r.blade,
              assistBlade: r.assistBlade,
              ratchet: r.ratchet,
              bit: r.bit,
              lockChip: r.lockChip,
              season: seasonForRevert,
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

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_leaderboard`);
      } catch {
        await db.execute(sql`REFRESH MATERIALIZED VIEW player_leaderboard`);
      }

      try {
        const adminRow = await db.select({ email: users.email }).from(users).where(eq(users.id, req.session.userId!));
        const email = adminRow[0]?.email || '';
        await db.insert(adminAuditLogs).values({
          adminUserId: req.session.userId!,
          email,
          action: 'reset_tournament_combos',
          tournamentId,
          payload: { affected },
        } as any);
      } catch { }

      return res.json({ success: true, affected });
    } catch (error: any) {
      console.error('Failed to reset tournament combos:', error);
      return res.status(500).json({ error: error?.message || 'Failed to reset tournament combos' });
    }
  });

  // Endpoint to fetch user's existing Challonge combos (Authenticated)
  app.get('/api/tournaments/:id/my-combos', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const user = req.user!;

      if (!tournamentId) return res.status(400).json({ error: 'Missing tournament id' });

      // Fetch combos for this user and tournament from challonge_reported_combos
      const combosRes = await db.execute(sql`
        SELECT blade, assist_blade as "assistBlade", ratchet, bit, lock_chip as "lockChip", combo_number as "comboNumber"
        FROM challonge_reported_combos
        WHERE tournament_id = ${tournamentId} AND user_id = ${user.id}
        ORDER BY combo_number ASC
      `);

      const combos = (combosRes.rows as any[]).map(row => ({
        blade: row.blade || '',
        assistBlade: row.assistBlade || 'None',
        ratchet: row.ratchet || '',
        bit: row.bit || '',
        lockChip: row.lockChip || 'None',
      }));

      res.json({ combos });
    } catch (error: any) {
      console.error('Error fetching Challonge combos:', error);
      res.status(500).json({ error: 'Failed to fetch combos' });
    }
  });

  // Endpoint to claim/update Challonge combos (Authenticated)
  app.post('/api/tournaments/:id/claim', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const user = req.user!; // Populated by global middleware

      if (!tournamentId) return res.status(400).json({ error: 'Missing tournament id' });

      // 1. Fetch Tournament Data (Challonge)
      const challongeRes = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId} LIMIT 1`);
      if (challongeRes.rows.length === 0) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      const data = challongeRes.rows[0].data as any;

      // 2. Identify Participant
      // PERMISSION LOGIC: Same as GET /tournaments/:id
      const normalize = (s: string) => s?.trim().toLowerCase() || '';

      let validUserNames: string[] = [];
      const aliasesRes = await db.execute(sql`SELECT alias FROM user_aliases WHERE user_id = ${user.id} AND is_verified = TRUE`);
      validUserNames = aliasesRes.rows.map((r: any) => r.alias);
      if (user.challongeUsername) validUserNames.push(user.challongeUsername);

      const standings = data.standings || [];
      const participant = standings.find((p: any) => {
        const pName = p.name || p.username || '';
        const pNameNorm = normalize(pName);
        return validUserNames.some(v => normalize(v) === pNameNorm);
      });

      // 2.5 Find Ghost/Admin Combos for this Participant to clean up
      // We need to know the name(s) used in external_player_combos.
      // Usually it's the exact name from Challonge or the ID.
      // Let's gather possible identifiers for this participant from Challonge data
      const possiblePlayerIds = new Set<string>();
      if (participant) {
        if (participant.name) possiblePlayerIds.add(participant.name);
        if (participant.username) possiblePlayerIds.add(participant.username);
        if (participant.id) possiblePlayerIds.add(String(participant.id));
        // Also add aliases and user's challonge username just in case admin used those
        validUserNames.forEach(v => possiblePlayerIds.add(v));
      }

      // 3. Check Permissions (User Match & Top 3)
      if (!participant) {
        return res.status(403).json({ error: 'Utente non trovato tra i partecipanti del torneo.' });
      }
      if (participant.rank > 3) {
        return res.status(403).json({ error: 'Solo i primi 3 classificati possono registrare le combo.' });
      }

      // 3.5. Calculate Season from Tournament Date
      let computedSeason: string | null = null;
      try {
        const tournamentDate = data.start_date || data.started_at || (data.tournament && data.tournament.started_at);
        if (tournamentDate) {
          computedSeason = determineSeason(new Date(tournamentDate));
        }
      } catch (err) {
        console.warn('Failed to determine season for tournament:', tournamentId, err);
      }

      // 4. Validate & Save Combos
      const payload = req.body; // Expect { combos: [...] }
      const combos = Array.isArray(payload.combos) ? payload.combos : [];

      // Basic validation handled by frontend, but we enforce strictly here?
      // For now trust schema parsing or do basic loop.
      // We expect fixed array of 3 combos.

      // --- ANTI-CHEAT: UNIQUE BLADE RULE ---
      const blades = combos.map((c: any) => c.blade?.trim()).filter((b: any) => b);
      const uniqueBlades = new Set(blades.map((b: string) => b.toLowerCase()));
      if (uniqueBlades.size !== blades.length) {
        return res.status(400).json({ error: 'Regola Deck Unico violata: Non puoi usare la stessa Blade più volte.' });
      }

      // Extract total participants from tournament data (needed for revert)
      const totalParticipants = data.total_players || data.participants_count || (data.tournament && data.tournament.participants_count) || 0;

      // Delete existing reported combos for this user/tournament
      // Note: participant.id might be Challonge Participant ID, but we want to link to our User ID?
      // challonge_reported_combos schema: tournament_id, user_id (our db user id), combo_number, ... match?
      // Re-read schema:
      // export const challongeReportedCombos = pgTable("challonge_reported_combos", {
      //   id: uuid("id").defaultRandom().primaryKey(),
      //   tournamentId: text("tournament_id").notNull(),
      //   userId: uuid("user_id").notNull().references(() => users.id), ...

      // REVERT LOGIC: Before deleting, revert old combos from stats to prevent duplicates
      // 1. Revert User-Reported Combos (challonge_reported_combos)
      const existingCombosRes = await db.execute(sql`
        SELECT blade, assist_blade as "assistBlade", ratchet, bit, lock_chip as "lockChip", rank, season
        FROM challonge_reported_combos
        WHERE tournament_id = ${tournamentId} AND user_id = ${user.id}
      `);

      // 2. Revert Admin-Reported Combos (external_player_combos)
      // Check for any of the possible player IDs
      // This is the CRITICAL STEP for anti-duplication
      if (possiblePlayerIds.size > 0) {
        const pIds = Array.from(possiblePlayerIds);
        const adminCombosRes = await db.execute(sql`
          SELECT blade, assist_blade as "assistBlade", ratchet, bit, lock_chip as "lockChip", placement as "rank", season, player_id
          FROM external_player_combos
          WHERE tournament_id = ${tournamentId} 
            AND platform = 'challonge'
            AND player_id IN ${pIds}
        `);

        if (adminCombosRes.rows.length > 0) {
          console.log(`[Anti-Duplication] Found ${adminCombosRes.rows.length} admin combos for user ${user.id} (participant ${participant?.name}). Removing them.`);

          // Revert stats for admin combos
          if (totalParticipants > 0) {
            for (const ac of adminCombosRes.rows as any[]) {
              if (ac.season) {
                try {
                  await revertExternalCombo({
                    blade: ac.blade,
                    assistBlade: ac.assistBlade || 'None',
                    ratchet: ac.ratchet,
                    bit: ac.bit,
                    lockChip: ac.lockChip || 'None',
                    season: ac.season,
                    placement: ac.rank,
                    totalParticipants: totalParticipants,
                  });
                } catch (err) { console.warn('Failed to revert admin combo:', err); }
              }
            }
          }
          // DELETE from external_player_combos
          await db.execute(sql`
             DELETE FROM external_player_combos 
             WHERE tournament_id = ${tournamentId} 
               AND platform = 'challonge'
               AND player_id IN ${pIds}
           `);
        }
      }

      // Revert each existing combo from stats
      if (existingCombosRes.rows.length > 0 && totalParticipants > 0) {
        for (const oldCombo of existingCombosRes.rows as any[]) {
          if (oldCombo.season) {
            try {
              await revertExternalCombo({
                blade: oldCombo.blade,
                assistBlade: oldCombo.assistBlade || 'None',
                ratchet: oldCombo.ratchet,
                bit: oldCombo.bit,
                lockChip: oldCombo.lockChip || 'None',
                season: oldCombo.season,
                placement: oldCombo.rank,
                totalParticipants: totalParticipants,
              });
            } catch (err) {
              console.warn('Failed to revert combo:', oldCombo, err);
            }
          }
        }
      }

      await db.execute(sql`DELETE FROM challonge_reported_combos WHERE tournament_id = ${tournamentId} AND user_id = ${user.id}`);

      for (let i = 0; i < combos.length; i++) {
        const c = combos[i];
        // Only insert if blade is set
        if (c.blade) {
          await db.insert(challongeReportedCombos).values({
            tournamentId,
            userId: user.id,
            comboNumber: i + 1,
            rank: participant.rank, // Verified from Challonge data
            blade: c.blade,
            assistBlade: c.assistBlade || 'None',
            ratchet: c.ratchet,
            bit: c.bit,
            lockChip: c.lockChip || 'None',
            season: computedSeason, // Calculated from tournament date
          });

          // Aggregate into combo_stats (same as Challengermode)
          if (computedSeason && totalParticipants > 0) {
            await processExternalCombo({
              blade: c.blade,
              assistBlade: c.assistBlade || 'None',
              ratchet: c.ratchet,
              bit: c.bit,
              lockChip: c.lockChip || 'None',
              season: computedSeason,
              placement: participant.rank,
              totalParticipants: totalParticipants,
            });
          }
        }
      }

      // Refresh materialized view to update Analytics
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      } catch {
        // Fallback if CONCURRENTLY fails
        await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
      }

      res.json({ success: true });

    } catch (error: any) {
      console.error('Error claiming Challonge combos:', error);
      res.status(500).json({ error: 'Failed to claim combos' });
    }
  });

  app.put('/api/tournaments/:id/combos/:num', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const comboNumber = parseInt(String(req.params.num || '0'), 10);
      if (!tournamentId || !Number.isFinite(comboNumber) || comboNumber < 1 || comboNumber > 3) {
        return res.status(400).json({ error: 'Parametri non validi' });
      }
      const newCombo = tournamentComboSchema.parse({
        blade: String(req.body?.blade || '').trim(),
        assistBlade: String(req.body?.assistBlade || '').trim(),
        ratchet: String(req.body?.ratchet || '').trim(),
        bit: String(req.body?.bit || '').trim(),
        lockChip: String(req.body?.lockChip || '').trim(),
      });

      const hasMultipleCapitals = /[A-Z].*[A-Z]/.test(newCombo.blade || '');
      if (hasMultipleCapitals) {
        if (newCombo.assistBlade !== 'None' || newCombo.lockChip !== 'None') {
          return res.status(400).json({ error: 'Assist Blade e Lock Chip devono essere None per questa Blade' });
        }
      }

      // Validate components; allow ratchet 'None' only for ratchet-less bits
      const [[bladeExists], [assistExists], bitRows, [lockChipExists]] = await Promise.all([
        db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, newCombo.blade)),
        newCombo.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, newCombo.assistBlade)),
        db.select().from(bitStats).where(eq(bitStats.bit, newCombo.bit)).limit(1),
        newCombo.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, newCombo.lockChip)),
      ]);
      const bitExistsCount = bitRows.length ? 1 : 0;
      const bitIsRatchetLess = !!(bitRows[0] as any)?.isRatchetLess;
      const ratchetCount = newCombo.ratchet === 'None'
        ? (bitIsRatchetLess ? 1 : 0)
        : Number((await db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, newCombo.ratchet)))[0]?.count ?? 0);

      if (!Number(bladeExists?.count) || !Number(assistExists?.count) || !ratchetCount || !bitExistsCount || !Number(lockChipExists?.count)) {
        return res.status(400).json({ error: 'Invalid combo components' });
      }

      const user = await storage.getUser(req.session.userId!);
      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(403).json({ error: 'Operazione consentita solo agli utenti Challengermode' });

      const rows = await db.select().from(externalPlayerCombos)
        .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber)))
        .limit(1);
      const existing = rows[0];
      if (!existing) return res.status(404).json({ error: 'Combo non trovata o non di tua proprietà' });

      const placement = Number(existing.placement ?? 0);
      const totalParticipants = Number(existing.totalParticipants ?? 0);

      // Enforce Top 3 check for CM
      if (placement > 3) {
        return res.status(403).json({ error: 'Solo i primi 3 classificati possono registrare le combo.' });
      }

      if (placement > 0 && totalParticipants > 0) {
        const seasonForDelete = existing?.season || (existing?.tournamentDate ? determineSeason(new Date(existing.tournamentDate as any)) : determineSeason(new Date()));
        await revertExternalCombo({
          blade: existing.blade,
          assistBlade: existing.assistBlade,
          ratchet: existing.ratchet,
          bit: existing.bit,
          lockChip: existing.lockChip,
          season: seasonForDelete,
          placement,
          totalParticipants,
        });
      }

      const updatedRows = await db.update(externalPlayerCombos)
        .set({
          blade: newCombo.blade,
          assistBlade: newCombo.assistBlade,
          ratchet: newCombo.ratchet,
          bit: newCombo.bit,
          lockChip: newCombo.lockChip,
          updatedAt: sql`now()`,
        })
        .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber)))
        .returning();
      const updated = updatedRows[0];

      if (placement > 0 && totalParticipants > 0) {
        const seasonForUpdate = updated?.season || (updated?.tournamentDate ? determineSeason(new Date(updated.tournamentDate as any)) : determineSeason(new Date()));
        await processExternalCombo({
          blade: updated.blade,
          assistBlade: updated.assistBlade,
          ratchet: updated.ratchet,
          bit: updated.bit,
          lockChip: updated.lockChip,
          season: seasonForUpdate,
          placement,
          totalParticipants,
        });
      }

      if (updated?.tournamentDate) {
        await db.insert(cmMatchResults).values({
          tournamentId,
          playerId: challengerId,
          comboNumber,
          blade: updated.blade,
          assistBlade: updated.assistBlade,
          ratchet: updated.ratchet,
          bit: updated.bit,
          lockChip: updated.lockChip,
          piazzamento: placement || 0,
          numeroPartecipanti: totalParticipants || 0,
          dataTorneo: updated.tournamentDate,
          puntiGuadagnati: placement && totalParticipants ? calcExternalPoints(placement, totalParticipants) : 0,
          updatedAt: sql`now()`,
        } as any).onConflictDoUpdate({
          target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any,
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
          },
        });
      }

      try {
        await db.insert(adminAuditLogs).values({
          adminUserId: req.session.userId!,
          email: (user as any)?.email || '',
          action: 'user_update_combo',
          tournamentId,
          playerId: challengerId,
          payload: {
            comboNumber,
            before: {
              blade: existing.blade,
              assistBlade: existing.assistBlade,
              ratchet: existing.ratchet,
              bit: existing.bit,
              lockChip: existing.lockChip,
            },
            after: {
              blade: updated.blade,
              assistBlade: updated.assistBlade,
              ratchet: updated.ratchet,
              bit: updated.bit,
              lockChip: updated.lockChip,
            },
          },
        } as any);
      } catch { }

      res.json({
        success: true, combo: {
          tournamentId,
          comboNumber,
          blade: updated.blade,
          assistBlade: updated.assistBlade,
          ratchet: updated.ratchet,
          bit: updated.bit,
          lockChip: updated.lockChip,
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Richiesta non valida' });
    }
  });

  app.delete('/api/tournaments/:id/combos/:num', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const comboNumber = parseInt(String(req.params.num || '0'), 10);
      if (!tournamentId || !Number.isFinite(comboNumber) || comboNumber < 1 || comboNumber > 3) {
        return res.status(400).json({ error: 'Parametri non validi' });
      }

      const user = await storage.getUser(req.session.userId!);
      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(403).json({ error: 'Operazione consentita solo agli utenti Challengermode' });

      const rows = await db.select().from(externalPlayerCombos)
        .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber)))
        .limit(1);
      const existing = rows[0];
      if (!existing) return res.status(404).json({ error: 'Combo non trovata o non di tua proprietà' });

      const placement = Number(existing.placement ?? 0);
      const totalParticipants = Number(existing.totalParticipants ?? 0);

      if (placement > 0 && totalParticipants > 0) {
        const seasonForDelete = existing?.season || (existing?.tournamentDate ? determineSeason(new Date(existing.tournamentDate as any)) : determineSeason(new Date()));
        await revertExternalCombo({
          blade: existing.blade,
          assistBlade: existing.assistBlade,
          ratchet: existing.ratchet,
          bit: existing.bit,
          lockChip: existing.lockChip,
          season: seasonForDelete,
          placement,
          totalParticipants,
        });
      }

      await db.delete(externalPlayerCombos)
        .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber)));

      await db.delete(cmMatchResults)
        .where(and(eq(cmMatchResults.tournamentId, tournamentId), eq(cmMatchResults.playerId, challengerId), eq(cmMatchResults.comboNumber, comboNumber)));

      try {
        await db.insert(adminAuditLogs).values({
          adminUserId: req.session.userId!,
          email: (user as any)?.email || '',
          action: 'user_delete_combo',
          tournamentId,
          playerId: challengerId,
          payload: {
            comboNumber,
            deleted: {
              blade: existing.blade,
              assistBlade: existing.assistBlade,
              ratchet: existing.ratchet,
              bit: existing.bit,
              lockChip: existing.lockChip,
            },
          },
        } as any);
      } catch { }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Richiesta non valida' });
    }
  });

  // Upsert combos for a specific player in a tournament (admin only)
  app.put('/api/tournaments/:id/players/:playerId/combos', requireAdmin, async (req, res) => {
    try {
      const parsed = upsertTournamentPlayerCombosSchema.parse({
        tournamentId: String(req.params.id || '').trim(),
        playerId: String(req.params.playerId || '').trim(),
        combos: Array.isArray(req.body?.combos) ? req.body.combos : [],
        platform: req.body?.platform || 'challengermode',
      });

      // Validate component existence against stats tables (defensive mapping)
      for (const combo of parsed.combos) {
        const bladeRows = await db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, combo.blade));
        const bladeCount = Number(bladeRows[0]?.count ?? 0);

        const assistCount = combo.assistBlade === 'None'
          ? 1
          : Number((await db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, combo.assistBlade)))[0]?.count ?? 0);

        const bitRows = await db.select().from(bitStats).where(eq(bitStats.bit, combo.bit)).limit(1);
        const bitCount = bitRows.length ? 1 : 0;
        const bitIsRatchetLess = !!(bitRows[0] as any)?.isRatchetLess;

        const ratchetCount = combo.ratchet === 'None'
          ? (bitIsRatchetLess ? 1 : 0)
          : Number((await db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, combo.ratchet)))[0]?.count ?? 0);

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

      // Anti-duplication: If it's a Challonge tournament, an admin override should probably clear user-reported combos
      if (parsed.platform === 'challonge') {
        try {
          // Find the internal user ID if the playerId matches a known username or alias
          const userRows = await db.execute(sql`
            SELECT u.id FROM users u
            LEFT JOIN user_aliases ua ON ua.user_id = u.id
            WHERE LOWER(TRIM(u.challonge_username)) = LOWER(TRIM(${parsed.playerId}))
               OR LOWER(TRIM(ua.alias)) = LOWER(TRIM(${parsed.playerId}))
            LIMIT 1
          `);
          if (userRows.rows.length > 0) {
            const uid = (userRows.rows[0] as any).id;
            await db.execute(sql`DELETE FROM challonge_reported_combos WHERE tournament_id = ${parsed.tournamentId} AND user_id = ${uid}`);
          }
        } catch (err) {
          console.warn('Failed to clean up potential duplicate Challonge reported combos:', err);
        }
      }

      // Ensure player exists in cm_players (fallback nickname=playerId)
      await db.insert(cmPlayers).values({ id: parsed.playerId, nickname: parsed.playerId, avatar: null as any })
        .onConflictDoNothing();

      // Fetch tournament detail to enrich with placement, participants, and date
      let placement: number | null = null;
      let totalParticipants: number | null = null;
      let tournamentDate: Date | null = null; // normalized to YYYY-MM-DD

      if (parsed.platform === 'challonge') {
        try {
          const challongeRes = await db.execute(sql`SELECT * FROM challonge_match_results WHERE tournament_id = ${parsed.tournamentId} LIMIT 1`);
          if (challongeRes.rows.length > 0) {
            const row = challongeRes.rows[0] as any;
            const data = row.data || {};
            const dateStr = data.start_date || data.started_at || data.tournament?.started_at;
            if (dateStr) {
              tournamentDate = new Date(dateStr);
            }
            totalParticipants = Number(data.total_players || data.participants_count || data.tournament?.participants_count || 0);

            const normalizeStr = (s: string) => String(s || '').trim().toLowerCase();
            const pIdNorm = normalizeStr(parsed.playerId);
            const standings = data.standings || [];
            const found = standings.find((p: any) =>
              normalizeStr(p.name || p.username || '') === pIdNorm ||
              String(p.id) === pIdNorm
            );
            if (found && found.rank) {
              placement = parseInt(String(found.rank), 10);
            }
          }
        } catch (e) {
          console.warn('Failed to fetch Challonge tournament data for enrichment:', (e as any)?.message || e);
        }
      } else {
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
      }

      // Insert new combos with combo_number 1..N
      const seasonVal = tournamentDate ? determineSeason(tournamentDate) : determineSeason(new Date());
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
        season: seasonVal,
        platform: parsed.platform,
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
      const prevMap = new Map<number, any>(prevRows.map((r: any) => [Number(r.comboNumber), r]));

      // Upsert into cm_match_results so /api/trends has data (requires date)
      if (tournamentDate) {

        // Ensure combo_stats rows exist to satisfy fk_combo_components
        // Use defaults (zeros) for counters; ON CONFLICT DO NOTHING
        const baseCombos = inserted.map((r: any) => ({
          blade: r.blade,
          assistBlade: r.assistBlade,
          ratchet: r.ratchet,
          bit: r.bit,
          lockChip: r.lockChip,
          season: seasonVal,
        }));
        if (baseCombos.length > 0) {
          await db.insert(comboStats).values(baseCombos as any).onConflictDoNothing();
        }

        const cmValues = inserted.map((r: any, idx: number) => ({
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
              season: seasonVal,
              placement: Number(prev.piazzamento ?? 0),
              totalParticipants: Number(prev.numeroPartecipanti ?? 0),
            });
            await processExternalCombo({
              blade: r.blade,
              assistBlade: r.assistBlade,
              ratchet: r.ratchet,
              bit: r.bit,
              lockChip: r.lockChip,
              season: seasonVal,
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
              season: seasonVal,
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

        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_leaderboard`);
        } catch (refreshError2) {
          console.warn('player_leaderboard concurrent refresh failed, falling back:', refreshError2);
          try {
            await db.execute(sql`REFRESH MATERIALIZED VIEW player_leaderboard`);
          } catch (fallbackError2) {
            console.error('Failed to refresh player_leaderboard:', fallbackError2);
          }
        }
      }

      try {
        const { recalculateRegionalStatsForTournament } = await import('./lib/regionalScoring');
        await recalculateRegionalStatsForTournament(parsed.tournamentId);
      } catch { }

      try {
        const adminRow = await db.select({ email: users.email }).from(users).where(eq(users.id, req.session.userId!));
        const email = adminRow[0]?.email || '';
        await db.insert(adminAuditLogs).values({
          adminUserId: req.session.userId!,
          email,
          action: 'upsert_player_combos',
          tournamentId: parsed.tournamentId,
          playerId: parsed.playerId,
          payload: { combos: parsed.combos },
        } as any);
      } catch { }

      res.json({ success: true, combos: inserted.map((r: any) => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip })) });
    } catch (error: any) {
      console.error('Failed to upsert player combos:', error);
      res.status(400).json({ error: error?.message || 'Failed to upsert player combos' });
    }
  });

  // Classifica giocatori basata su player_leaderboard (L2)
  app.get('/api/player-rankings', async (req, res) => {
    try {
      const rows = await db.select().from(playerLeaderboardView).orderBy(desc(playerLeaderboardView.totalPoints)).limit(100);
      const players = rows.map((r: any) => ({
        id: r.playerId || r.nickname,
        nickname: r.nickname,
        avatar: r.avatar,
        totalPoints: Number(r.totalPoints || 0),
        tournamentsPlayed: Number(r.tournamentsPlayed || 0),
        wins: Number(r.wins || 0),
        top3Finishes: Number(r.top3Finishes || 0)
      }));
      res.json({ players });
    } catch (error) {
      console.error('Error fetching player rankings:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });



  // Profilo singolo giocatore: avatar, nickname e statistiche
  app.get('/api/players/:id', async (req, res) => {
    try {
      const playerId = String(req.params.id || '').trim();
      if (!playerId) return res.status(400).json({ error: 'Missing player id' });
      const seasonRaw = String((req.query.season ?? 'Off Season 2025') as string).trim();
      const season = seasonRaw || 'Off Season 2025';

      const playerRows = await db.select().from(cmPlayers).where(eq(cmPlayers.id, playerId)).limit(1);
      const player = playerRows[0] || null;
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const legacyOff = 'Off Season';
      const totalPointsQuery = season.toLowerCase().startsWith('off season')
        ? await db.execute(sql`
            SELECT COALESCE(SUM(points), 0) AS total_points
            FROM player_regional_stats
            WHERE player_id = ${playerId} AND (season = ${season} OR season = ${legacyOff})
          `)
        : await db.execute(sql`
            SELECT COALESCE(SUM(points), 0) AS total_points
            FROM player_regional_stats
            WHERE player_id = ${playerId} AND season = ${season}
          `);
      const totalPoints = Number(totalPointsQuery.rows[0]?.total_points || 0);

      const mostUsedComboQuery = await db.execute(sql`
        SELECT blade, assist_blade, ratchet, bit, lock_chip,
               COUNT(*) AS use_count,
               COALESCE(SUM(
                 CASE placement
                   WHEN 1 THEN 10
                   WHEN 2 THEN 7
                   WHEN 3 THEN 5
                   ELSE 0
                 END * total_participants
               ), 0) AS points
        FROM external_player_combos
        WHERE player_id = ${playerId}
        GROUP BY blade, assist_blade, ratchet, bit, lock_chip
        ORDER BY use_count DESC, points DESC
        LIMIT 1;
      `);
      const muc = mostUsedComboQuery.rows[0] || null;

      const favoriteBladeQuery = await db.execute(sql`
        SELECT blade,
               COUNT(*) AS use_count,
               COALESCE(SUM(
                 CASE placement
                   WHEN 1 THEN 10
                   WHEN 2 THEN 7
                   WHEN 3 THEN 5
                   ELSE 0
                 END * total_participants
               ), 0) AS points
        FROM external_player_combos
        WHERE player_id = ${playerId}
        GROUP BY blade
        ORDER BY use_count DESC, points DESC
        LIMIT 1;
      `);
      const favBlade = favoriteBladeQuery.rows[0] || null;

      res.json({
        player: { id: player.id, nickname: player.nickname, avatar: player.avatar },
        stats: {
          totalPoints,
          mostUsedCombo: muc
            ? {
              blade: muc.blade,
              assistBlade: muc.assist_blade,
              ratchet: muc.ratchet,
              bit: muc.bit,
              lockChip: muc.lock_chip,
              count: Number(muc.use_count || 0),
              points: Number(muc.points || 0),
            }
            : null,
          favoriteBlade: favBlade
            ? {
              blade: favBlade.blade,
              count: Number(favBlade.use_count || 0),
              points: Number(favBlade.points || 0),
            }
            : null,
        },
      });
    } catch (error) {
      console.error('Error fetching player profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // Tornei a cui il giocatore ha partecipato (riepilogo)
  app.get('/api/players/:id/tournaments', async (req, res) => {
    try {
      const playerId = String(req.params.id || '').trim();
      if (!playerId) return res.status(400).json({ error: 'Missing player id' });

      const q = await db.execute(sql`
        SELECT
          tournament_id AS tournament_id,
          MAX(data_torneo) AS date,
          MIN(piazzamento) AS best_placement,
          SUM(punti_guadagnati) AS total_points,
          COUNT(*) AS combo_count
        FROM cm_match_results
        WHERE player_id = ${playerId}
        GROUP BY tournament_id
        ORDER BY date DESC
        LIMIT 50;
      `);
      type PlayerTournamentSummary = {
        tournamentId: string;
        date: string | null;
        bestPlacement: number | null;
        totalPoints: number;
        comboCount: number;
      };

      const base: PlayerTournamentSummary[] = (q.rows || []).map((r: any) => ({
        tournamentId: String(r.tournament_id),
        date: r.date ? String(r.date) : null,
        bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
        totalPoints: Number(r.total_points || 0),
        comboCount: Number(r.combo_count || 0),
      }));

      const enriched = await Promise.all(base.map(async (t: PlayerTournamentSummary) => {
        try {
          const detail = await fetchTournamentDetail(t.tournamentId);
          const name = detail?.name || null;
          // If date missing, try schedule.startedAt
          const startedAt = detail?.schedule?.startedAt as string | undefined;
          const dateFromDetail = startedAt ? String(startedAt).slice(0, 10) : null;
          return { ...t, name: name || null, date: t.date || dateFromDetail };
        } catch {
          return { ...t, name: null };
        }
      }));

      res.json({ tournaments: enriched });
    } catch (error) {
      console.error('Error fetching player tournaments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  const httpServer = createServer(app);

  // Admin endpoints
  app.post('/api/admin/refresh-all-tournaments', requireAdmin, async (req, res) => {
    try {
      // Fetch all tournament IDs from the current cache/view
      // We look at tournaments_view to get IDs of tournaments we know about
      const rows = await db.execute(sql`SELECT id FROM tournaments_view`);
      const ids = rows.rows.map((r: any) => String(r.id));

      console.log(`[Admin] Refreshing ${ids.length} tournaments...`);

      // Refresh serially or with limited concurrency to avoid rate limits
      let successCount = 0;
      let errorCount = 0;

      for (const id of ids) {
        try {
          // This will re-fetch from GraphQL and update the external_api_cache
          await fetchTournamentDetail(id);
          successCount++;
          // Small delay to be nice to the API
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.error(`[Admin] Failed to refresh tournament ${id}:`, e);
          errorCount++;
        }
      }

      // Refresh Leaderboard after CM update
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
      } catch {
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch { }
      }

      res.json({ success: true, total: ids.length, refreshed: successCount, errors: errorCount });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to refresh tournaments' });
    }

  });

  app.post('/api/admin/sync-challonge', requireAdmin, async (req, res) => {
    try {
      const { syncChallongeTournaments } = await import('./lib/challonge');
      const result = await syncChallongeTournaments();

      // Refresh Leaderboard
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
      } catch {
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch { }
      }

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Challonge sync failed:', error);
      res.status(500).json({ error: error?.message || 'Failed to sync Challonge tournaments' });
    }
  });

  app.post('/api/admin/recalc-stats', requireAdmin, async (req, res) => {
    try {
      console.log(`[Admin] Starting regional stats recalculation...`);
      const result = await recalculateAllRegionalStats();
      console.log(`[Admin] Stats recalculation complete. Inserted/Updated: ${result.inserted}`);
      res.json({ success: true, result });
    } catch (error: any) {
      console.error(`[Admin] Stats recalculation failed:`, error);
      res.status(500).json({ error: error?.message || 'Failed to recalculate stats' });
    }
  });

  // Admin: Manually import tournament JSON
  app.post('/api/admin/import-tournament', requireAdmin, async (req, res) => {
    try {
      const body = req.body;

      // Basic validation of required fields
      if (!body.id || !body.tournament_name || !body.start_date || !body.total_players || !body.standings) {
        return res.status(400).json({ error: 'Invalid JSON format. Missing required fields: id, tournament_name, start_date, total_players, standings' });
      }

      // Upsert into challongeMatchResults
      await db.insert(challongeMatchResults).values({
        tournamentId: body.id,
        data: body,
        fetchedAt: new Date(),
      }).onConflictDoUpdate({
        target: challongeMatchResults.tournamentId,
        set: {
          data: body,
          fetchedAt: new Date(),
        }
      });

      // Sync "Ghost" Players from imported data
      await syncGhostPlayersFromData(body);

      // Trigger Refresh of Leaderboard (Level 1 Mat View)
      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
      } catch (refreshError) {
        console.warn('Concurrent refresh failed, falling back to regular refresh:', refreshError);
        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`);
        } catch (e) {
          console.error("Failed to refresh leaderboard view:", e);
        }
      }

      // Trigger Recalculation of Points for Legacy Stats (Optional/Backup)
      try {
        const { recalculateRegionalStatsForTournament } = await import('./lib/regionalScoring');
        await recalculateRegionalStatsForTournament('ALL');
      } catch (e) {
        console.error("[Admin] Failed to recalculate regional stats:", e);
      }

      console.log(`[Admin] Imported tournament: ${body.tournament_name} (${body.id})`);
      res.json({ success: true, id: body.id });
    } catch (error) {
      console.error("[Admin] Import failed:", error);
      res.status(500).json({ error: 'Import failed' });
    }
  });

  // Helper to sync ghost players from tournament data object
  async function syncGhostPlayersFromData(data: any) {
    // Structure of imported JSON usually has 'standings' or 'participants'
    // We'll try to find player info in 'standings' (common format for this app imports)
    let count = 0;
    if (Array.isArray(data.standings)) {
      console.log(`[Admin] Syncing ghost players from data: ${data.standings.length} standings found`);
      for (const p of data.standings) {
        const part = p.participant || p;
        const name = part.name || part.username || part.display_name || 'Unknown';
        const pid = part.id ? String(part.id) : name; // Fallback to name as ID for ghost players
        const avatar = part.avatar_url || part.icon || null;

        if (pid && name && pid !== 'undefined') {
          await db.insert(challongePlayers).values({
            id: pid,
            nickname: name,
            avatar: avatar,
            updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: challongePlayers.id,
            set: {
              nickname: sql`excluded.nickname`,
              avatar: sql`COALESCE(excluded.avatar, challonge_players.avatar)`,
              updatedAt: new Date(),
            }
          });
          count++;
        }
      }
    } else if (Array.isArray(data.participants)) {
      // Fallback if 'participants' key is used
      console.log(`[Admin] Syncing ghost players from data: ${data.participants.length} participants found`);
      for (const p of data.participants) {
        const part = p.participant || p;
        const name = part.name || part.username || part.display_name || 'Unknown';
        const pid = part.id ? String(part.id) : name;
        const avatar = part.avatar_url || null;

        if (pid && name && pid !== 'undefined') {
          await db.insert(challongePlayers).values({
            id: pid,
            nickname: name,
            avatar: avatar,
            updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: challongePlayers.id,
            set: {
              nickname: sql`excluded.nickname`,
              avatar: sql`COALESCE(excluded.avatar, challonge_players.avatar)`,
              updatedAt: new Date(),
            }
          });
          count++;
        }
      }
    }


    // Trigger Refresh of Leaderboard (Level 1 Mat View)
    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
    } catch {
      try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch { }
    }

    // Trigger Recalculation of Points for Legacy Stats (Optional/Backup)
    try {
      const { recalculateRegionalStatsForTournament } = await import('./lib/regionalScoring');
      await recalculateRegionalStatsForTournament('ALL');
    } catch (e) {
      console.error("[Admin] Failed to recalculate regional stats:", e);
    }

    return count;
  }

  // Admin: Sync ghost players for an existing tournament
  app.post('/api/admin/tournaments/:id/sync-ghost-players', requireAdmin, async (req, res) => {
    try {
      const tournamentId = req.params.id;
      // Fetch the existing data blob
      const rows = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId} LIMIT 1`);
      if (rows.rows.length === 0) {
        return res.status(404).json({ error: 'Tournament not found' });
      }
      const data = rows.rows[0].data;
      const count = await syncGhostPlayersFromData(data);
      res.json({ success: true, count });
    } catch (error: any) {
      console.error("[Admin] Sync ghost players failed:", error);
      res.status(500).json({ error: error?.message || 'Failed to sync players' });
    }
  });

  return httpServer;
}
