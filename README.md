# Beybladexmeta Analytics

Two services behind one public origin:

| | | |
|---|---|---|
| `frontend/` | React 18 + Vite + wouter + TanStack Query | served by nginx, which also proxies the API |
| `backend-py/` | FastAPI + SQLAlchemy + asyncpg | serves every route |
| `migrations/` | numbered SQL | the schema of record, applied by `tools/migrate.py` |

The frontend does **not** import anything from the backend. It calls the API with
relative URLs and declares the response shapes itself in
`frontend/src/types/api.ts` — which is what let the original Express backend be
replaced route by route without the frontend noticing. That migration finished
on 2026-08-21 and the Express service was removed; it is in the git history up
to commit `465343b`, along with the parity harnesses that proved the two agreed
on all 176 compared URLs.

## Local setup

Prerequisites: Node 20+, Docker, and a copy of the production dump at
`docker/initdb/10-beyblade.sql.gz` (see [Getting the data](#getting-the-data)).

```bash
npm run install:all      # frontend deps + backend-py via uv
npm run db:up            # Postgres on :5433, seeded from the dump on first start
cp backend-py/.env.example backend-py/.env   # then fill in
cp frontend/.env.example   frontend/.env     # then fill in
npm run dev              # fastapi :8000 + frontend :5173
```

Open <http://localhost:5173>. The Vite dev server proxies `/api`, `/sitemap.xml`
and `/combo/` to the backend, so the browser sees a single origin and the session
cookie behaves exactly as it does in production.

Other root scripts: `npm run build`, `npm run check` (typecheck),
`npm run db:psql`, `npm run db:reset` (wipes the volume and re-seeds),
`npm run session` (mints an admin cookie), `npm run user:create`.

### Getting the data

The local database is a replica of production. The dump is **not** committed —
it contains real emails and password hashes.

```bash
# 1. On the VPS: dump the database out of the Coolify Postgres container
ssh -i ~/Desktop/oracle/ssh-key-2026-08-19.key ubuntu@YOUR_VPS_IP
CID=$(sudo docker ps --filter "ancestor=postgres:18-alpine" --format '{{.ID}}' | head -1)
sudo docker exec "$CID" pg_dump -U postgres -d beyblade_tracker --no-owner --no-privileges \
  | gzip > ~/beyblade_tracker.sql.gz
exit

# 2. On your machine: pull it into the seed directory
scp -i ~/Desktop/oracle/ssh-key-2026-08-19.key \
    ubuntu@YOUR_VPS_IP:~/beyblade_tracker.sql.gz \
    docker/initdb/10-beyblade.sql.gz

# 3. Recreate the local database from it
npm run db:reset
```

`db:reset` destroys the local volume, so the dump is re-applied from scratch;
without it an existing volume means the seed scripts are skipped entirely.

Coolify also takes a nightly backup of production at 03:00, keeping seven. Those
are `pg_dump --format=custom`, so they restore with `pg_restore`, not `psql`.

## Database schema

`migrations/` holds numbered SQL files and `tools/migrate.py` applies them,
recording what ran in a `schema_migrations` table. See `migrations/README.md`.

```bash
python tools/migrate.py --url "$DATABASE_URL" --status
python tools/migrate.py --url "$DATABASE_URL" --apply
```

There is no ORM: the backend issues SQL directly, so these files are the
definition of the schema rather than generated output. `migrations/schema.sql`
is a readable snapshot of the current state — reference only, nothing applies it.

## Environment variables

`VITE_*` variables are **baked into the JS bundle at build time** — changing one
requires a rebuild, not a restart. Everything else is read at runtime. Each
service has its own `.env`; see the two `.env.example` files.

Two worth calling out:

- `FRONTEND_ORIGIN` — where the backend fetches `index.html` from in order to
  inject OG tags on `/combo/:id`. Without it that route 404s.
- `CORS_ORIGINS` — leave **empty** for the single-origin deployment. Set it only
  if the frontend ever moves to its own domain, and note the session cookie
  would then need `SameSite=None; Secure`.

`SESSION_SECRET` signs the `connect.sid` cookies already in people's browsers.
Changing it logs everyone out.

## Deployment

`docker-compose.prod.yml` builds both images. Traefik/Coolify terminates TLS and
routes the domain to `frontend`; nginx there serves the SPA and reverse-proxies
`/api`, `/sitemap.xml` and `/combo` to `${API_UPSTREAM}`.

Keeping one origin is deliberate: authentication is a cookie session in the
`session` table (the format `express-session` wrote, kept for compatibility with
sessions issued before the migration), and a second origin would mean CORS with
credentials plus relaxed cookie flags for no real benefit.

The Coolify application is a **Docker Compose** resource pointed at
`/docker-compose.prod.yml`, and with that build pack the domain belongs to the
`frontend` *service*, not to the resource. Auto-deploy is on: a push to `main`
goes live.

nginx forwards `X-Forwarded-Proto` from Traefik rather than overwriting it with
its own scheme. The OAuth handlers build their `redirect_uri` from that header,
and Traefik terminates TLS, so overwriting it would offer the provider an
`http://` callback and get the login rejected.

`/api/_py/` returns 404 at the edge, which keeps FastAPI's Swagger UI off the
public origin. It is still reachable on the service port during development at
<http://127.0.0.1:8000/api/_py/docs>. `X-Served-By: fastapi` is set on every
response.

## The assistant (RAG)

`backend-py/app/lib/rag/` answers questions about Beyblade X by combining two
kinds of data that live in different places: the **mechanics**, which are text
and get embedded, and the **tournament numbers**, which stay in SQL and are
reached through six typed tools. A vector index cannot sort, sum or compare, so
nothing numeric is ever indexed.

It is reachable at `/chat`, and from a launcher on every page.

```
POST /api/chat          one JSON response
POST /api/chat/stream   the same answer as SSE (six event types)
GET  /api/admin/chat-errors   failures with full detail (admin only)
```

Migrations `0010`–`0016`. Corpus in `knowledge/`, ingested with
`python -m app.lib.rag.cli ingest`. Two evaluation gates, to be run after any
change to retrieval or prompting:

```bash
python tools/eval_retrieval.py  --url "$DATABASE_URL" --provider voyage
python tools/eval_generation.py --url "$DATABASE_URL"
```

**Full documentation — how it was built, every decision and every defect found —
is in [`docs/rag/`](docs/rag/README.md)** (written in Italian, like the code
comments it describes). Start with
[the central decision](docs/rag/01-la-decisione-centrale.md) and
[the defects that teach](docs/rag/07-errori-che-insegnano.md).

## Tools

Everything in `tools/` is standalone and takes `--help`.

| | |
|---|---|
| `migrate.py` | apply and track schema migrations |
| `create_user.py` | create an account directly — registration needs a captcha and an emailed link, so this is how the first admin gets made |
| `dev_session.py` | mint a signed `connect.sid` for an admin, against the **local** database |
| `import_challonge_json.py` | bulk-load scraped Challonge tournaments through the admin import endpoint |
| `convert-images-to-webp.py` | add a WebP beside every component PNG that lacks one |
| `seed_component_registry.py` | populate the part registry from tournament data — run before any knowledge ingest |
| `check_kb_registry.py` | five consistency checks; re-measures the closest pair of part names and fails if a new part closes the gap |
| `scaffold_knowledge.py` | create empty knowledge sheets for every registered part |
| `import_wiki_facts.py`, `import_beybladewiki.py` | pull profiles and descriptions from the two wikis, marked with their provenance |
| `import_meta_snapshot.py` | load the dated community meta sheet |
| `generate_synergies.py` | derive recurring pairings from the site's own statistics |
| `knowledge_priority.py` | order the sheets still to be written by how often the part shows up in tournaments |
| `calibrate_abstention.py` | measure the rerank-score populations behind `RERANK_FLOOR` |
| `eval_retrieval.py`, `eval_generation.py` | the two gates: did it find the right documents, and what did it write with them |
| `harvest_questions.py` | pull real questions that went wrong out of `chat_message`, as golden-set candidates |

## Talking to ChallengerMode

Tournament names and schedules live in ChallengerMode's API, not our database.
`backend-py/app/lib/challengermode.py` caches responses in the
`external_api_cache` table; `CHALLENGERMODE_CACHE_TTL_MINUTES` controls for how
long (default 1440, matching what the old backend used).

Every HTTP client in `backend-py` sets `follow_redirects=True`. That is not
optional: node's `fetch` and `axios` follow redirects by default and httpx does
not, and `challengermode.com/oauth/token` answers **307** to
`www.challengermode.com`. Without it the token exchange silently returns an
empty body and account linking fails with a misleading message.

### Why the tournament archive needs our own tables

ChallengerMode's `tournamentsForGame` returns **at most 50 tournaments**, newest
first. Its filter accepts only `tournamentsAfter` — there is no upper bound, no
cursor and no limit argument (confirmed by introspecting the schema). So once
more than 50 tournaments exist, older ones drop out of the API response for
good, and moving the `after` date backwards does not bring them back.

`GET /api/tournaments` therefore unions the API response with everything in
`tournaments_view`, filling in each recovered entry from the cached detail.

## Challonge

Results are scraped separately (see the `script_challonge_test` repo, which
writes one JSON per tournament) and loaded with
`tools/import_challonge_json.py`. It reports before it sends and refuses files
the scraper got wrong: a `start_date` that is not a date, a missing standings
list, or an id that is a URL sub-page — `challonge.com/it/<slug>/standings`
yields the id `standings`, and two such files would overwrite each other.

Importing standings gives points and players. It does **not** produce a meta:
`/api/analytics/meta` reads `challonge_reported_combos`, which is what a player
says they used, and that only arrives when someone claims their combos.

The Challonge v1 REST API is the way to resolve a tournament's real date —
`api.challonge.com/v1/tournaments/<id>.json?api_key=...` returns `start_at`.
Scraping the web page instead gets a Cloudflare challenge. Note the API renders
timestamps in a **randomly varying timezone**, so compare instants, never
strings.

## Serialization

`backend-py/app/serialization.py` exists because the original backend's
responses were not uniform, and the frontend parses what it was given.
Endpoints built with the Drizzle query builder returned timestamps as ISO
strings (`2026-01-14T13:25:19.053Z`); endpoints built on raw SQL returned the
unparsed Postgres text (`2026-01-14 13:25:19.053603+00`). Aggregates over
integer columns (`SUM`, `COUNT`) arrive as bigint, which node-postgres rendered
as a **string**, while sums over `double precision` arrived as numbers. All four
cases are reproduced deliberately.

## Component images

Images live in the Garage bucket `beyblades`, under `blades/`, `ratchets/`,
`bits/`, `assist-blades/` and `chips/`. The frontend asks for `<name>.webp`
first and falls back to `<name>.png`, trying three name spellings for each — so
a missing WebP costs three failed requests before the fallback lands.

`tools/convert-images-to-webp.py` adds a WebP next to every PNG that lacks one.
It never deletes anything, so it is safe to re-run:

```bash
uv run tools/convert-images-to-webp.py           # report what is missing
uv run tools/convert-images-to-webp.py --apply   # convert and upload
```

It reads `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` from `backend-py/.env`.
The first run converted 96 images and took the set from 63.6 MB to 6.3 MB.

## Documentation

`docs/backend/api-endpoints.md` documents the endpoints with their auth level
and payloads; `docs/backend/business-logic.md` and
`docs/backend/database-schema.md` cover scoring and the data model. They were
written for the Express implementation, which FastAPI reproduces route for
route, so the contracts still hold even though the file paths they mention do
not.

`docs/README.md` predates both the split and the migration: it describes the
original single-package layout (`client/`, `server/`, `shared/`) and should be
read as history.
