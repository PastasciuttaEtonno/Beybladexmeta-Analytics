// server/verify.ts
import { Context } from "hono";
import { db } from "./db";
import { users } from "../shared/schema";
import { eq, and, gte } from "drizzle-orm"; // Importa gli operatori Drizzle

export const verifyToken = async (c: Context) => {
  const { token } = c.req.query(); // Prende il token dall'URL (es. ?token=...)

  if (!token) {
    return c.text("Richiesta non valida: token mancante.", 400);
  }

  try {
    // 1. Trova l'utente che ha quel token E controlla che non sia scaduto
    const foundUser = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.verification_token, token), // Il token corrisponde
          gte(users.verification_token_expires_at, new Date()) // gte = "maggiore o uguale a" (non è scaduto)
        )
      )
      .limit(1); // Prendine solo uno

    if (foundUser.length === 0) {
      // Se non c'è nessun utente, il token è sbagliato o scaduto
      return c.text("Token non valido o scaduto.", 400);
    }

    const user = foundUser[0];

    // 2. Attiva l'utente e annulla il token (per sicurezza)
    await db
      .update(users)
      .set({
        is_verified: true,
        verification_token: null, // Annulla il token così non può essere riusato
        verification_token_expires_at: null,
      })
      .where(eq(users.id, user.id));

    // 3. Reindirizza l'utente alla pagina di login con un messaggio di successo
    // !!! SOSTITUISCI "/login" CON LA TUA ROTTA DI LOGIN DEL FRONTEND !!!
    return c.redirect("/login?verified=true");

  } catch (error) {
    console.error("Errore durante la verifica:", error);
    return c.text("Errore interno del server durante la verifica.", 500);
  }
};