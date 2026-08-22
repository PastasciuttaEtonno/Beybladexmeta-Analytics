# Beyblade X Meta Analytics — Technical Documentation

> This page documents the current split architecture. The root
> [`README.md`](../README.md) is the operational quick start; the pages linked
> below contain deeper implementation details.
>
> This webapp was built using AI agents, including Claude Code, Gemini, and several IDE AI tools such as Antigravity, Cursor, and Trae.

> **Historical note:** [`backend/README.md`](backend/README.md) describes the
> former Express implementation and is retained as migration context. The
> original application used a Node.js/TypeScript Express server, a React/Vite
> client, Drizzle ORM, `express-session`, and a shared TypeScript schema. It was
> later split into a standalone frontend and backend, then the Express service
> was refactored to the current Python/FastAPI service in `backend-py/`.

The migration preserved the public API paths, response contracts, session
semantics, scoring rules, and database model so the frontend could remain
independent of the backend implementation. Historical Express-specific paths
and commands below are intentionally not presented as current setup guidance.

## Table of Contents

- [Application Overview](#application-overview)
- [High-Level Architecture](#high-level-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Configuration](#configuration)
- [Local Development Setup](#local-development-setup)
- [Build & Deployment](#build--deployment)

---

## Application Overview

**Beyblade X Meta Analytics** is a full-stack web application for the competitive Beyblade X community. It aggregates tournament data from multiple external platforms (ChallengerMode and Challonge), computes statistical meta-analysis on Beyblade combinations (combos), and exposes ranked leaderboards — both global and regional — for players and components.

Key capabilities:

- **Meta Analytics** — Win-rate, usage frequency, and trend analysis for every blade/ratchet/bit combination across seasons.
- **Tournament Tracking** — Imports and displays tournament brackets, placements, and combo usage from ChallengerMode (GraphQL) and Challonge (REST).
- **Regional Leaderboards** — Season-based scoring aggregated by geographic region and platform.
- **User Accounts** — Registration, email verification, platform linking (ChallengerMode / Challonge), and a personal Favorites system (combos and decks).
- **Admin Panel** — Tournament import, data refresh, statistics recalculation, and audit logging.
- **Open Graph / SEO** — Dynamically generated OG images for individual combo pages; XML sitemap.

---

## High-Level Architecture

The current architecture is the result of that refactor: the React/Vite SPA is
served by nginx, nginx proxies API requests to FastAPI, and FastAPI connects to
PostgreSQL and the external integrations. The former Express monolith is no
longer part of the runtime.

```
Browser (React SPA)
       │ relative REST requests + session cookies
       ▼
Traefik / Coolify (TLS and public origin)
       │
       ▼
frontend container (nginx)
       │ serves static assets and proxies /api, /combo and /sitemap.xml
       ▼
backend-py container (FastAPI)
       ├── SQL through SQLAlchemy + asyncpg ──► Coolify PostgreSQL
       ├── component images ──────────────────► Garage / S3
       └── integrations ─────────────────────► ChallengerMode, Challonge,
                                           Resend and reCAPTCHA
```

**Key design decisions:**

- **One public origin** — nginx owns the browser-facing origin and proxies API and HTML-shell requests to FastAPI. This keeps session cookies simple and avoids browser CORS configuration.
- **API boundary at the frontend** — the SPA uses relative URLs and owns its response types in `frontend/src/types/api.ts`; it does not import backend code.
- **Python API service** — `backend-py/app/` contains routing, auth, integrations, serialization and RAG logic. SQL is issued through SQLAlchemy/asyncpg, while migrations remain explicit numbered SQL files.
- **Database-backed sessions** — authentication uses server-side sessions in PostgreSQL and signed `connect.sid` cookies; the secret must remain stable across deployments.
- **Database does the aggregation** — analytics views and SQL queries keep leaderboard and meta calculations close to the data.
- **RAG keeps text and numbers separate** — knowledge documents are embedded and retrieved from the RAG pipeline, while tournament statistics remain queryable in PostgreSQL through typed tools.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI library |
| TypeScript | 5.6.3 | Type safety |
| Vite | 5.4.20 | Bundler / dev server |
| Wouter | 3.3.5 | Client-side routing |
| TanStack Query | 5.60.5 | Server state / data fetching |
| TailwindCSS | 3.4.17 | Utility-first styling |
| shadcn/ui + Radix UI | Latest | Accessible UI component library |
| Recharts | 2.15.2 | Data visualization / charts |
| Framer Motion | 11.13.1 | Animations |
| React Hook Form | 7.55.0 | Form state management |
| Zod | 3.24.2 | Schema validation |
| next-themes | 0.4.6 | Light/dark theme |
| lucide-react | 0.453.0 | Icon set |
| date-fns | 3.6.0 | Date formatting |
| Embla Carousel | 8.6.0 | Carousel component |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.12+ | Runtime |
| FastAPI | current | HTTP framework and OpenAPI layer |
| SQLAlchemy + asyncpg | current | Async PostgreSQL access |
| Pydantic Settings | current | Typed environment configuration |
| itsdangerous | current | Signed session cookie handling |
| httpx | current | External HTTP integrations |
| Pillow | current | Open Graph image generation |

### Database & Infrastructure

| Technology | Purpose |
|---|---|
| PostgreSQL | Primary relational database |
| Numbered SQL migrations | Schema migrations and schema history |
| Garage / S3 | Image and asset object storage |
| Docker / docker-compose | Containerized deployment |
| Coolify | Container orchestration (production) |

---

## Project Structure

```
Beybladexmeta-Analytics/
├── frontend/                 # React SPA and production nginx image
│   └── src/
│       ├── components/       # UI components (organized by feature)
│       ├── contexts/         # React Context providers
│       ├── hooks/            # Custom React hooks
│       ├── lib/              # Query client, utilities
│       ├── pages/            # Route-level page components
│       ├── App.tsx           # Root component, routing
│       └── main.tsx          # Entry point
├── backend-py/               # FastAPI service
│   ├── app/                  # Routes, services, auth, SQL, integrations, RAG
│   ├── tests/                # Backend and RAG tests
│   ├── pyproject.toml        # Python dependencies and tooling
│   └── Dockerfile            # Backend image
├── migrations/               # Numbered SQL migrations and schema snapshot
├── docker/                   # Local database initialization
├── docker-compose.dev.yml    # Development topology
├── docker-compose.prod.yml   # Coolify production topology
├── knowledge/                # RAG source documents
├── tools/                    # Migration, import, evaluation, and admin CLIs
├── docs/                     # Architecture and implementation documentation
└── package.json              # Root orchestration scripts
```

The frontend and backend are intentionally separate applications. Their
contract is the HTTP API, not shared source imports; frontend response types
live in `frontend/src/types/api.ts`.

---

## Configuration

Each service reads its own environment file. Start from
`backend-py/.env.example` and `frontend/.env.example`; production values are
provided to the two containers by Coolify.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for signing session cookies |
| `PORT` | No | FastAPI port (default: `8000`) |
| `FRONTEND_ORIGIN` | Prod | Internal frontend URL used for OG HTML generation |
| `CORS_ORIGINS` | No | Leave empty for the single-origin deployment |
| `APP_BASE_URL` | Prod | Base URL, used for cookie `secure` flag |
| `VITE_PUBLIC_MINIO_URL` | No | Public Garage/S3 URL for image assets |
| `S3_ENDPOINT` | No | MinIO / S3 endpoint |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | No | Object storage credentials |
| `RECAPTCHA_SECRET_KEY` | Prod | Google reCAPTCHA server-side secret |
| `VITE_RECAPTCHA_SITE_KEY` | Prod | Google reCAPTCHA client-side key |
| `VITE_RECAPTCHA_USE_ENTERPRISE` | No | `"true"` to use Enterprise reCAPTCHA |
| `RESEND_API_KEY` | Prod | Resend email service API key |
| `CHALLENGERMODE_API_KEY` | No | ChallengerMode API key |
| `CHALLENGERMODE_AUTH_URL` | No | ChallengerMode OAuth URL |
| `CHALLENGERMODE_GRAPHQL_URL` | No | ChallengerMode GraphQL endpoint |
| `CHALLENGERMODE_REFRESH_KEY` | No | ChallengerMode token refresh key |
| `CM_CLIENT_ID` / `CM_CLIENT_SECRET` / `CM_REDIRECT_URI` | No | ChallengerMode OAuth app credentials |
| `CHALLONGE_API_KEY` | No | Challonge API key |
| `CHALLONGE_API_REST_URL` | No | Challonge REST API base URL |
| `CHALLONGE_APP_CLIENT_ID` / `CHALLONGE_APP_CLIENT_SECRET` | No | Challonge OAuth app credentials |
| `VOYAGE_API_KEY` | RAG | Embeddings and reranking |
| `OPENROUTER_API_KEY` / `ANTHROPIC_API_KEY` | RAG | Chat provider credentials |
| `CHAT_PROVIDER` | RAG | `openrouter` or `claude` |

---

## Local Development Setup

### Prerequisites

- **Node.js** 20 or later
- **Docker**
- **uv** for the Python backend

### Option A — Docker (recommended)

```bash
# Start PostgreSQL and the application containers
docker compose -f docker-compose.dev.yml up -d

# Frontend and API are available through the nginx origin at http://localhost:8080
```

### Option B — Local processes

```bash
# Install frontend dependencies and backend dependencies
npm run install:all

# Configure both services from their example files
cp backend-py/.env.example backend-py/.env
cp frontend/.env.example frontend/.env

# Start PostgreSQL first, then run the API and Vite frontend
npm run db:up
npm run dev
```

The local Vite server runs on port `5173` and proxies API requests to FastAPI on
port `8000`. For the production-shaped experience, use the Docker command above
and browse through nginx on port `8080`.

### Database migrations

`migrations/` is the schema of record. Apply migrations with the Python tool:

```bash
python tools/migrate.py --url "$DATABASE_URL" --status
python tools/migrate.py --url "$DATABASE_URL" --apply
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start FastAPI and the Vite frontend |
| `npm run build` | Build the frontend image assets |
| `npm run check` | TypeScript type check |
| `npm run db:up` | Start the local PostgreSQL container |
| `npm run db:reset` | Recreate and reseed the local database |
| `npm run user:create` | Create a user account via CLI |
| `npm run session` | Mint a local admin session cookie |

---

## Build & Deployment

```bash
npm run build
# Builds the frontend assets used by the nginx image
```

Production uses the two services defined in `docker-compose.prod.yml`:

```bash
docker compose -f docker-compose.prod.yml build
```

Coolify terminates TLS at Traefik and routes the public domain to `frontend`.
nginx serves the Vite build and proxies `/api/`, `/sitemap.xml`, and `/combo/` to
`backend-py`. The backend connects to the existing Coolify PostgreSQL resource;
the production compose file does not create a second database.

The RAG assistant is part of the FastAPI service. Its source documents live in
`knowledge/`, its implementation is under `backend-py/app/lib/rag/`, and its
design and evaluation record is in [`rag/`](rag/README.md).

---

For frontend details see [frontend/README.md](frontend/README.md). The older
[backend/README.md](backend/README.md) is historical; current backend code is in
`backend-py/app/`.
