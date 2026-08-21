# Beyblade X Meta Analytics — Technical Documentation

> **History, not the current layout.** This describes the original single-package
> app: `client/`, `server/` and a shared Drizzle schema. Since then it was split
> into `frontend/` and `backend/`, and in August 2026 the Express backend was
> replaced by `backend-py/` (FastAPI) and deleted. See the root `README.md` for
> what exists now.
>
> What is still trustworthy here: the application overview, the capabilities and
> the domain concepts. What is not: the project structure, the tech stack below
> the API layer, and every build, run and deployment instruction.

> Disclaimer: this repository is no longer maintained. The documentation and code may be outdated, and some integrations or deployment instructions may no longer be current.
>
> This webapp was built using AI agents, including Claude Code, Gemini, and several IDE AI tools such as Antigravity, Cursor, and Trae.

## Table of Contents

- [Application Overview](#application-overview)
- [High-Level Architecture](#high-level-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
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

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                        │
│                                                             │
│  React 18 + Vite                                            │
│  Wouter (routing) │ React Query (server state)              │
│  React Context (auth/theme) │ shadcn/ui + TailwindCSS       │
└────────────────────────┬────────────────────────────────────┘
                         │  HTTP (REST JSON)
                         │  Cookies (session)
┌────────────────────────▼────────────────────────────────────┐
│                    Express.js Server                        │
│                                                             │
│  server/index.ts  (entry, middleware, security headers)     │
│  server/routes.ts (68 API endpoints)                        │
│  server/auth*.ts  (session auth, OAuth linking)             │
│  server/lib/      (ChallengerMode, Challonge, scoring)      │
└──────┬────────────────┬──────────────────┬──────────────────┘
       │                │                  │
       ▼                ▼                  ▼
┌──────────┐   ┌────────────────┐   ┌───────────────┐
│PostgreSQL│   │MinIO / AWS S3  │   │External APIs  │
│(Drizzle) │   │(object storage │   │ChallengerMode │
│          │   │ images/assets) │   │Challonge      │
└──────────┘   └────────────────┘   │Resend (email) │
                                    │reCAPTCHA      │
                                    └───────────────┘
```

**Key design decisions:**

- **Monorepo with shared schema** — `shared/schema.ts` defines Drizzle ORM tables that are imported by both the server (as the data layer) and the client (for TypeScript type inference via `drizzle-zod`).
- **Single-server deployment** — The Express server serves both the REST API (`/api/*`) and the built React SPA (static files). No separate frontend hosting is required.
- **View-based analytics** — Complex leaderboard and meta queries are offloaded to PostgreSQL views (`unified_meta_view`, `player_leaderboard`, etc.), keeping route handlers thin.
- **Session auth, not JWT** — `express-session` with a PostgreSQL store (falling back to in-memory) keeps state server-side. Cookies are `httpOnly`, `sameSite: lax`, `secure` in production.

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
| Node.js | 18+ | Runtime |
| Express | 4.22.0 | HTTP framework |
| TypeScript | 5.6.3 | Type safety |
| Drizzle ORM | 0.39.1 | Database ORM |
| PostgreSQL (pg) | 8.16.3 | Primary database |
| express-session | 1.18.1 | Session management |
| connect-pg-simple | 10.0.0 | PostgreSQL session store |
| bcrypt | 6.0.0 | Password hashing |
| Passport | 0.7.0 | Authentication middleware |
| Zod | 3.24.2 | Request validation |
| Axios | 1.13.5 | HTTP client (external APIs) |
| @napi-rs/canvas | 0.1.92 | OG image generation |
| Resend | 6.4.2 | Transactional email |
| AWS SDK v3 (S3) | 3.974.0 | Object storage |
| @google-cloud/recaptcha-enterprise | 6.3.1 | Bot protection |
| ESBuild | 0.25.0 | Server bundler |

### Database & Infrastructure

| Technology | Purpose |
|---|---|
| PostgreSQL | Primary relational database |
| Drizzle Kit | Schema migrations |
| MinIO / AWS S3 | Image and asset object storage |
| Docker / docker-compose | Containerized deployment |
| Coolify | Container orchestration (production) |

---

## Project Structure

```
Beybladexmeta-Analytics/
├── client/                   # React frontend
│   └── src/
│       ├── components/       # UI components (organized by feature)
│       ├── contexts/         # React Context providers
│       ├── hooks/            # Custom React hooks
│       ├── lib/              # Query client, utilities
│       ├── pages/            # Route-level page components
│       ├── App.tsx           # Root component, routing
│       └── main.tsx          # Entry point
├── server/                   # Express backend
│   ├── lib/                  # Business logic modules
│   ├── index.ts              # Server entry, middleware setup
│   ├── routes.ts             # All API route handlers
│   ├── auth.ts               # Auth helpers (hashing, session)
│   ├── auth-challenger.ts    # ChallengerMode OAuth
│   ├── auth-challonge.ts     # Challonge OAuth
│   ├── db.ts                 # Drizzle DB connection
│   ├── storage.ts            # Data access layer (DAL)
│   ├── objectStorage.ts      # S3/MinIO helpers
│   └── og-image.ts           # Open Graph image generation
├── shared/
│   └── schema.ts             # Drizzle ORM schema (shared types)
├── migrations/               # Drizzle migration SQL files
├── scripts/                  # CLI utility scripts
├── DOCS/                     # This documentation
├── drizzle.config.ts         # Drizzle ORM configuration
├── vite.config.ts            # Vite bundler configuration
├── tailwind.config.ts        # TailwindCSS configuration
├── tsconfig.json             # TypeScript configuration
├── docker-compose.yml        # Full stack local Docker setup
├── Dockerfile                # Production Docker image
└── package.json              # Unified dependency manifest
```

> **Monorepo note:** There is a single `package.json` and `tsconfig.json` at the root. Path aliases `@/*` resolve to `client/src/*` and `@shared/*` resolve to `shared/*`.

---

## Environment Variables

Copy `.env.local` for local development. The table below lists all recognised variables.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` | Yes | Individual PG credentials |
| `SESSION_SECRET` | Yes | Secret for signing session cookies |
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | HTTP port (default: `5000`) |
| `APP_BASE_URL` | Prod | Base URL, used for cookie `secure` flag |
| `VITE_PUBLIC_MINIO_URL` | No | Public MinIO URL for image assets |
| `S3_ENDPOINT` | No | MinIO / S3 endpoint |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | No | Object storage credentials |
| `PUBLIC_OBJECT_SEARCH_PATHS` | No | Comma-separated paths for object lookup |
| `PRIVATE_OBJECT_DIR` | No | Local directory for private objects |
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

---

## Local Development Setup

### Prerequisites

- **Node.js** 18 or later
- **PostgreSQL** 14 or later (or Docker)

### Option A — Docker (recommended)

```bash
# Start the full stack (app + PostgreSQL)
docker-compose up

# App will be available at http://localhost:5000
```

### Option B — Manual

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local .env
# Edit .env and fill in DATABASE_URL + SESSION_SECRET

# 3. Create the database (if it doesn't exist)
npm run db:create

# 4. Push schema to database
npm run db:push

# 5. (Optional) Seed initial data
npx tsx server/seed.ts

# 6. Create an admin user
npm run user:create

# 7. Start the development server
npm run dev
# Server + Vite HMR on http://localhost:5000
```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start development server (tsx + Vite) |
| `npm run build` | Build client (Vite) + server (ESBuild) |
| `npm run start` | Start production server from `dist/` |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Push Drizzle schema changes to database |
| `npm run db:create` | Create database if it doesn't exist |
| `npm run user:create` | Create a user account via CLI |
| `npm run regional:recalc` | Recalculate all regional leaderboard scores |
| `npm run migrate:challonge-combos` | Run Challonge combo migration |

---

## Build & Deployment

```bash
npm run build
# Outputs:
#   dist/public/   → Vite-built React SPA
#   dist/index.js  → ESBuild-bundled Express server
```

The single `dist/index.js` serves both the API and the SPA. Deploy with:

```bash
NODE_ENV=production node dist/index.js
```

For Docker-based deployment (Coolify, VPS):

```bash
docker build -t beyblade-analytics .
docker run -p 5000:5000 --env-file .env beyblade-analytics
```

---

*For frontend architecture details see [frontend/README.md](frontend/README.md).*  
*For backend architecture details see [backend/README.md](backend/README.md).*
