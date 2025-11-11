// Lightweight Challengermode API client with resilience
// - Retrieves short-lived access token using refreshKey
// - Queries GraphQL endpoint for tournaments
// - Throttles requests (~1 per 3.5s) to respect 20 req/min
// - Retries on 429 with exponential backoff and Retry-After
// - Caches completed tournament leaderboards in DB permanently

import fs from 'fs';
import os from 'os';
import path from 'path';
import { db } from './db';
import { sql } from 'drizzle-orm';

type AccessTokenRecord = {
  token: string;
  // Epoch millis when token expires
  expiresAt: number;
};

// Allow env overrides; fall back to official public endpoints
const AUTH_URL = (process.env.CHALLENGERMODE_AUTH_URL && process.env.CHALLENGERMODE_AUTH_URL.startsWith('http'))
  ? process.env.CHALLENGERMODE_AUTH_URL
  : "https://publicapi.challengermode.com/mk1/v1/auth/access_keys";
const GRAPHQL_URL = process.env.CHALLENGERMODE_GRAPHQL_URL || "https://publicapi.challengermode.com/graphql";

let cachedToken: AccessTokenRecord | null = null;
const TOKEN_CACHE_PATH = process.env.CHALLENGERMODE_TOKEN_CACHE_PATH
  || path.join(os.tmpdir(), 'beybladexmeta-challengermode-token.json');

// Simple throttle queue (default ~3.5s spacing between calls)
const THROTTLE_MS = Number(process.env.CHALLENGERMODE_THROTTLE_MS || 3500);
type QueueItem<T> = { fn: () => Promise<T>, resolve: (v: T) => void, reject: (e: any) => void };
const pendingQueue: QueueItem<any>[] = [];
let queueRunning = false;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (pendingQueue.length) {
      const item = pendingQueue.shift()!;
      try {
        const out = await item.fn();
        item.resolve(out);
      } catch (e) {
        item.reject(e);
      }
      // Respect rate limit by spacing calls
      await sleep(THROTTLE_MS);
    }
  } finally {
    queueRunning = false;
  }
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pendingQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

// DB cache (jsonb) for completed leaderboards; ensure table exists lazily
async function ensureCacheTable() {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS external_api_cache (
      cache_key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
  } catch (e) {
    console.warn('[Challengermode] Failed to ensure external_api_cache table:', (e as any)?.message || e);
  }
}

async function getCache(cacheKey: string): Promise<any | null> {
  try {
    await ensureCacheTable();
    const result = await db.execute(sql`SELECT data, created_at FROM external_api_cache WHERE cache_key = ${cacheKey}`);
    const row = (result.rows as any[])[0];
    if (!row) return null;
    const ttlMinutes = Number(process.env.CHALLENGERMODE_CACHE_TTL_MINUTES || 2880); // default 2 days
    const createdAt = new Date(row.created_at).getTime();
    const ageMs = Date.now() - createdAt;
    const ttlMs = ttlMinutes * 60 * 1000;
    if (ageMs > ttlMs) return null;
    return row.data ?? null;
  } catch (e) {
    console.warn('[Challengermode] Cache read error:', (e as any)?.message || e);
    return null;
  }
}

