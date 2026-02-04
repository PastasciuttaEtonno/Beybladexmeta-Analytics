import express from "express";
import { db } from "./db";
import { users, challongePlayers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "./auth";
import crypto from "node:crypto";

export function registerChallongeAuth(app: express.Express) {
    const router = express.Router();

    const computeRedirectUri = (req: express.Request): string => {
        const forwardedProto = req.header('x-forwarded-proto');
        const proto = (forwardedProto && forwardedProto.split(',')[0]) || req.protocol || 'https';
        const forwardedHost = req.header('x-forwarded-host');
        const host = (forwardedHost && forwardedHost.split(',')[0]) || req.header('host') || '';
        const base = `${proto}://${host}`;
        return `${base}/api/challonge/callback`;
    };

    router.get("/login", (req, res) => {
        const clientId = process.env.CHALLONGE_APP_CLIENT_ID;
        if (!clientId) return res.redirect("/profile?error=" + encodeURIComponent("Challonge OAuth misconfigured (Missing Client ID)"));

        const redirectUri = computeRedirectUri(req);
        console.log("DEBUG: Challonge OAuth Redirect URI (login):", redirectUri);
        const scope = "me tournaments:read tournaments:write matches:read matches:write"; // Requested scopes
        const state = crypto.randomBytes(16).toString("hex");
        (req.session as any).challonge_oauth_state = state;

        const authUrl = new URL("https://api.challonge.com/oauth/authorize");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scope);
        authUrl.searchParams.set("state", state);

        res.redirect(authUrl.toString());
    });

    router.get("/callback", async (req, res) => {
        try {
            const code = String(req.query.code || "");
            const state = String(req.query.state || "");
            const error = req.query.error;

            if (error) {
                return res.redirect("/profile?error=" + encodeURIComponent(String(error)));
            }

            if (!code) {
                return res.redirect("/profile");
            }

            const expectedState = (req.session as any).challonge_oauth_state;
            (req.session as any).challonge_oauth_state = null;

            if (!state || state !== expectedState) {
                return res.redirect("/profile?error=" + encodeURIComponent("Invalid state parameter"));
            }

            const clientId = process.env.CHALLONGE_APP_CLIENT_ID;
            const clientSecret = process.env.CHALLONGE_APP_CLIENT_SECRET;
            const redirectUri = computeRedirectUri(req);
            console.log("DEBUG: Challonge OAuth Redirect URI (callback):", redirectUri);

            if (!clientId || !clientSecret) {
                return res.redirect("/profile?error=" + encodeURIComponent("Challonge OAuth misconfigured"));
            }

            // Exchange code for token
            const tokenRes = await fetch("https://api.challonge.com/oauth/token", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    grant_type: "authorization_code",
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUri,
                }),
            });

            if (!tokenRes.ok) {
                const text = await tokenRes.text();
                console.error("Challonge Token Error:", text);
                return res.redirect("/profile?error=" + encodeURIComponent("Failed to exchange token with Challonge"));
            }

            const tokenData = await tokenRes.json();
            const accessToken = tokenData.access_token;

            if (!accessToken) {
                return res.redirect("/profile?error=" + encodeURIComponent("No access token received"));
            }

            // Fetch User Info
            // Using v2.1 me.json endpoint
            const userRes = await fetch("https://api.challonge.com/v2.1/me.json", {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Authorization-Type": "v2",
                    "Content-Type": "application/vnd.api+json",
                    "Accept": "application/json"
                },
            });

            if (!userRes.ok) {
                const text = await userRes.text();
                console.error("Challonge User Info Error:", text);
                return res.redirect("/profile?error=" + encodeURIComponent("Failed to fetch user info from Challonge"));
            }

            const userData = await userRes.json();
            console.log("DEBUG: Challonge User Data:", JSON.stringify(userData, null, 2));
            // Adjust according to actual response structure. 
            // Assuming standard JSON:API response or similar.
            // Based on docs, it returns a user object.
            const userObj = userData.data;
            const challongeId = String(userObj.id);
            const attributes = userObj.attributes || {};
            const username = attributes.username || attributes.name || "Unknown";
            const avatarUrl = attributes.image_url || attributes.avatar_url || attributes.avatar?.usage?.url || null; // Making best guess on avatar field

            if (!challongeId) {
                return res.redirect("/profile?error=" + encodeURIComponent("Could not retrieve Challonge User ID"));
            }

            // DB Operations
            const currentUserId = req.session.userId;

            // Upsert into challonge_players
            await db.insert(challongePlayers).values({
                id: challongeId,
                nickname: username,
                avatar: avatarUrl,
            }).onConflictDoUpdate({
                target: challongePlayers.id,
                set: {
                    nickname: username,
                    avatar: avatarUrl,
                    updatedAt: new Date(),
                }
            });

            // User linking/creation logic
            const existingUserWithChallongeId = await db.query.users.findFirst({
                where: eq(users.challongeId, challongeId),
            });

            if (currentUserId) {
                // User is logged in, link account
                const currentUser = await db.query.users.findFirst({
                    where: eq(users.id, currentUserId)
                });

                if (!currentUser) return res.status(500).send("Current user not found");

                if (existingUserWithChallongeId && existingUserWithChallongeId.id !== currentUserId) {
                    return res.redirect("/profile?error=" + encodeURIComponent("This Challonge account is already linked to another user."));
                }

                await db.update(users).set({ challongeId, challongeUsername: username }).where(eq(users.id, currentUserId));
            } else {
                // User not logged in
                if (existingUserWithChallongeId) {
                    // Log them in
                    req.session.userId = existingUserWithChallongeId.id;
                    // Ensure username is up to date
                    if (existingUserWithChallongeId.challongeUsername !== username) {
                        await db.update(users).set({ challongeUsername: username }).where(eq(users.id, existingUserWithChallongeId.id));
                    }
                } else {
                    // Create new user? 
                    // Similar to auth-challenger: create a new user or just fail?
                    // Usually we create a new user.
                    const email = `${challongeId}@challonge.local`; // Placeholder email
                    const pwd = crypto.randomBytes(24).toString("hex");
                    const hash = await hashPassword(pwd);

                    const [newUser] = await db.insert(users).values({
                        email,
                        password_hash: hash,
                        displayName: username,
                        photoURL: avatarUrl,
                        isAdmin: false,
                        is_verified: true, // Auto-verify OAuth users
                        challongeId: challongeId,
                        challongeUsername: username,
                    }).returning();

                    req.session.userId = newUser.id;
                }
            }

            // Store access token in session if needed for temporary API calls, 
            // or maybe we should store in DB? For now, session is fine for immediate specific actions, 
            // but if we want offline access we need DB. 
            // Construct didn't specify storing tokens, just authentication.
            (req.session as any).challonge_access_token = accessToken;

            // Explicitly save session before redirect to ensure persistence
            await new Promise<void>((resolve, reject) => {
                req.session.save((err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });

            res.redirect("/profile");
        } catch (e) {
            console.error("Cb Error:", e);
            res.redirect("/profile?error=" + encodeURIComponent("Internal Server Error during Challonge Auth"));
        }
    });

    app.use("/api/challonge", router);
}
