# Backend Business Logic & Utility Functions

This document covers the reusable business logic modules in `server/lib/` and `server/`, describing what each function does, where it is called, and how to extend it.

---

## Table of Contents

- [Auth Utilities (`server/auth.ts`)](#auth-utilities-serverauthts)
- [Rate Limiter (`server/rateLimiter.ts`)](#rate-limiter-serverratelimiterts)
- [Regional Scoring (`server/lib/regionalScoring.ts`)](#regional-scoring-serverlibregionalscoringts)
- [Season Logic (`server/lib/seasons.ts`)](#season-logic-serverlibseasonsts)
- [ChallengerMode Client (`server/lib/challengermode-client.ts`)](#challengermode-client-serverlibchallengermode-clientts)
- [ChallengerMode Processing (`server/lib/challengermode.ts`)](#challengermode-processing-serverlibchallengermodets)
- [Challonge Integration (`server/lib/challonge.ts`)](#challonge-integration-serverlibchallongets)
- [External Combo Scoring (`server/scoreExternalCombo.ts`)](#external-combo-scoring-serverscoreexternalcombots)
- [Open Graph Image Generation (`server/og-image.ts`)](#open-graph-image-generation-serverog-imagets)
- [Object Storage (`server/objectStorage.ts`)](#object-storage-serverobjectstoragets)
- [Data Access Layer (`server/storage.ts`)](#data-access-layer-serverstoragets)
- [OAuth Registration (`server/auth-challenger.ts`, `server/auth-challonge.ts`)](#oauth-registration)

---

## Auth Utilities (`server/auth.ts`)

### `hashPassword(password: string): Promise<string>`

Hashes a plain-text password using bcrypt with 10 salt rounds.

**Called by:** `POST /api/auth/register`, `npm run user:create`

```ts
const hash = await hashPassword("my_secure_password");
```

---

### `verifyPassword(password: string, hash: string): Promise<boolean>`

Compares a plain-text password against a stored bcrypt hash.

**Called by:** `POST /api/auth/login`

```ts
const isValid = await verifyPassword(input, user.password_hash);
```

---

### `requireAuth(req, res, next)`

Express middleware that checks `req.session.userId`. Returns `401` if not set.

**Used on:** All `Auth`-gated routes.

```ts
router.get('/api/auth/me', requireAuth, async (req, res) => { ... });
```

---

### `requireAdmin(req, res, next)`

Express middleware that checks `req.session.userId` **and** `user.isAdmin === true`. Returns `401` or `403` accordingly.

**Used on:** All `/api/admin/*` routes.

---

## Rate Limiter (`server/rateLimiter.ts`)

### `createRateLimiter(options): RequestHandler`

Factory function that returns an Express middleware implementing a sliding-window rate limiter backed by the `login_attempts` table.

**Parameters:**

| Option | Type | Description |
|---|---|---|
| `windowMs` | `number` | Time window in milliseconds |
| `max` | `number` | Maximum allowed attempts in the window |

**Called by:** `POST /api/auth/login` (IP-based, 5 attempts / 15 minutes)

**Logic:**
1. Counts entries in `login_attempts` where `ipAddress = req.ip` and `attemptedAt > now() - windowMs`.
2. If count ≥ max: returns `429 Too Many Requests`.
3. Otherwise: calls `next()`.

**Reuse:** Can be applied to any route that needs rate protection. Call `createRateLimiter({ windowMs: 60_000, max: 10 })` for a 10/minute limit.

---

## Regional Scoring (`server/lib/regionalScoring.ts`)

### `recalcAllRegionalStats(): Promise<void>`

Clears and recomputes the entire `playerRegionalStats` table from raw match data.

**Called by:**
- `POST /api/admin/recalc-stats`
- `npm run regional:recalc`

**Algorithm (per player / region / season / platform):**
1. Query all placements from `cmMatchResults` / `challongeMatchResults` filtered by region + season.
2. Apply the placement-to-points scoring table (defined in `REGIONAL_SCORING.md`).
3. Sum points, count wins (placement = 1), count top-4 (placement ≤ 4).
4. Upsert the result into `playerRegionalStats`.

---

### `getRegionalLeaderboard(options): Promise<PlayerRegionalStat[]>`

Queries `playerRegionalStats` with optional filters.

**Parameters:**

| Option | Type | Description |
|---|---|---|
| `region` | `string \| undefined` | Filter by region |
| `season` | `string \| undefined` | Filter by season |
| `platform` | `"cm" \| "challonge" \| "combined"` | Filter by platform |
| `limit` | `number` | Max rows to return |

**Called by:** `GET /api/leaderboard/regional`

---

## Season Logic (`server/lib/seasons.ts`)

Determines which competitive season a date belongs to. Season boundaries are hardcoded configuration values (not stored in the database) to avoid coupling to tournament data.

### `getCurrentSeason(): string`

Returns the season identifier for today's date (e.g., `"S3"`).

**Called by:** Any endpoint that needs to default to the current season.

---

### `getSeasonForDate(date: Date): string`

Returns the season identifier for a specific date.

**Called by:** Tournament import logic (to bucket results by season).

---

### `getAllSeasons(): string[]`

Returns all season identifiers in chronological order.

**Called by:** `GET /api/seasons`

---

**To add a new season:** Edit the season boundary config at the top of `seasons.ts`. No database migration required.

---

## ChallengerMode Client (`server/lib/challengermode-client.ts`)

Low-level HTTP client for the ChallengerMode GraphQL API. Abstracts authentication and token refresh.

### `queryChallengerMode<T>(query: string, variables?: object): Promise<T>`

Executes a GraphQL query against `CHALLENGERMODE_GRAPHQL_URL`.

**Authentication:** Sends `Authorization: Bearer <token>` derived from `CHALLENGERMODE_API_KEY`. Handles 401 by refreshing the token via `CHALLENGERMODE_REFRESH_KEY` and retrying once.

**Called by:** `server/lib/challengermode.ts` (all CM data operations)

**Error handling:** Throws on GraphQL errors (the `errors` array in the response body).

```ts
const data = await queryChallengerMode<TournamentData>(`
  query GetTournament($id: ID!) {
    tournament(id: $id) { id name participants { id nickname } }
  }
`, { id: tournamentId });
```

---

## ChallengerMode Processing (`server/lib/challengermode.ts`)

Higher-level functions that use `challengermode-client.ts` to fetch data and persist it to the database.

### `fetchAndStoreTournament(tournamentId: string): Promise<void>`

Fetches a single ChallengerMode tournament by ID, normalises the data, and upserts:
- `cmPlayers` — participant profiles
- `cmMatchResults` — placement records
- `externalPlayerCombos` — reported combo associations

**Called by:** `POST /api/admin/import-tournament` (platform = "cm")

---

### `syncAllTournaments(): Promise<{ updated: number; failed: number }>`

Iterates all known CM tournament IDs and calls `fetchAndStoreTournament` for each. Returns a summary.

**Called by:** `POST /api/admin/refresh-all-tournaments`

---

### `syncPlayerAvatars(): Promise<void>`

Fetches updated avatar URLs for all `cmPlayers` and upserts the `avatar` column.

**Called by:** Admin maintenance scripts.

---

## Challonge Integration (`server/lib/challonge.ts`)

### `fetchTournament(tournamentId: string): Promise<ChallongeTournament>`

Fetches a tournament from the Challonge v2 REST API.

**Authentication:** `CHALLONGE_API_KEY` sent as `Authorization: Basic` header.

**Called by:** `syncChallongeTournament`

---

### `syncChallongeTournament(tournamentId: string): Promise<void>`

Fetches a Challonge tournament and upserts raw data into `challongeMatchResults` (as JSONB). Also extracts and upserts `challongePlayers`.

**Called by:**
- `POST /api/admin/sync-challonge`
- `POST /api/admin/import-tournament` (platform = "challonge")

---

### `extractStandings(rawData: ChallongeTournament): Standing[]`

Pure function. Parses a raw Challonge API response and returns a normalised standings array with `playerId`, `playerName`, `placement`.

**Called by:** Analytics recalculation when processing Challonge data.

---

## External Combo Scoring (`server/scoreExternalCombo.ts`)

### `scoreExternalCombo(combo: ExternalComboInput): ComboScore`

Pure function. Computes the points value for a combo based on the player's placement in a tournament.

**Input:**
```ts
{
  blade: string;
  ratchet: string;
  bit: string;
  placement: number;
  totalParticipants: number;
}
```

**Output:**
```ts
{ points: number; tier: "S" | "A" | "B" | "C" }
```

**Scoring table:** Points are awarded on a tiered basis:
- 1st place → highest points
- 2nd place → ...
- Top 4 → mid-tier points
- Participation → baseline points

The exact multipliers are defined as a constant table at the top of the file. To adjust scoring, edit only that table.

**Called by:** Stats recalculation and tournament import logic.

---

## Open Graph Image Generation (`server/og-image.ts`)

### `generateComboOgImage(combo: ComboStat): Promise<Buffer>`

Generates a 1200×630 PNG image for a combo using `@napi-rs/canvas` (a native Node.js Canvas implementation).

**Layout:**
- Background gradient based on combo tier
- Combo component names in large text
- Win rate and usage stats
- App logo

**Called by:**
- `GET /api/og/combo/:id`
- `GET /api/og/combo/:key`
- `GET /combo/:id` (for server-side OG tag injection)

**Output:** Raw `Buffer` (PNG). The route handler sets `Content-Type: image/png` and streams the buffer.

**Caching:** Generated images are cached in `externalApiCache` with the combo key as the cache key. Cache TTL is 24 hours.

---

## Object Storage (`server/objectStorage.ts`)

Abstracts over AWS S3 / MinIO for image and binary asset management.

### `getObjectUrl(path: string): string`

Resolves a public URL for an object given its storage path. Checks `PUBLIC_OBJECT_SEARCH_PATHS` (comma-separated base URLs) in order, returning the first hit.

**Called by:** Component image rendering helpers, OG image fallbacks.

---

### `uploadObject(key: string, buffer: Buffer, contentType?: string): Promise<string>`

Uploads a binary buffer to S3/MinIO under the given key.

**Returns:** The public URL of the uploaded object.

**Called by:** OG image caching, admin avatar sync.

---

### `listObjects(prefix: string): Promise<string[]>`

Lists all object keys under a path prefix.

**Called by:** Admin tooling for asset management.

---

### `getSignedUrl(key: string, expiresIn?: number): Promise<string>`

Generates a pre-signed URL for private object access.

**Called by:** Private asset delivery (if configured).

---

## Data Access Layer (`server/storage.ts`)

`storage.ts` contains typed query functions that wrap Drizzle ORM operations. All route handlers should call these functions rather than querying `db` directly.

### Naming Conventions

| Pattern | Example | Description |
|---|---|---|
| `get*` | `getComboStats()` | Read-only, returns data |
| `create*` | `createUser()` | Inserts a new row |
| `update*` | `updateUserProfile()` | Updates existing rows |
| `delete*` | `deleteFavoriteCombo()` | Deletes rows |
| `upsert*` | `upsertPlayerRegionalStats()` | Insert or update |

### Key Functions

```ts
// Users
getUser(id: number): Promise<User | undefined>
getUserByEmail(email: string): Promise<User | undefined>
createUser(data: NewUser): Promise<User>
updateUser(id: number, data: Partial<User>): Promise<User>

// Combo stats
getComboStats(season?: string): Promise<ComboStat[]>
getComboByKey(blade, ratchet, bit, season?): Promise<ComboStat | undefined>
getTopComponents(season?: string): Promise<TopComponents>

// Leaderboard
getGlobalLeaderboard(options): Promise<LeaderboardRow[]>
getPlayerByNickname(nickname: string): Promise<Player | undefined>

// Favorites
getUserFavoriteCombos(userId: number): Promise<FavoriteCombo[]>
createFavoriteCombo(userId: number, combo: NewFavoriteCombo): Promise<FavoriteCombo>
deleteFavoriteCombo(userId: number, id: number): Promise<void>
getUserFavoriteDecks(userId: number): Promise<FavoriteDeck[]>
createFavoriteDeck(userId: number, deck: NewFavoriteDeck): Promise<FavoriteDeck>
deleteFavoriteDeck(userId: number, id: number): Promise<void>

// Tournaments
getTournaments(filters?): Promise<Tournament[]>
getTournamentById(id: string): Promise<Tournament | undefined>

// External combos
upsertExternalPlayerCombos(combos: NewExternalPlayerCombo[]): Promise<void>
getPlayerCombosForTournament(tournamentId, playerId): Promise<ExternalPlayerCombo[]>

// Regional stats
upsertPlayerRegionalStats(stats: NewPlayerRegionalStat[]): Promise<void>
getRegionalLeaderboard(options): Promise<PlayerRegionalStat[]>

// Audit
createAuditLog(adminId: number, action: string, targetId?: string, details?: object): Promise<void>
```

---

## OAuth Registration

### `registerChallengerAuth(app)` (`server/auth-challenger.ts`)

Registers the ChallengerMode OAuth 2.0 callback flow on the Express app.

**Routes registered:**
- `GET /auth/challengermode` — Redirect to CM OAuth login page
- `GET /auth/challengermode/callback` — Handle OAuth callback, exchange code for token, look up CM player ID, link to `req.session.userId`

**Called once at startup from `server/index.ts`.**

---

### `registerChallongeAuth(app)` (`server/auth-challonge.ts`)

Registers the Challonge OAuth 2.0 callback flow.

**Routes registered:**
- `GET /auth/challonge` — Redirect to Challonge OAuth login
- `GET /auth/challonge/callback` — Handle OAuth callback, link Challonge account to user

**Called once at startup from `server/index.ts`.**

---

## Reuse Patterns

1. **Rate limiting** — Apply `createRateLimiter` to any write endpoint that could be abused (registration, contact forms, etc.).
2. **Season bucketing** — Always call `getSeasonForDate(date)` when importing tournament data rather than hardcoding season strings.
3. **External API caching** — Use `externalApiCache` table (via storage functions) before calling CM or Challonge APIs to avoid redundant requests.
4. **Admin audit logging** — Call `createAuditLog` at the end of every admin route handler that modifies data.
5. **OG image caching** — `generateComboOgImage` checks the cache automatically; no need to cache at the route level.