async function putCache(cacheKey: string, data: any): Promise<void> {
  try {
    await ensureCacheTable();
    await db.execute(sql`
      INSERT INTO external_api_cache (cache_key, data)
      VALUES (${cacheKey}, ${sql.raw(`'${JSON.stringify(data).replace(/'/g, "''")}'::jsonb`)})
      ON CONFLICT (cache_key)
      DO UPDATE SET data = EXCLUDED.data, created_at = now()
    `);
  } catch (e) {
    console.warn('[Challengermode] Cache write error:', (e as any)?.message || e);
  }
}

function parseRetryAfter(val: string): number {
  // If numeric, treat as seconds; else attempt date
  const n = Number(val);
  if (Number.isFinite(n) && n >= 0) return Math.round(n * 1000);
  const t = Date.parse(val);
  if (!isNaN(t)) {
    const diff = t - Date.now();
    return diff > 0 ? diff : 1000;
  }
  return 1000;
}

async function requestGraphQL(body: any): Promise<any> {
  const token = await getAccessToken();
  return enqueue(async () => {
    let attempt = 0;
    const maxRetries = Number(process.env.CHALLENGERMODE_MAX_RETRIES || 6);
    let backoffMs = 1000;

    while (true) {
      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      if (res.ok && res.status !== 429) {
        try {
          const json = JSON.parse(text);
          const errs = json?.errors;
          if (Array.isArray(errs) && errs.length) throw new Error(`GraphQL error: ${errs[0]?.message || 'unknown'}`);
          return json;
        } catch (e) {
          throw new Error(`[Challengermode] GraphQL JSON parse error: ${String(e)} body=${text.slice(0, 400)}${text.length > 400 ? '…' : ''}`);
        }
      }

      // Handle 429 rate limiting with Retry-After or exponential backoff
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const waitMs = retryAfter ? parseRetryAfter(retryAfter) : backoffMs;
        console.warn(`[Challengermode] 429 received. Waiting ${waitMs}ms before retry (attempt ${attempt + 1}/${maxRetries}).`);
        await sleep(waitMs);
        attempt++;
        backoffMs = Math.min(backoffMs * 2, 60_000);
        if (attempt >= maxRetries) {
          throw new Error(`[Challengermode] Rate limit retries exhausted (429). Last body snippet: ${text.slice(0, 300)}${text.length > 300 ? '…' : ''}`);
        }
        continue;
      }

      // For non-429 4xx client errors, do not retry
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`[Challengermode] GraphQL client error ${res.status}. Body=${text.slice(0, 600)}${text.length > 600 ? '…' : ''}`);
      }

      // Retry transient non-OK responses
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`[Challengermode] GraphQL failed: status=${res.status} body=${text.slice(0, 600)}${text.length > 600 ? '…' : ''}`);
      }
      console.warn(`[Challengermode] GraphQL ${res.status}. Backoff ${backoffMs}ms (attempt ${attempt}/${maxRetries}).`);
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 60_000);
    }
  });
}

function nowMs() {
  return Date.now();
}

function isTokenValid(rec: AccessTokenRecord | null): boolean {
  if (!rec) return false;
  // Add a small buffer to avoid using an almost-expired token
  const safetyBufferMs = 30_000;
  return rec.expiresAt - safetyBufferMs > nowMs();
}

async function loadPersistedToken(): Promise<AccessTokenRecord | null> {
  try {
    const raw = await fs.promises.readFile(TOKEN_CACHE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data?.token === 'string' && typeof data?.expiresAt === 'number') {
      const rec: AccessTokenRecord = { token: data.token, expiresAt: data.expiresAt };
      if (isTokenValid(rec)) {
        return rec;
      }
    }
  } catch (e) {
    // Ignore missing file or parse errors
  }
  return null;
}

async function savePersistedToken(rec: AccessTokenRecord): Promise<void> {
  try {
    const dir = path.dirname(TOKEN_CACHE_PATH);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(TOKEN_CACHE_PATH, JSON.stringify(rec), 'utf-8');
  } catch (e) {
    // Non-fatal: persistence failure shouldn't block operation
    console.warn('[Challengermode] Failed to persist token cache:', (e as Error)?.message || String(e));
  }
}

async function fetchAccessToken(): Promise<AccessTokenRecord> {
  const refreshKey = process.env.CHALLENGERMODE_REFRESH_KEY || process.env.CHALLENGERMODE_API_KEY;
  if (!refreshKey) {
    throw new Error("Server misconfiguration: CHALLENGERMODE_REFRESH_KEY is missing");
  }

  // Helper to mask secrets in logs
  const mask = (val: string) => {
    if (!val) return val;
    const keep = Math.min(4, Math.floor(val.length / 6) || 1);
    return `${val.slice(0, keep)}…${val.slice(-keep)}`;
  };

  console.log(`[Challengermode] Auth POST ${AUTH_URL} (refreshKey provided)`);

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshKey }),
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    console.log(`[Challengermode] Auth response ${res.status}`);
    throw new Error(`Challengermode auth failed: ${res.status}`);
  }

  // Read raw body and try to parse JSON; log a snippet
  const raw = await res.text();
  console.log(`[Challengermode] Auth success ${res.status}`);
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  // Try common shapes for token extraction
  let token: string | undefined = undefined;
  token = data?.accessKey
    || data?.access_token
    || data?.token
    || data?.accessToken
    || data?.value
    || (Array.isArray(data?.accessKeys) ? data.accessKeys[0]?.accessKey : undefined)
    || (typeof data === 'string' ? data : undefined);
  // Try to parse expiry; fallback to 10 minutes if unspecified
  const expiresAtMs: number = (() => {
    const exp = data?.expiresAt || data?.expires_at || data?.expiry || null;
    if (typeof exp === "string") {
      const t = Date.parse(exp);
      if (!isNaN(t)) return t;
    }
    if (typeof exp === "number") {
      // Assume seconds if small, convert to ms
      return exp < 10_000_000_000 ? exp * 1000 : exp;
    }
    // Default TTL 10 minutes
    return nowMs() + 10 * 60 * 1000;
  })();

  if (!token || typeof token !== "string") {
    console.log(`[Challengermode] Unable to extract token from auth response shape.`);
    throw new Error("Challengermode auth responded without a usable token");
  }

  const record: AccessTokenRecord = { token, expiresAt: expiresAtMs };
  cachedToken = record;
  await savePersistedToken(record);
  return record;
}

export async function getAccessToken(): Promise<string> {
  if (isTokenValid(cachedToken)) {
    return cachedToken!.token;
  }
  // Try loading from local cache file
  const persisted = await loadPersistedToken();
  if (isTokenValid(persisted)) {
    cachedToken = persisted;
    return persisted!.token;
  }
  const rec = await fetchAccessToken();
  return rec.token;
}

export type ExternalTournament = {
  description: string | null;
  id: string;
  name: string;
  state: string;
  contactUrl: string | null;
  idSuffix: string | null;
  gameTitle: { id: string; slug: string; title: string };
};

export async function fetchTournamentsForGame(gameSlug: string, afterIso: string): Promise<ExternalTournament[]> {
  const query = `query TournamentsForGame($gameSlug: String!, $afterIso: DateTime!) {\n  tournamentsForGame(\n    input: {\n      gameSlug: $gameSlug\n      tournamentFilter: {\n        completedTournamentSelector: { tournamentsAfter: $afterIso }\n      }\n    }\n  ) {\n    description\n    id\n    name\n    state\n    contactUrl\n    idSuffix\n    gameTitle { id slug title }\n  }\n}`;

  // Ensure ISO 8601 format for DateTime scalar
  const iso = new Date(afterIso).toISOString();
  const cacheKey = `tournaments:${gameSlug}:${iso}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached as ExternalTournament[];
  const body = { query, variables: { gameSlug, afterIso: iso } };
  const json = await requestGraphQL(body);
  const tournaments: ExternalTournament[] = json?.data?.tournamentsForGame || [];
  await putCache(cacheKey, tournaments);
  return tournaments;
}

