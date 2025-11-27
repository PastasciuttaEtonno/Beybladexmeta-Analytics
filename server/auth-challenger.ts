import express from "express";
import crypto from "node:crypto";
import { db } from "./db";
import { users, cmPlayers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./auth";
import { fetchMeBasic } from "./challengermode";

export function registerChallengerAuth(app: express.Express) {
  const router = express.Router();

  const base64url = (input: Buffer | string) => {
    const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };
  const generateCodeVerifier = () => base64url(crypto.randomBytes(32));
  const generateCodeChallengeS256 = (verifier: string) => {
    const hash = crypto.createHash("sha256").update(verifier).digest();
    return base64url(hash);
  };

  router.get("/login", async (req, res) => {
    const clientId = process.env.CM_CLIENT_ID;
    const redirectUri = process.env.CM_REDIRECT_URI;
    if (!clientId || !redirectUri) return res.status(500).send("OAuth misconfigured");
    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallengeS256(codeVerifier);
    (req.session as any).cm_oauth_state = state;
    (req.session as any).cm_code_verifier = codeVerifier;
    const authUrl = new URL("https://challengermode.com/oauth/authorize");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", "openid offline_access");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
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
      const codeVerifier: string = (req.session as any).cm_code_verifier || "";
      (req.session as any).cm_code_verifier = null;
      if (!codeVerifier) return res.status(400).send("Missing PKCE code_verifier");

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        code_verifier: codeVerifier,
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
      const idToken: string | undefined = tokenJson?.id_token;
      if (!accessToken) return res.status(500).send("Missing access token");
      (req.session as any).cm_access_token = accessToken;

      const USERINFO_URL = process.env.CM_USERINFO_URL || "https://publicapi.challengermode.com/mk1/v1/me/userinfo";
      const userinfoRes = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const userinfoText = await userinfoRes.text();
      if (!userinfoRes.ok) return res.status(500).send("Failed to fetch userinfo");
      let userinfo: any = {};
      try { userinfo = JSON.parse(userinfoText); } catch {}
      const challengerId: string = String(userinfo?.sub || "");
      let username: string = String(userinfo?.preferred_username || userinfo?.username || userinfo?.name || "");
      let avatar: string | null = userinfo?.picture ? String(userinfo.picture) : null;
      if (!challengerId) return res.status(500).send("Missing user id");

      if (!username || username.trim().length === 0) {
        try {
          const me = await fetchMeBasic(accessToken);
          if (me?.username) username = me.username;
          if (!avatar && me?.profilePictureUrl) avatar = me.profilePictureUrl;
        } catch {}
      }

      let userRow = (await db.select().from(users).where(eq(users.challengerId, challengerId)).limit(1))[0];
      if (!userRow) {
        const email = `${challengerId}@challengermode.local`;
        const pwd = crypto.randomBytes(24).toString("hex");
        const hash = await hashPassword(pwd);
        const inserted = await db.insert(users).values({
          email,
          password_hash: hash,
          displayName: username || "",
          photoURL: avatar,
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
        if (avatar && avatar !== (userRow.photoURL || null)) updates.photoURL = avatar;
        if (Object.keys(updates).length) {
          const updated = await db.update(users).set(updates).where(eq(users.id, userRow.id)).returning();
          userRow = updated[0] || userRow;
        }
      }

      const existingPlayer = (await db.select().from(cmPlayers).where(eq(cmPlayers.id, challengerId)).limit(1))[0];
      if (!existingPlayer) {
        await db.insert(cmPlayers).values({ id: challengerId, nickname: username || challengerId, avatar: avatar }).onConflictDoNothing();
      } else {
        await db.insert(cmPlayers).values({ id: challengerId, nickname: username || challengerId, avatar: avatar })
          .onConflictDoUpdate({ target: cmPlayers.id, set: { nickname: sql`excluded.nickname`, avatar: sql`excluded.avatar`, updatedAt: sql`now()` } });
      }

      req.session.userId = userRow.id;
      res.redirect("/profile");
    } catch (e) {
      res.status(500).send("OAuth error");
    }
  });

  app.use("/api/challenger", router);
}

