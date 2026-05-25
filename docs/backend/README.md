# Backend Documentation

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Server Entry Point](#server-entry-point)
- [Middleware Stack](#middleware-stack)
- [Authentication](#authentication)
- [Session Management](#session-management)
- [Database Layer](#database-layer)
- [Business Logic Modules](#business-logic-modules)
- [Object Storage](#object-storage)
- [External API Integrations](#external-api-integrations)
- [Utility Scripts](#utility-scripts)
- [Error Handling](#error-handling)

---

## Overview

The backend is an **Express.js** server written in TypeScript, running on Node.js 18+. It serves as both the API server and the static file host for the React SPA.

Key characteristics:

- **Single process** — API routes and static file serving coexist in one Node.js process.
- **Drizzle ORM** — All database access goes through Drizzle ORM with a PostgreSQL driver. No raw SQL in route handlers (analytics views are defined in SQL migrations, not inline).
- **Session-based auth** — `express-session` with a PostgreSQL store provides server-side sessions. No JWT tokens.
- **External platform integrations** — ChallengerMode (GraphQL) and Challonge (REST) are the primary data sources for tournament results.
- **Shared schema** — `shared/schema.ts` is the single source of truth for database table definitions and TypeScript types, shared between server and client.

---

## Directory Structure

```
server/
├── lib/
│   ├── challengermode-client.ts   # HTTP client for ChallengerMode GraphQL API
│   ├── challengermode.ts          # ChallengerMode data processing logic
│   ├── challonge.ts               # Challonge REST API integration
│   ├── regionalScoring.ts         # Regional leaderboard calculation engine
│   └── seasons.ts                 # Season/era boundary determination
├── auth.ts                        # Password hashing, auth helper functions
├── auth-challenger.ts             # ChallengerMode OAuth flow registration
├── auth-challonge.ts              # Challonge OAuth flow registration
├── challengermode.ts              # ChallengerMode route-level integration
├── create-user.ts                 # CLI script: create a user account
├── db.ts                          # Drizzle ORM database connection
├── index.ts                       # Server entry point, middleware setup
├── objectStorage.ts               # S3/MinIO object storage helpers
├── og-image.ts                    # Open Graph image generation (@napi-rs/canvas)
├── rateLimiter.ts                 # Rate limiting middleware factory
├── routes.ts                      # All 68+ API route handlers
├── scoreExternalCombo.ts          # Scoring logic for external combo data
├── seed.ts                        # Database seeding script
├── seed-combos.ts                 # Combo-specific seeding script
├── storage.ts                     # Data access layer (DAL) functions
└── vite.ts                        # Vite dev-server integration

shared/
└── schema.ts                      # Drizzle ORM table definitions (shared with client)

scripts/                           # CLI utility scripts (tsx-run, not served)
├── db-create.ts                   # Create the database
├── db-add-tournaments.ts          # Add tournament tables migration
├── db-test-conn.ts                # Test database connection
├── import-csv.ts                  # Bulk import from CSV
├── migrate-challonge-combos.ts    # Challonge combo migration
├── debug-challonge-data.ts        # Debugging Challonge data
├── player-leaderboard-view.ts     # Inspect player leaderboard view
├── recalc-regional.ts             # Recalculate regional scores
└── fetch-cm-tournament.ts         # Fetch ChallengerMode tournament data
```

---

## Server Entry Point

**File:** `server/index.ts`

The entry point performs the following in order:

1. Creates the Express app and disables the `X-Powered-By` header.
2. Sets `trust proxy` to `5` (supports Cloudflare → ingress → app proxy chains).
3. Applies security headers middleware (CSP, HSTS, X-Frame-Options, etc.).
4. Applies `express.json()` with a raw body capture hook (for potential webhook validation).
5. Applies request logging middleware that redacts sensitive fields (`password`, `email`, `photoURL`).
6. Attempts to connect to PostgreSQL and configure the session store (falls back to in-memory store on failure).
7. Registers OAuth handlers: `registerChallengerAuth`, `registerChallongeAuth`.
8. Calls `registerRoutes(app)` — which registers all API routes.
9. Registers the `/api/health` endpoint.
10. Registers the global error handler.
11. Serves the built React SPA via `express.static`.
12. Starts listening on `process.env.PORT` (default `5000`).

---

## Middleware Stack

Applied in order to every incoming request:

| Middleware | Purpose |
|---|---|
| Security headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection |
| `express.json()` | Parse JSON bodies; capture raw body for potential signature verification |
| `express.urlencoded()` | Parse form-encoded bodies |
| Request logger | Log `METHOD PATH STATUS in Xms` for all `/api/*` calls; redacts sensitive data |
| `express-session` | Attach session to `req.session` (PostgreSQL or memory store) |
| ChallengerMode OAuth routes | OAuth callback endpoints for ChallengerMode |
| Challonge OAuth routes | OAuth callback endpoints for Challonge |
| Route handlers | All `/api/*` routes from `routes.ts` |
| Global error handler | Catches DB errors, returns clean 503/500 |
| `express.static` | Serves `dist/public/` (React SPA) |
| SPA catch-all | Returns `index.html` for all non-API 404s |

---

## Authentication

**File:** `server/auth.ts`

Provides utility functions used by route handlers:

```ts
hashPassword(password: string): Promise<string>
verifyPassword(password: string, hash: string): Promise<boolean>
requireAuth(req, res, next): void        // Middleware: 401 if not authenticated
requireAdmin(req, res, next): void       // Middleware: 403 if not admin
```

**Session shape (`req.session`):**
```ts
{
  userId: number;
  // (express-session standard fields: id, cookie, etc.)
}
```

**Registration flow:**
1. Client posts to `POST /api/auth/register` with `email`, `password`, `displayName`.
2. reCAPTCHA token is verified server-side (Enterprise or v3, depending on env).
3. Password is hashed with bcrypt (10 rounds).
4. A verification email is sent via Resend with a token link.
5. Account is created with `isVerified: false`.
6. User clicks the email link → `GET /api/auth/verify?token=<token>` → account activated.

**Login flow:**
1. `POST /api/auth/login` — rate-limited (IP-based via `rateLimiter.ts`).
2. Looks up user by email, verifies bcrypt hash.
3. On success: sets `req.session.userId`, saves session to PostgreSQL store.
4. Login attempts are logged to `login_attempts` table for auditing.

---

## Session Management

**Configuration (in `server/index.ts`):**

```ts
app.use(session({
  store: new PgStore({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,   // HTTPS-only in production
    httpOnly: true,          // Not accessible from JS
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 1 week
    sameSite: 'lax',         // CSRF protection
  },
}));
```

If `DATABASE_URL` is missing or the connection fails on startup, the server falls back to the **in-memory session store** (`memorystore`). Sessions are lost on restart in this mode.

---

## Database Layer

### Connection (`server/db.ts`)

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

The `db` instance is the sole entry point for all database operations. It is imported throughout `storage.ts` and `routes.ts`.

### Schema (`shared/schema.ts`)

See [database-schema.md](database-schema.md) for the full schema reference.

### Data Access Layer (`server/storage.ts`)

`storage.ts` exports typed functions that wrap Drizzle queries. Route handlers call these functions rather than querying `db` directly. This keeps route handlers thin and database logic testable in isolation.

Example pattern:
```ts
// storage.ts
export async function getComboStats(season?: string) {
  return db.select().from(comboStats).where(season ? eq(comboStats.season, season) : undefined);
}

// routes.ts
router.get('/api/stats/combos', async (req, res) => {
  const data = await getComboStats(req.query.season as string);
  res.json(data);
});
```

### Migrations

Managed by **Drizzle Kit**. Migration files are in `migrations/`.

```bash
npm run db:push          # Push current schema (dev, no migration file created)
npx drizzle-kit generate # Generate a new migration file from schema changes
npx drizzle-kit migrate  # Apply pending migrations
```

Migration history:
```
0000_mushy_lucky_pierre.sql           — Initial schema
0001_add_tournaments.sql              — Tournament tables
0002_cm_refactor.sql                  — ChallengerMode data model refactor
0003_external_player_combos_scoring.sql — Scoring system
0004_update_external_player_combos_fk.sql — FK constraint updates
0005_add_season_to_combo_stats_pk.sql — Season added to composite PK
0006_add_missing_stats_pks.sql        — Complete missing PKs
add_tournament_name_to_challonge_combos.sql — Tournament name column
```

---

## Business Logic Modules

### `server/lib/regionalScoring.ts`

**Purpose:** Computes regional leaderboard scores for all players.

**Key function:**
```ts
recalcAllRegionalStats(): Promise<void>
```

Called by `POST /api/admin/recalc-stats` and the `npm run regional:recalc` script.

**Logic:**
1. Queries all `cmMatchResults` and `challongeMatchResults` grouped by region and season.
2. Applies the regional scoring formula (documented in `REGIONAL_SCORING.md`).
3. Upserts computed scores into `playerRegionalStats`.

### `server/lib/seasons.ts`

**Purpose:** Determines which "season" or "era" a given date falls into.

**Key exports:**
```ts
getCurrentSeason(): string           // Returns season identifier (e.g., "S1", "S2")
getSeasonForDate(date: Date): string
getAllSeasons(): string[]
```

Used whenever combo stats or leaderboard entries need to be bucketed by season.

### `server/lib/challengermode-client.ts`

**Purpose:** Low-level HTTP client for the ChallengerMode GraphQL API.

**Key exports:**
```ts
queryChallengerMode<T>(query: string, variables?: object): Promise<T>
```

Uses `axios` with `CHALLENGERMODE_GRAPHQL_URL` and `CHALLENGERMODE_API_KEY` from env. Handles token refresh via `CHALLENGERMODE_REFRESH_KEY`.

### `server/lib/challengermode.ts`

**Purpose:** Higher-level ChallengerMode data processing.

**Key functions:**
```ts
fetchAndStoreTournament(tournamentId: string): Promise<void>
syncAllTournaments(): Promise<void>
syncPlayerAvatars(): Promise<void>
```

Fetches tournament data from ChallengerMode, normalises it, and upserts into `cmMatchResults`, `cmPlayers`, and `externalPlayerCombos`.

### `server/lib/challonge.ts`

**Purpose:** Challonge REST API integration.

**Key functions:**
```ts
fetchTournament(tournamentId: string): Promise<ChallongeTournament>
syncChallongeTournament(tournamentId: string): Promise<void>
```

Calls the Challonge v2 REST API using `CHALLONGE_API_KEY`. Raw responses are stored as JSONB in `challongeMatchResults`.

### `server/scoreExternalCombo.ts`

**Purpose:** Scoring engine for externally reported combos (Challonge-reported combos not yet in the database).

**Key function:**
```ts
scoreExternalCombo(combo: ExternalComboInput): ComboScore
```

Computes placement-based points using the regional scoring table.

### `server/og-image.ts`

**Purpose:** Generates Open Graph images for combo pages using `@napi-rs/canvas`.

**Key function:**
```ts
generateComboOgImage(combo: ComboStat): Promise<Buffer>
```

Returns a PNG buffer suitable for serving directly from the `/api/og/combo/:key` endpoint.

### `server/rateLimiter.ts`

**Purpose:** Pluggable rate limiter middleware.

**Key function:**
```ts
createRateLimiter(options: { windowMs: number; max: number }): RequestHandler
```

Used to limit `POST /api/auth/login` to prevent brute-force attacks.

### `server/objectStorage.ts`

**Purpose:** Abstraction over S3/MinIO for image and asset management.

**Key functions:**
```ts
getObjectUrl(path: string): string              // Resolve public URL
uploadObject(key: string, buffer: Buffer): Promise<string>
listObjects(prefix: string): Promise<string[]>
```

---

## External API Integrations

### ChallengerMode (GraphQL)

- **Auth:** API key in `Authorization` header + OAuth for user linking.
- **Transport:** GraphQL over HTTPS (`CHALLENGERMODE_GRAPHQL_URL`).
- **Data flow:** Tournaments → players → match results → combo usage.
- **OAuth:** `server/auth-challenger.ts` handles the `/auth/challengermode` OAuth flow for linking user accounts.

### Challonge (REST v2)

- **Auth:** `CHALLONGE_API_KEY` as query parameter or `Authorization` header.
- **Transport:** REST + JSON (`CHALLONGE_API_REST_URL`).
- **Data flow:** Tournament brackets → standings → user-reported combos.
- **OAuth:** `server/auth-challonge.ts` handles the `/auth/challonge` OAuth flow.

### Resend (Email)

- **Purpose:** Transactional email for registration verification.
- **SDK:** Official `resend` npm package.
- **Template:** HTML email with a verification link.
- **Trigger:** `POST /api/auth/register`.

### Google reCAPTCHA

- **Version:** Enterprise or v3, based on `VITE_RECAPTCHA_USE_ENTERPRISE`.
- **SDK:** `@google-cloud/recaptcha-enterprise`.
- **Trigger:** `POST /api/auth/register`.
- **Logic:** Token from client is verified server-side; score threshold checked before creating the account.

---

## Utility Scripts

All scripts in `scripts/` are run with `tsx` and are not served by the HTTP server.

| Script | Command | Purpose |
|---|---|---|
| `db-create.ts` | `npm run db:create` | Create PostgreSQL database |
| `db-test-conn.ts` | `npm run db:test-conn` | Test database connectivity |
| `import-csv.ts` | `npm run db:import` | Bulk import combo data from CSV |
| `recalc-regional.ts` | `npm run regional:recalc` | Recalculate all regional stats |
| `migrate-challonge-combos.ts` | `npm run migrate:challonge-combos` | Run Challonge combo migration |
| `debug-challonge-data.ts` | `npm run debug:challonge-data` | Debug Challonge data issues |
| `player-leaderboard-view.ts` | `npm run players:view` | Inspect player leaderboard view |
| `fetch-cm-tournament.ts` | (direct tsx) | Fetch a single CM tournament |
| `db-add-tournaments.ts` | `npm run db:migrate:tournaments` | Add tournament tables |
| `server/create-user.ts` | `npm run user:create` | Interactive user creation CLI |
| `server/seed.ts` | `npx tsx server/seed.ts` | Seed initial data |

---

## Error Handling

### Global Error Handler (`server/index.ts`)

Catches any error thrown or passed to `next(err)`:

- **Database connection errors** (ECONNREFUSED, ETIMEDOUT, PostgreSQL error codes 57P01, 08006) → `503 Service Unavailable` with a clean JSON body.
- **All other errors** → status from `err.status` or `500`, with `err.message`.

### Route-level Error Handling

Route handlers use `try/catch` blocks and call `next(err)` or directly return error responses:

```ts
router.get('/api/stats/combos', async (req, res, next) => {
  try {
    const data = await getComboStats();
    res.json(data);
  } catch (err) {
    next(err);
  }
});
```

### Logging

Request logging is applied globally. Auth route responses are not logged (to avoid leaking credentials). Sensitive fields in logged response bodies are redacted:
- `password` → `[redacted]`
- `password_hash` → `[redacted]`
- `verification_token` → `[redacted]`
- `email` → partially masked (`jo***@example.com`)
- `photoURL` → `[redacted]`

---

*For API endpoint reference, see [api-endpoints.md](api-endpoints.md).*  
*For database schema reference, see [database-schema.md](database-schema.md).*
