/**
 * challengermode-client.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone Challengermode API client.
 *
 * Drop this file into any Node.js / TypeScript project. Zero external
 * dependencies (only uses Node built-ins: `fs`, `os`, `path`).
 *
 * Required environment variables
 * ───────────────────────────────
 *   CHALLENGERMODE_REFRESH_KEY     – long-lived refresh key (required)
 *   CHALLENGERMODE_AUTH_URL        – override auth endpoint (optional)
 *   CHALLENGERMODE_GRAPHQL_URL     – override GraphQL endpoint (optional)
 *   CHALLENGERMODE_TOKEN_CACHE_PATH– override on-disk token cache path (optional)
 *
 * Exported functions
 * ──────────────────
 *   getAccessToken()                       → string  (service-level, refresh-key flow)
 *   fetchTournamentsForGame(afterIso)      → ExternalTournament[]
 *   fetchTournamentById(tournamentId)      → ExternalTournament  (lightweight, no attendance)
 *   fetchTournamentDetail(tournamentId)    → ExternalTournamentDetail  (full, with attendance)
 *   fetchUserParticipations(userToken)     → UserParticipation[]
 *   fetchMeBasic(userToken)                → MeBasic
 *   mapToTorneoCards(nodes)                → plain card objects
 *
 * Caching
 * ───────
 * Tokens are persisted to disk (CHALLENGERMODE_TOKEN_CACHE_PATH).
 * Tournament data is cached in-memory via a simple TTL map.
 * Pass a custom `cache` object to `fetchTournamentsForGame` /
 * `fetchTournamentDetail` to plug in your own storage (e.g. Redis, DB).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// ─── Config ──────────────────────────────────────────────────────────────────

const AUTH_URL =
    process.env.CHALLENGERMODE_AUTH_URL?.startsWith('http')
        ? process.env.CHALLENGERMODE_AUTH_URL
        : 'https://publicapi.challengermode.com/mk1/v1/auth/access_keys';

const GRAPHQL_URL =
    process.env.CHALLENGERMODE_GRAPHQL_URL ||
    'https://publicapi.challengermode.com/graphql';

/** Default in-memory cache TTL in minutes (1 day). */
const DEFAULT_CACHE_TTL_MINUTES = Number(
    process.env.CHALLENGERMODE_CACHE_TTL_MINUTES ?? 1440,
);

const TOKEN_CACHE_PATH =
    process.env.CHALLENGERMODE_TOKEN_CACHE_PATH ||
    path.join(os.tmpdir(), 'cm-token-cache.json');

// ─── Types ───────────────────────────────────────────────────────────────────

type AccessTokenRecord = {
    token: string;
    /** Epoch milliseconds when the token expires. */
    expiresAt: number;
};

export type ExternalTournament = {
    description: string | null;
    id: string;
    name: string;
    state: string;
    contactUrl: string | null;
    idSuffix: string | null;
    gameTitle: { id: string; slug: string; title: string };
    hosts?: {
        spaces?: Array<{
            name?: string | null;
            description?: string | null;
            slug?: string | null;
            id?: string | null;
            logo?: { url?: string | null; width?: number | null; height?: number | null } | null;
        } | null> | null;
    } | null;
};

export type ExternalTournamentDetail = {
    id: string;
    name: string;
    state: string;
    contactUrl: string | null;
    schedule?: { startedAt?: string | null } | null;
    hosts?: {
        spaces?: Array<{
            name?: string | null;
            description?: string | null;
            slug?: string | null;
            id?: string | null;
            logo?: { url?: string | null; width?: number | null; height?: number | null } | null;
        } | null> | null;
    } | null;
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

export type UserParticipation = {
    gameAccountId: string | null;
    tournamentId: string;
    confirmed: boolean;
};

export type MeBasic = {
    userId: string | null;
    username: string | null;
    profilePictureUrl: string | null;
};

/**
 * Optional plug-in cache interface.
 * Implement this to use Redis, a database, etc.
 */
export interface CacheAdapter {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlMinutes: number): Promise<void>;
}

// ─── Built-in in-memory cache ─────────────────────────────────────────────────

type MemEntry = { value: unknown; expiresAt: number };
const memCache = new Map<string, MemEntry>();

