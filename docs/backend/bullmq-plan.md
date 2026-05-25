# BullMQ Integration Plan

## Why BullMQ

Several operations in the current backend are slow, expensive, and block the HTTP response:

| Current bottleneck | Where | Problem |
|--------------------|-------|---------|
| `REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot` | admin routes, tournament claim | Blocks response for seconds |
| `processExternalCombo` × 9 calls | `/api/admin/tournament-results/external` | Sequential DB writes, blocks admin |
| `recalculateRegionalStatsForTournament` | multiple admin endpoints | Full table scan per tournament |
| Email verification send | `/api/auth/register` | External HTTP call in request path |
| Challonge tournament sync | `/api/admin/sync-challonge` | External API rate-limited, blocks admin |
| CM tournament detail fetch (per tournament) | `/api/tournaments` list | N+1 HTTP calls, each ~500ms |

BullMQ (backed by Redis) lets these run in the background: the HTTP route enqueues a job and returns immediately, the worker picks it up.

---

## Architecture

```
Express App                Redis              Worker Process(es)
─────────────              ─────              ──────────────────
POST /api/admin/..  ──→  [queue: stats]  ──→  StatsWorker
  return { jobId }         [queue: sync]  ──→  SyncWorker
                           [queue: email] ──→  EmailWorker
GET /api/jobs/:id   ←──  job.getState()
```

Workers can run in the **same Node process** initially (simplest, no new infra) or be extracted to a separate container later.

---

## Required Infrastructure

### Redis
- Add Redis as a dependency (Docker Compose service or managed instance)
- Connection via `REDIS_URL` env var (e.g. `redis://localhost:6379`)

```yaml
# docker-compose.yml addition
redis:
  image: redis:7-alpine
  container_name: redis
  restart: always
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  networks:
    - app-net
```

### Packages
```
npm install bullmq ioredis
```

---

## Queue Definitions

### 1. `stats` queue — Aggregate stat updates

**Jobs:**
- `refresh-materialized-view` — runs `REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`
- `recalc-regional-stats` — calls `recalculateRegionalStatsForTournament(tournamentId)`
- `recalc-all-regional-stats` — calls `recalculateAllRegionalStats()`
- `process-external-combos` — bulk `processExternalCombo` calls after a tournament submission

**Trigger points (current code → new):**
- `POST /api/admin/tournament-results/external` → enqueue `process-external-combos` + `refresh-materialized-view` + `recalc-regional-stats`
- `POST /api/tournaments/:id/claim` → enqueue `refresh-materialized-view`
- `POST /api/admin/recalc-stats` → enqueue `recalc-all-regional-stats`

**Worker options:**
```typescript
const statsWorker = new Worker('stats', statsProcessor, {
  connection: redisConnection,
  concurrency: 1,           // stat updates must be serialized
  limiter: { max: 1, duration: 5000 },
});
```

---

### 2. `sync` queue — External API synchronization

**Jobs:**
- `sync-challonge` — calls `syncChallongeTournaments()`
- `sync-cm-tournament` — refreshes one CM tournament via `fetchTournamentDetail(id)`
- `sync-all-cm-tournaments` — iterates all known tournament IDs (replaces the loop in `refresh-all-tournaments`)

**Trigger points:**
- `POST /api/admin/sync-challonge` → enqueue `sync-challonge` and return `{ jobId }`
- `POST /api/admin/refresh-all-tournaments` → enqueue `sync-all-cm-tournaments`
- Scheduled (cron): `sync-challonge` daily at 03:00, `sync-all-cm-tournaments` every 6 hours

**Worker options:**
```typescript
const syncWorker = new Worker('sync', syncProcessor, {
  connection: redisConnection,
  concurrency: 2,           // allow 2 concurrent CM fetches
  limiter: { max: 5, duration: 1000 },  // 5 req/s rate limit
});
```

---

### 3. `email` queue — Transactional email

**Jobs:**
- `send-verification-email` — sends via Resend, retries on failure

**Trigger points:**
- `POST /api/auth/register` → enqueue `send-verification-email` instead of awaiting Resend