// Detailed tournament response including attendance and placements
export type ExternalTournamentDetail = {
  id: string;
  name: string;
  state: string;
  contactUrl: string | null;
  // Add schedule with startedAt so routes can derive YYYY-MM-DD
  schedule?: { startedAt?: string | null } | null;
  stages?: Array<{ format?: string | null; lineupCount?: number | null }> | null;
  attendance?: {
    availableSlotCount?: number | null;
    confirmedLineupCount?: number | null;
    signups?: {
      userCount?: number | null;
      lineupCount?: number | null;
      lineups?: Array<{
        placement?: { displayPlacement?: string | null } | null;
        members?: Array<{
          user?: {
            username?: string | null;
            userId?: string | null;
            profilePicture?: { url?: string | null; width?: number | null; height?: number | null } | null;
          } | null;
        }> | null;
      }> | null;
    } | null;
  } | null;
};

export async function fetchTournamentDetail(tournamentId: string): Promise<ExternalTournamentDetail> {
  const query = `query Tournament($tournamentId: UUID!) {\n  tournament(tournamentId: $tournamentId) {\n    id\n    name\n    state\n    contactUrl\n    schedule { startedAt }\n    stages { format lineupCount }\n    attendance {\n      availableSlotCount\n      confirmedLineupCount\n      signups {\n        userCount\n        lineupCount\n        lineups {\n          placement { displayPlacement }\n          members { user { username userId profilePicture(size: SMALL) { url width height } } }\n        }\n      }\n    }\n  }\n}`;

  const cacheKey = `tournament:${tournamentId}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached as ExternalTournamentDetail;
  const body = { query, variables: { tournamentId } };
  const json = await requestGraphQL(body);
  const node = json?.data?.tournament;
  if (!node) {
    console.error(`[Challengermode] GraphQL tournament detail missing data.tournament`);
    throw new Error('Challengermode tournament detail missing');
  }
  const detail = node as ExternalTournamentDetail;
  await putCache(cacheKey, detail);
  return detail;
}

// Combined leaderboards query (avoid N+1): tournaments + attendance in one call
export async function getLeaderboards(gameSlug: string, afterIso: string) {
  const cacheKey = `leaderboards:${gameSlug}:${afterIso}`;
  const cached = await getCache(cacheKey);
  if (cached) return cached;

  const query = `query Leaderboards($gameSlug: String!, $afterIso: DateTime!) {\n  tournamentsForGame(\n    input: {\n      gameSlug: $gameSlug\n      tournamentFilter: { completedTournamentSelector: { tournamentsAfter: $afterIso } }\n    }\n  ) {\n    id\n    name\n    state\n    contactUrl\n    schedule { startedAt }\n    attendance {\n      signups {\n        userCount\n        lineupCount\n        lineups {\n          placement { displayPlacement }\n          members { user { username userId profilePicture(size: SMALL) { url width height } } }\n        }\n      }\n    }\n  }\n}`;
  // Ensure ISO 8601 format for DateTime scalar
  const iso = new Date(afterIso).toISOString();
  const body = { query, variables: { gameSlug, afterIso: iso } };
  const json = await requestGraphQL(body);
  const tournaments = json?.data?.tournamentsForGame || [];
  await putCache(cacheKey, tournaments);
  return tournaments;
}

// Helper used by routes to map tournaments to card-like objects
export function mapToTorneoCards(nodes: ExternalTournament[]) {
  return nodes.map(n => ({
    id: n.id,
    name: n.name,
    state: n.state,
    contactUrl: n.contactUrl,
    game: n.gameTitle?.title || n.gameTitle?.slug || 'unknown',
    description: n.description,
  }));
}