const inMemoryCache: CacheAdapter = {
    async get<T>(key: string): Promise<T | null> {
        const entry = memCache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            memCache.delete(key);
            return null;
        }
        return entry.value as T;
    },
    async set(key: string, value: unknown, ttlMinutes: number): Promise<void> {
        memCache.set(key, { value, expiresAt: Date.now() + ttlMinutes * 60_000 });
    },
};

// ─── Token helpers ────────────────────────────────────────────────────────────

let _cachedToken: AccessTokenRecord | null = null;

function _nowMs() {
    return Date.now();
}

function _isTokenValid(rec: AccessTokenRecord | null): boolean {
    if (!rec) return false;
    const safetyBufferMs = 30_000;
    return rec.expiresAt - safetyBufferMs > _nowMs();
}

async function _loadPersistedToken(): Promise<AccessTokenRecord | null> {
    try {
        const raw = await fs.promises.readFile(TOKEN_CACHE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        if (typeof data?.token === 'string' && typeof data?.expiresAt === 'number') {
            const rec: AccessTokenRecord = { token: data.token, expiresAt: data.expiresAt };
            if (_isTokenValid(rec)) return rec;
        }
    } catch {
        // Missing file or parse errors are non-fatal.
    }
    return null;
}

async function _savePersistedToken(rec: AccessTokenRecord): Promise<void> {
    try {
        const dir = path.dirname(TOKEN_CACHE_PATH);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(TOKEN_CACHE_PATH, JSON.stringify(rec), 'utf-8');
    } catch (e) {
        console.warn('[CM] Failed to persist token cache:', (e as Error)?.message || String(e));
    }
}

async function _fetchAccessToken(): Promise<AccessTokenRecord> {
    const refreshKey =
        process.env.CHALLENGERMODE_REFRESH_KEY || process.env.CHALLENGERMODE_API_KEY;
    if (!refreshKey) {
        throw new Error('CHALLENGERMODE_REFRESH_KEY is not set');
    }

    const res = await fetch(AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshKey }),
    });

    if (!res.ok) {
        throw new Error(`Challengermode auth failed: ${res.status}`);
    }

    const raw = await res.text();
    let data: any;
    try {
        data = JSON.parse(raw);
    } catch {
        data = raw;
    }

    // Support several known token field names.
    const token: string | undefined =
        data?.accessKey ||
        data?.access_token ||
        data?.token ||
        data?.accessToken ||
        data?.value ||
        (Array.isArray(data?.accessKeys) ? data.accessKeys[0]?.accessKey : undefined) ||
        (typeof data === 'string' ? data : undefined);

    const expiresAtMs: number = (() => {
        const exp = data?.expiresAt || data?.expires_at || data?.expiry || null;
        if (typeof exp === 'string') {
            const t = Date.parse(exp);
            if (!isNaN(t)) return t;
        }
        if (typeof exp === 'number') {
            return exp < 10_000_000_000 ? exp * 1000 : exp;
        }
        return _nowMs() + 10 * 60 * 1000;
    })();

    if (!token || typeof token !== 'string') {
        throw new Error('Challengermode auth responded without a usable token');
    }

    const record: AccessTokenRecord = { token, expiresAt: expiresAtMs };
    _cachedToken = record;
    await _savePersistedToken(record);
    return record;
}

/**
 * Returns a valid service-level access token, refreshing if necessary.
 * Uses the `CHALLENGERMODE_REFRESH_KEY` environment variable.
 */
export async function getAccessToken(): Promise<string> {
    if (_isTokenValid(_cachedToken)) return _cachedToken!.token;
    const persisted = await _loadPersistedToken();
    if (_isTokenValid(persisted)) {
        _cachedToken = persisted;
        return persisted!.token;
    }
    const rec = await _fetchAccessToken();
    return rec.token;
}

// ─── GraphQL query constants ──────────────────────────────────────────────────

/**
 * Fetches all completed tournaments for the "beybladex" game slug after a given
 * cursor date. Uses a proper GraphQL variable so no string interpolation occurs.
 */