**Worker options:**
```typescript
const emailWorker = new Worker('email', emailProcessor, {
  connection: redisConnection,
  concurrency: 5,
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
});
```

---

## File Structure

```
server/
  queues/
    connection.ts        # shared ioredis connection
    stats.queue.ts       # Queue + job type definitions
    sync.queue.ts
    email.queue.ts
    stats.worker.ts      # Worker + processor
    sync.worker.ts
    email.worker.ts
    index.ts             # starts all workers, exports queue refs
```

---

## Implementation Steps

### Phase 1 — Infrastructure (no behavior change)
1. Add Redis to docker-compose.yml
2. `npm install bullmq ioredis`
3. Create `server/queues/connection.ts` with shared IORedis instance
4. Create queue files (no workers yet); queues are defined but idle

### Phase 2 — Email queue (lowest risk)
5. Create `email.worker.ts` with Resend logic
6. Replace `await resend.emails.send(...)` in `auth.ts` with `emailQueue.add('send-verification-email', payload)`
7. Test: register a user, verify email arrives

### Phase 3 — Stats queue (highest impact)
8. Create `stats.worker.ts` with materialized view refresh + regional recalc
9. Replace all `REFRESH MATERIALIZED VIEW` + `recalculateRegionalStatsForTournament` calls with queue jobs
10. Admin endpoints now return `{ jobId }` alongside `{ success: true }`
11. Add `GET /api/jobs/:queue/:id` for polling job status (optional)

### Phase 4 — Sync queue
12. Create `sync.worker.ts` with Challonge + CM sync processors
13. Replace sync endpoints with enqueue-and-respond pattern
14. Add BullMQ cron jobs (`repeat: { cron: '0 3 * * *' }`) for scheduled syncs

### Phase 5 — BullBoard (optional)
15. Add `@bull-board/express` for a dev-only job dashboard at `/admin/queues`

---

## Rollout Notes

- Workers in the same process: start them in `server/index.ts` alongside the Express server. Simple, no new containers.
- Workers in a separate process: `node server/worker-entry.ts` — add a second Coolify service. Needed if jobs become CPU-heavy.
- Graceful shutdown: listen for `SIGTERM`, call `worker.close()` and `queue.close()` before exiting.
- Redis persistence: use `appendonly yes` in Redis config for durability; jobs survive restarts.

---

## SSH Tunnel — DB Connection for Local Container Testing

When testing the containerized app against the remote/production PostgreSQL (hosted on the Coolify server), you need an SSH tunnel since the DB port is not publicly exposed.

### One-liner tunnel setup

```bash
ssh -L 5433:<DB_HOST>:5432 <SSH_USER>@<COOLIFY_SERVER_IP> -N -f
# Then set DATABASE_URL to: postgresql://user:pass@host.docker.internal:5433/dbname
```

- `-L 5433:...` — forwards local port 5433 to the remote DB
- `-N -f` — background, no shell
- In the container, use `host.docker.internal` (Docker Desktop) or `172.17.0.1` (Linux Docker bridge) to reach the tunnel on the host machine

### docker run with tunnel

```bash
# 1. Start tunnel in background
ssh -L 5433:<DB_INTERNAL_HOST>:5432 <SSH_USER>@<SERVER_IP> -N -f

# 2. Run container pointing to tunneled DB
docker run --rm \
  -e DATABASE_URL="postgresql://<user>:<pass>@host.docker.internal:5433/<dbname>" \
  -e SESSION_SECRET="..." \
  -e RESEND_API_KEY="..." \
  -p 5000:5000 \
  beybladexmeta-dev
```

### Required env vars for the container

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (via tunnel: `...@host.docker.internal:5433/...`) |
| `SESSION_SECRET` | Random secret for express-session |
| `RESEND_API_KEY` | Resend transactional email |
| `RECAPTCHA_SECRET_KEY` | reCAPTCHA v3 secret |
| `APP_BASE_URL` | Public URL for email links (e.g. `http://localhost:5000`) |
| `REDIS_URL` | (Phase 2+) Redis connection string |
| `GOOGLE_APPLICATION_CREDENTIALS` | (optional) Path to GCP service account JSON |
