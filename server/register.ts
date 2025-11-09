// server/register.ts
import { Context } from "hono";
import { db } from "./db";
import { users } from "../shared/schema";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Resend } from "resend";
import { eq } from "drizzle-orm";

// 1. Inizializza Resend
const resend = new Resend(process.env.RESEND_API_KEY);

export const register = async (c: Context) => {
  const { displayName, email, password, captchaToken } = await c.req.json();
  const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

  // --- 1. VERIFICA ANTI-BOT (reCAPTCHA) ---
  if (!captchaToken) {
    return c.json({ message: "Verifica Captcha mancante." }, 400);
  }
  if (!RECAPTCHA_SECRET_KEY) {
    return c.json({ message: "Server misconfiguration: RECAPTCHA_SECRET_KEY mancante." }, 500);
  }

  const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${encodeURIComponent(RECAPTCHA_SECRET_KEY)}&response=${encodeURIComponent(captchaToken)}`;

  try {
    const recaptchaResponse = await fetch(verifyUrl, { method: "POST" });
    const recaptchaData = await recaptchaResponse.json();

    if (!recaptchaData.success || (typeof recaptchaData.score === "number" && recaptchaData.score < 0.5)) {
      return c.json({ message: "Verifica anti-bot fallita." }, 400);
    }
  } catch (error) {
    console.error("Errore verifica reCAPTCHA:", error);
    return c.json({ message: "Errore servizio anti-bot." }, 500);
  }

  // --- 2. VALIDAZIONE INPUT ---
  if (!displayName || !email || !password) {
    return c.json({ message: "Tutti i campi sono obbligatori." }, 400);
  }
  // (Aggiungi qui altre validazioni se necessario, es. lunghezza password)

  // --- 3. CONTROLLA SE L'UTENTE ESISTE GIÀ ---
  try {
    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) {
      return c.json({ message: "Questa email è già registrata." }, 409); // 409 Conflict
    }
  } catch (error) {
     console.error("Errore DB (check utente):", (error as any)?.message || error);
     return c.json({ message: "Errore database." }, 500);
  }

  // --- 4. HASH PASSWORD (SUL SERVER!) ---
  const saltRounds = 10;
  const password_hash = await bcrypt.hash(password, saltRounds);

  // --- 5. GENERA TOKEN DI VERIFICA ---
  const verification_token = crypto.randomBytes(32).toString("hex");
  const verification_token_expires_at = new Date(Date.now() + 3600000); // Scade tra 1 ora

  // --- 6. SALVA UTENTE E INVIA EMAIL ---
  try {
    // Inserisci l'utente nel database
    await db.insert(users).values({
      displayName,
      email,
      password_hash: password_hash, // Salva l'hash
      is_verified: false, // L'utente NON è verificato
      verification_token: verification_token,
      verification_token_expires_at: verification_token_expires_at,
    });

    // --- 7. INVIA L'EMAIL CON RESEND ---
    const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || '5000'}`;
    const verificationLink = `${APP_BASE_URL}/api/auth/verify?token=${verification_token}`;
    // Usa dominio di test Resend per verificare l'invio
    const emailFrom = `onboarding@resend.dev`;
    const escapeHtml = (s: string) => s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    const safeDisplayName = escapeHtml(displayName);

    const { data, error } = await resend.emails.send({
      from: `Verifica BeybladeXMeta <${emailFrom}>`,
      to: email, // L'email dell'utente
      subject: "Benvenuto! Verifica il tuo account",
      html: `
        <h1>Benvenuto su BeybladeXMeta!</h1>
        <p>Ciao ${safeDisplayName}, grazie per esserti registrato. Clicca sul link qui sotto per attivare il tuo account:</p>
        <a href="${verificationLink}" style="padding: 10px 15px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
          Clicca qui per verificare
        </a>
        <p>Questo link scadrà tra 1 ora.</p>
      `,
    });
    if (error) {
      console.error('Invio email di verifica fallito:', error);
    } else if (data?.id) {
      console.log('Email di verifica inviata, id:', data.id);
    }

    // 8. Invia risposta di successo al frontend
    return c.json(
      { message: "Registrazione completata! Controlla la tua email per la verifica." },
      201
    );

  } catch (error: any) {
    // Gestisce errori (es. invio email fallito o altri errori DB)
    console.error("Errore Inserimento/Invio Email:", error?.message || error);
    // (Potresti voler implementare un rollback o un modo per ri-inviare l'email)
    return c.json({ message: "Errore durante la registrazione." }, 500);
  }
};