const GQL_TOURNAMENTS_FOR_GAME = `
  query TournamentsForGame($afterCursor: String!) {
    tournamentsForGame(
      input: {
        gameSlug: "beybladex"
        tournamentFilter: {
          completedTournamentSelector: { tournamentsAfter: $afterCursor }
        }
      }
    ) {
      description
      id
      name
      state
      contactUrl
      idSuffix
      gameTitle { id slug title }
      hosts {
        spaces {
          name description slug id
          logo(size: MEDIUM) { url width height }
        }
      }
    }
  }
`;

/**
 * Fetches lightweight info for a single tournament (no attendance/placements).
 * Suitable for quick lookups, list enrichment, or existence checks.
 */
const GQL_TOURNAMENT_BY_ID = `
  query TournamentById($tournamentId: UUID!) {
    tournament(tournamentId: $tournamentId) {
      id
      name
      state
      contactUrl
      idSuffix
      schedule { startedAt }
      hosts {
        spaces {
          name description slug id
          logo(size: MEDIUM) { url width height }
        }
      }
      stages { format lineupCount }
    }
  }
`;

/**
 * Fetches the full detail of a single tournament, including all attendance and
 * placement data. Use `fetchTournamentById` when you only need the basic info.
 */
const GQL_TOURNAMENT_DETAIL = `
  query TournamentDetail($tournamentId: UUID!) {
    tournament(tournamentId: $tournamentId) {
      id
      name
      state
      contactUrl
      schedule { startedAt }
      hosts {
        spaces {
          name description slug id
          logo(size: MEDIUM) { url width height }
        }
      }
      stages { format lineupCount }
      attendance {
        availableSlotCount
        confirmedLineupCount
        signups {
          userCount
          lineupCount
          lineups {
            placement { displayPlacement }
            members {
              user {
                username
                userId
                profilePicture(size: SMALL) { url width height }
              }
            }
          }
        }
      }
    }
  }
`;

const GQL_USER_PARTICIPATIONS = `
  query Me {
    me {
      user { username userId }
      ownTournamentParticipations(filter: {
        onlyOngoing: false
        gameSlugs: ["Beyblade X", "beybladex", "BeybladeX", "beybladeX"]
      }) {
        gameAccountId
        tournamentId
        confirmed
      }
    }
  }
`;

const GQL_ME_BASIC = `
  query Me {
    me {
      user { userId username profilePicture(size: SMALL) { url } }
    }
  }
`;

// ─── GraphQL executor ─────────────────────────────────────────────────────────

async function _gql(
    query: string,
    variables: Record<string, unknown> | undefined,
    token: string,
): Promise<any> {
    const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, variables }),
    });

    const text = await res.text();

    if (!res.ok) {
        throw new Error(`Challengermode GraphQL HTTP ${res.status}: ${text.slice(0, 400)}`);
    }

    let json: any;
    try {
        json = JSON.parse(text);
    } catch (e) {
        throw new Error(`Challengermode GraphQL JSON parse error: ${String(e)}`);
    }

    const errs = json?.errors;
    if (Array.isArray(errs) && errs.length) {
        throw new Error(`GraphQL error: ${errs[0]?.message || 'unknown'}`);
    }

    return json?.data;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches all Beyblade X tournaments completed after `afterIso`.
 * Uses a GraphQL variable for the date cursor — no string interpolation.
 *
 * @param afterIso   ISO 8601 date string, e.g. `"2024-01-01T00:00:00Z"`
 * @param cache      Optional cache adapter (defaults to built-in in-memory cache)
 * @param ttlMinutes Cache TTL in minutes (default: CHALLENGERMODE_CACHE_TTL_MINUTES or 1440)
 */
export async function fetchTournamentsForGame(
    afterIso: string,
    cache: CacheAdapter = inMemoryCache,
    ttlMinutes: number = DEFAULT_CACHE_TTL_MINUTES,
): Promise<ExternalTournament[]> {
    const cacheKey = `cm:tournamentsForGame:after=${afterIso}`;
    const cached = await cache.get<ExternalTournament[]>(cacheKey);
    if (cached) return cached;

    const token = await getAccessToken();
    const data = await _gql(GQL_TOURNAMENTS_FOR_GAME, { afterCursor: afterIso }, token);
    const tournaments: ExternalTournament[] = data?.tournamentsForGame || [];
    await cache.set(cacheKey, tournaments, ttlMinutes);
    return tournaments;
}

