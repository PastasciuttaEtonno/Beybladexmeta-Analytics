import type { Express } from "express";
import { z } from "zod";
import { RecaptchaEnterpriseServiceClient } from "@google-cloud/recaptcha-enterprise";
import crypto from "node:crypto";
import { Resend } from "resend";
import { storage } from "../storage";
import { hashPassword, verifyPassword } from "../auth";
import { loginSchema, updateProfileSchema, registerSchema, users } from "@shared/schema";
import { db } from "../db";
import { userAliases } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { loginRateLimiter } from "../rateLimiter";
import { requireAuth, getClientIp } from "./middleware";

export function registerAuthRoutes(app: Express): void {
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

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const hashed = await hashPassword(password);
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);

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

  app.post('/api/auth/login', async (req, res) => {
    const clientIp = getClientIp(req);
    try {
      const { email, password } = loginSchema.parse(req.body);
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

      await loginRateLimiter.recordSuccessfulLogin(clientIp, email);
      req.session.userId = user.id;
      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

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
        .set({ is_verified: true, verification_token: null, verification_token_expires_at: null })
        .where(eq(users.id, user.id));

      return res.redirect('/login?verified=true');
    } catch (error) {
      return res.status(500).send('Errore durante la verifica');
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: 'Failed to logout' });
      res.json({ success: true });
    });
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  app.patch('/api/auth/profile', requireAuth, async (req, res) => {
    try {
      const updates = updateProfileSchema.parse(req.body);
      const user = await storage.updateUserProfile(req.session.userId!, updates);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  app.post('/api/user/link-challonge', requireAuth, async (req, res) => {
    try {
      const { username } = z.object({ username: z.string().min(1) }).parse(req.body);
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const updated = await storage.updateUserProfile(user.id, { challongeUsername: username } as any);
      const { password_hash: _, password: __, ...userWithoutPassword } = updated as any;
      res.json({ user: userWithoutPassword, message: 'Account Challonge collegato con successo' });
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'Failed to link Challonge account' });
    }
  });

  app.post('/api/user/link-challengermode', requireAuth, async (req, res) => {
    try {
      const { cmId, cmUsername } = z.object({ cmId: z.string().min(1), cmUsername: z.string().min(1) }).parse(req.body);
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

  app.post('/api/user/aliases', requireAuth, async (req, res) => {
    try {
      if (!req.user!.challongeId) {
        return res.status(403).json({ error: 'Devi autenticarti con Challonge per richiedere alias.' });
      }
      const alias = String(req.body.alias || '').trim();
      if (!alias) return res.status(400).json({ error: 'Alias is required' });

      const userAliasesList = await db.select().from(userAliases).where(eq(userAliases.userId, req.user!.id));
      if (userAliasesList.length >= 3) {
        return res.status(400).json({ error: 'Limite di 3 alias raggiunto.' });
      }

      const existing = await db.select().from(userAliases).where(eq(userAliases.alias, alias)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Alias già reclamato' });
      }

      const [newAlias] = await db.insert(userAliases).values({
        userId: req.user!.id,
        alias,
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

      const [alias] = await db.select().from(userAliases)
        .where(and(eq(userAliases.id, id), eq(userAliases.userId, req.user!.id)))
        .limit(1);
      if (!alias) return res.status(404).json({ error: 'Alias not found or unauthorized' });

      await db.delete(userAliases).where(eq(userAliases.id, id));
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting alias:', error);
      res.status(500).json({ error: 'Failed to delete alias' });
    }
  });
}
