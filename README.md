# Beybladexmeta Analytics

Two independent services behind one public origin:

| | | |
|---|---|---|
| `frontend/` | React 18 + Vite + wouter + TanStack Query | served by nginx |
| `backend/`  | Express + Drizzle + Postgres | Node, being migrated to FastAPI |
| `backend-py/` | FastAPI + SQLAlchemy | takes over routes one group at a time |

The frontend does **not** import anything from the backend. It calls the API with
relative URLs and declares the response shapes itself in
`frontend/src/types/api.ts`, so replacing the Express backend with a Python one
is invisible to it.

## Local setup

Prerequisites: Node 20+, Docker, and a copy of the production dump at
`docker/initdb/10-beyblade.sql.gz` (see [Getting the data](#getting-the-data)).

```bash
npm run install:all      # installs frontend/ and backend/ separately
npm run db:up            # Postgres on :5433, seeded from the dump on first start
cp backend/.env.example  backend/.env    # then fill in
cp frontend/.env.example frontend/.env   # then fill in
npm run dev              # express :5000 + fastapi :8000 + frontend :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` and
`/sitemap.xml` to the backend, so the browser sees a single origin and the
session cookie behaves exactly as it does in production.

Other root scripts: `npm run build`, `npm run check` (typecheck),
`npm run db:psql`, `npm run db:reset` (wipes the volume and re-seeds).

### Getting the data

The local database is a replica of production. The dump is **not** committed —
it contains real emails and password hashes.

To take a fresh one from the VPS (Coolify Postgres container, see
`docs/` for the current container id):

```bash
# 1. On the VPS: dump the database out of the Coolify Postgres container
ssh -i ~/Desktop/oracle/ssh-key-2026-08-19.key ubuntu@92.4.170.189
CID=$(sudo docker ps --filter "ancestor=postgres:18-alpine" --format '{{.ID}}' | head -1)
sudo docker exec "$CID" pg_dump -U postgres -d beyblade_tracker --no-owner --no-privileges \
  | gzip > ~/beyblade_tracker.sql.gz
exit

# 2. On your machine: pull it into the seed directory
scp -i ~/Desktop/oracle/ssh-key-2026-08-19.key \
    ubuntu@92.4.170.189:~/beyblade_tracker.sql.gz \
    docker/initdb/10-beyblade.sql.gz

# 3. Recreate the local database from it
npm run db:reset
```

`db:reset` destroys the local volume, so the dump is re-applied from scratch;
without it, an existing volume means the seed scripts are skipped entirely.

## Environment variables

`VITE_*` variables are **baked into the JS bundle at build time** — changing one
requires a rebuild, not a restart. Everything else is read by the backend at
runtime. Each service has its own `.env`; see the two `.env.example` files.

Two that are new to the split:

- `FRONTEND_ORIGIN` (backend) — where to fetch `index.html` from in order to
  inject OG tags on `/combo/:id`.
- `CORS_ORIGINS` (backend) — leave **empty** for the single-origin deployment.
  Set it only if the frontend ever moves to its own domain, and note the session
  cookie would then need `SameSite=None; Secure`.

## Deployment

`docker-compose.prod.yml` builds both images. Traefik/Coolify terminates TLS and
routes the domain to `frontend`; nginx there serves the SPA and reverse-proxies
`/api`, `/sitemap.xml` and `/combo` to `backend`.

Keeping one origin is deliberate: authentication is a cookie session
(`express-session` + `connect-pg-simple`), and a second origin would mean CORS
with credentials plus relaxed cookie flags for no real benefit.

## Migrating to FastAPI (strangler fig)

`backend-py/` takes routes over from `backend/` a few at a time. Both services
run side by side against the same database, and **`strangler-routes.json` is the
single source of truth** for who answers what: nginx routes a listed path to
FastAPI and everything else to Express.

Sessions are shared, so a user logged in through Express is logged in on the
FastAPI routes too: `backend-py/app/auth.py` verifies the same signed
`connect.sid` cookie and reads the same `session` table. Both services therefore
need the **same `SESSION_SECRET` and the same `DATABASE_URL`**.

To move a route across:

1. Implement it in `backend-py/`, matching the response exactly — including
   error bodies, which are `{"error": "..."}`, not FastAPI's `{"detail": ...}`.
2. Add it to `strangler-routes.json` (with `samples` for any query-string
   variants worth checking).
3. `npm run strangler:sync` — regenerates the nginx location blocks. The Vite
   dev server reads the JSON directly and needs no regeneration.
4. `npm run strangler:parity` — calls both backends and diffs every response.
   It exits non-zero on any difference, so it can gate a deploy.
5. If the route **writes**, also run the write checks (below).
6. Once green, delete the Express implementation.

### Checking routes that write

`parity.py` cannot send a write to both backends — the effect would happen
twice. `tools/parity_writes.py` instead performs each write on ONE backend and
reads it back from the OTHER, in both directions, then deletes what it made.
That also proves the two really do share a session and a database. Requests that
get rejected change nothing, so those are sent to both and compared directly.

```bash
npm run strangler:session          # mints a signed connect.sid for an admin
npm run strangler:parity-writes -- --cookie 'connect.sid=...' \n    --challonge-cookie 'connect.sid=...'   # optional; unlocks the alias checks
```

`strangler:session` writes a real session row and signs the cookie the way
express-session would, which is the only practical way in: the login form
requires reCAPTCHA.

`X-Served-By: fastapi` is set on every FastAPI response, so you can always tell
which backend answered. `GET /api/_py/whoami` (reachable only on the service
port, never through nginx) reports who FastAPI thinks you are — useful when a
session problem is suspected.

### Migrated so far

| Group | Routes |
|---|---|
| System | `/api/health`, `/api/components`, `/api/seasons` |
| Combo stats | `/api/stats/combos`, `/api/stats/combos/by-key`, `/api/stats/combos/by-slug` |
| Component stats | `/api/stats/top/{blade,ratchet,bit,components}`, `/api/stats/leaderboard/{blade,ratchet,bit}` |
| Analytics | `/api/analytics/meta`, `/api/trends`, `/api/synergy` |
| Players | `/api/stats/leaderboard`, `/api/stats/player/:nickname`, `/api/player-rankings`, `/api/players/:id`, `/api/players/by-nickname/:nickname`, `/api/leaderboard/regional` |
| Favourites | `/api/favorites/combos`, `/api/favorites/decks` (GET, POST and DELETE) |
| Aliases | `/api/user/aliases` (GET, POST and DELETE) |

Still on Express, and deliberately not caught by the rules above — all three
call the ChallengerMode API through `server/challengermode.ts` and move when
that client does:

- `/api/stats/combos/:comboKey/tournaments`
- `/api/players/:id/tournaments`
- `/api/players/by-nickname/:nickname/tournaments`

This is why the rules are exact matches and anchored regexes rather than
prefixes: `^/api/players/[^/]+$` claims the profile but leaves the `/tournaments`
route below it on Express.

### Quirks preserved on purpose

Parity means copying the behaviour that is actually shipped, not the behaviour
that was intended. Two cases are reproduced deliberately and should be fixed in
both backends at once, or in neither:

- `/api/stats/combos` **ignores `search` whenever `season` is set.** The Express
  handler calls `.where()` twice and Drizzle keeps only the last condition.
- The SQL that builds combo slugs lowercases *after* stripping non-lowercase
  characters, so `WizardRod` becomes `izardod`, not `wizardrod`. `by-slug` and
  the sitemap use that SQL; the `by-key` fallback uses a JS helper that
  lowercases first, so the two disagree on what a slug is.

Also worth knowing when porting: endpoints built with the Drizzle query builder
return timestamps as ISO strings (`2026-01-14T13:25:19.053Z`), while endpoints
built on raw `db.execute` return the unparsed Postgres text
(`2026-01-14 13:25:19.053603+00`). Aggregates over integer columns (`SUM`,
`COUNT`) arrive as bigint, which node-postgres renders as a **string**, while
sums over `double precision` arrive as numbers. `app/serialization.py` exists to
reproduce all four cases.

## Documentation

`docs/backend/api-endpoints.md` documents all ~70 endpoints with their auth
level and payloads — it is the contract the FastAPI port has to reproduce.
`docs/backend/business-logic.md` and `docs/backend/database-schema.md` cover
scoring and the data model.

> Note: `docs/README.md` still describes the pre-split single-package layout
> (`client/`, `server/`, `shared/`).