/**
 * Fetches lightweight data for a single tournament by its UUID.
 * Returns a minimal `ExternalTournament`-shaped object — no attendance or
 * placement data. Use `fetchTournamentDetail` when you need the full payload.
 *
 * @param tournamentId  UUID of the tournament
 * @param cache         Optional cache adapter
 * @param ttlMinutes    Cache TTL in minutes
 */
export async function fetchTournamentById(
    tournamentId: string,
    cache: CacheAdapter = inMemoryCache,
    ttlMinutes: number = DEFAULT_CACHE_TTL_MINUTES,
): Promise<ExternalTournament & { schedule?: { startedAt?: string | null } | null; stages?: Array<{ format?: string | null; lineupCount?: number | null }> | null }> {
    const cacheKey = `cm:tournamentById:${tournamentId}`;
    const cached = await cache.get<any>(cacheKey);
    if (cached) return cached;

    const token = await getAccessToken();
    const data = await _gql(GQL_TOURNAMENT_BY_ID, { tournamentId }, token);
    const node = data?.tournament;
    if (!node) {
        throw new Error(`Tournament ${tournamentId} not found`);
    }
    await cache.set(cacheKey, node, ttlMinutes);
    return node;
}

/**
 * Fetches the full detail of a single tournament including attendance, lineups,
 * and per-player placement data.
 *
 * @param tournamentId  UUID of the tournament
 * @param cache         Optional cache adapter
 * @param ttlMinutes    Cache TTL in minutes
 */
export async function fetchTournamentDetail(
    tournamentId: string,
    cache: CacheAdapter = inMemoryCache,
    ttlMinutes: number = DEFAULT_CACHE_TTL_MINUTES,
): Promise<ExternalTournamentDetail> {
    const cacheKey = `cm:tournamentDetail:${tournamentId}`;
    const cached = await cache.get<ExternalTournamentDetail>(cacheKey);
    if (cached) return cached;

    const token = await getAccessToken();
    const data = await _gql(GQL_TOURNAMENT_DETAIL, { tournamentId }, token);
    const node = data?.tournament as ExternalTournamentDetail;
    if (!node) {
        throw new Error(`Tournament ${tournamentId} not found in Challengermode response`);
    }
    await cache.set(cacheKey, node, ttlMinutes);
    return node;
}

/**
 * Fetches all Beyblade X tournament participations for the authenticated user.
 * Uses the user's own OAuth access token, not the service-level token.
 *
 * @param userAccessToken  The user's Bearer token obtained via OAuth
 */
export async function fetchUserParticipations(
    userAccessToken: string,
): Promise<UserParticipation[]> {
    const data = await _gql(GQL_USER_PARTICIPATIONS, undefined, userAccessToken);
    const nodes: any[] = data?.me?.ownTournamentParticipations || [];
    return nodes
        .map((n) => ({
            gameAccountId: n?.gameAccountId ?? null,
            tournamentId: String(n?.tournamentId || ''),
            confirmed: Boolean(n?.confirmed),
        }))
        .filter((p) => p.tournamentId);
}

/**
 * Fetches basic profile info (userId, username, avatar) for the authenticated user.
 * Uses the user's own OAuth access token.
 *
 * @param userAccessToken  The user's Bearer token obtained via OAuth
 */
export async function fetchMeBasic(userAccessToken: string): Promise<MeBasic> {
    const data = await _gql(GQL_ME_BASIC, undefined, userAccessToken);
    const node = data?.me?.user;
    return {
        userId: node?.userId ? String(node.userId) : null,
        username: node?.username ? String(node.username) : null,
        profilePictureUrl: node?.profilePicture?.url ? String(node.profilePicture.url) : null,
    };
}

/**
 * Maps raw `ExternalTournament` nodes to lightweight card objects
 * suitable for UI consumption.
 */
export function mapToTorneoCards(nodes: ExternalTournament[]): Array<{
    id: string;
    name: string;
    state: string;
    contactUrl: string | null;
    logo: string | null;
    organizer: string | null;
}> {
    return nodes.map((n) => ({
        id: n.id,
        name: n.name,
        state: n.state,
        contactUrl: n.contactUrl,
        logo: n.hosts?.spaces?.[0]?.logo?.url || null,
        organizer: n.hosts?.spaces?.[0]?.name || null,
    }));
}
