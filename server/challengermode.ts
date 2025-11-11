// Lightweight Challengermode API client with token caching
// - Retrieves short-lived access token using refreshKey
// - Queries GraphQL endpoint for tournaments

import fs from 'fs';
import os from 'os';
import path from 'path';

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

export async function fetchTournamentsForGame(afterIso: string): Promise<ExternalTournament[]> {
  const token = await getAccessToken();
  const query = `query TournamentsForGame {\n  tournamentsForGame(\n    input: {\n      gameSlug: \"beybladex\"\n      tournamentFilter: {\n        completedTournamentSelector: { tournamentsAfter: \"${afterIso}\" }\n      }\n    }\n  ) {\n    description\n    id\n    name\n    state\n    contactUrl\n    idSuffix\n    gameTitle {\n      id\n      slug\n      title\n    }\n  }\n}`;

  console.log(`[Challengermode] GraphQL POST ${GRAPHQL_URL}`);

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Assume Bearer token unless API requires otherwise
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`Challengermode GraphQL failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  const errs = data?.errors;
  if (Array.isArray(errs) && errs.length) {
    throw new Error(`GraphQL error: ${errs[0]?.message || "unknown"}`);
  }
  const tournaments: ExternalTournament[] = data?.data?.tournamentsForGame || [];
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
  const token = await getAccessToken();
  const query = `query Tournament($tournamentId: UUID!) {\n  tournament(tournamentId: $tournamentId) {\n    id\n    name\n    state\n    contactUrl\n    schedule { startedAt }\n    stages { format lineupCount }\n    attendance {\n      availableSlotCount\n      confirmedLineupCount\n      signups {\n        userCount\n        lineupCount\n        lineups {\n          placement { displayPlacement }\n          members { user { username userId profilePicture(size: SMALL) { url width height } } }\n        }\n      }\n    }\n  }\n}`;

  const body = { query, variables: { tournamentId } };
  console.info(`[Challengermode] GraphQL POST ${GRAPHQL_URL} tournamentId=${tournamentId} bearer_tail=${token.slice(-6)}`);
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[Challengermode] GraphQL tournament detail failed: status=${res.status} body=${text.slice(0, 800)}${text.length > 800 ? '…' : ''}`);
    throw new Error('Challengermode tournament detail fetch failed');
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch (e) {
    console.error(`[Challengermode] GraphQL tournament detail JSON parse error: ${String(e)} body=${text.slice(0, 400)}${text.length > 400 ? '…' : ''}`);
    throw e;
  }
  const node = json?.data?.tournament;
  if (!node) {
    console.error(`[Challengermode] GraphQL tournament detail missing data.tournament: ${text.slice(0, 600)}${text.length > 600 ? '…' : ''}`);
    throw new Error('Challengermode tournament detail missing');
  }
  return node as ExternalTournamentDetail;
}