import express from "express";
import crypto from "node:crypto";
import { db } from "./db";
import { users, cmPlayers } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";

export function registerChallengerAuth(app: express.Express) {
  const router = express.Router();

  router.get("/login", async (req, res) => {
    const clientId = process.env.CM_CLIENT_ID;
    const redirectUri = process.env.CM_REDIRECT_URI;
    if (!clientId || !redirectUri) return res.status(500).send("OAuth misconfigured");
    const state = crypto.randomBytes(16).toString("hex");
    (req.session as any).cm_oauth_state = state;
    const authUrl = new URL("https://challengermode.com/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid profile");
    authUrl.searchParams.set("state", state);
    res.redirect(authUrl.toString());
  });

  router.get("/callback", async (req, res) => {
    try {
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      if (!code) return res.status(400).send("Missing code");
      const expected = (req.session as any).cm_oauth_state || "";
      (req.session as any).cm_oauth_state = null;
      if (!state || state !== expected) return res.status(400).send("Invalid state");

      const clientId = process.env.CM_CLIENT_ID;
      const clientSecret = process.env.CM_CLIENT_SECRET;
      const redirectUri = process.env.CM_REDIRECT_URI;
      if (!clientId || !clientSecret || !redirectUri) return res.status(500).send("OAuth misconfigured");

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });
      const tokenRes = await fetch("https://challengermode.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: tokenBody,
      });
      const tokenText = await tokenRes.text();
      if (!tokenRes.ok) return res.status(500).send("Token exchange failed");
      let tokenJson: any = {};
      try { tokenJson = JSON.parse(tokenText); } catch {}
      const accessToken: string = tokenJson?.access_token || tokenJson?.token || "";
      if (!accessToken) return res.status(500).send("Missing access token");

      const userinfoRes = await fetch("https://challengermode.com/v1/me/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userinfoText = await userinfoRes.text();
      if (!userinfoRes.ok) return res.status(500).send("Failed to fetch userinfo");
      let userinfo: any = {};
      try { userinfo = JSON.parse(userinfoText); } catch {}
      const challengerId: string = String(userinfo?.sub || "");
      const username: string = String(userinfo?.username || userinfo?.name || "");
      if (!challengerId) return res.status(500).send("Missing user id");

      let userRow = (await db.select().from(users).where(eq(users.challengerId, challengerId)).limit(1))[0];
      if (!userRow) {
        const email = `${challengerId}@challengermode.local`;
        const pwd = crypto.randomBytes(24).toString("hex");
        const hash = await hashPassword(pwd);
        const inserted = await db.insert(users).values({
          email,
          password_hash: hash,
          displayName: username || "",
          photoURL: null,
          isAdmin: false,
          is_verified: true,
          verification_token: null,
          verification_token_expires_at: null,
          challengerId,
        }).returning();
        userRow = inserted[0];
      } else {
        const updates: any = {};
        if (username && username !== userRow.displayName) updates.displayName = username;
        if (Object.keys(updates).length) {
          const updated = await db.update(users).set(updates).where(eq(users.id, userRow.id)).returning();
          userRow = updated[0] || userRow;
        }
      }

      const existingPlayer = (await db.select().from(cmPlayers).where(eq(cmPlayers.id, challengerId)).limit(1))[0];
      if (!existingPlayer) {
        await db.insert(cmPlayers).values({ id: challengerId, nickname: username || challengerId, avatar: null }).onConflictDoNothing();
      }

      req.session.userId = userRow.id;
      res.redirect("/profile");
    } catch (e) {
      res.status(500).send("OAuth error");
    }
  });

  app.use("/api/challenger", router);
}

