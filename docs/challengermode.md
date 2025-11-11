# Challengermode API Integration

This project fetches real past tournaments from the Challengermode public GraphQL API and caches responses server-side to reduce upstream calls.

## Environment Variables

Configure the following variables in your environment:

- `CHALLENGERMODE_REFRESH_KEY` — Refresh key used to obtain a short-lived access token
- `CHALLENGERMODE_GRAPHQL_URL` — GraphQL endpoint (defaults to Challengermode public GraphQL)
- `CHALLENGERMODE_AUTH_URL` — Auth endpoint for access keys
- `CHALLENGERMODE_CACHE_TTL_MINUTES` — Cache TTL in minutes (optional; defaults to 2880 = 2 days)

The server POSTs `{ refreshKey: CHALLENGERMODE_REFRESH_KEY }` to `CHALLENGERMODE_AUTH_URL` to retrieve an access token. That access token is then used as a Bearer token in subsequent GraphQL requests to `CHALLENGERMODE_GRAPHQL_URL`. The token is cached until its expiry (with a small safety buffer).

## How It Works

The server exposes endpoints that fetch tournaments and details from Challengermode:

- `GET /api/challengermode/tournaments` — Paginated list of tournaments
- `GET /api/challengermode/tournaments/:id` — Tournament detail

Both endpoints are cached using the `external_api_cache` table.

```
query TournamentsForGame {
  tournamentsForGame(
    input: {
      gameSlug: "beybladex"
      tournamentFilter: {
        completedTournamentSelector: { tournamentsAfter: "YYYY-MM-DDTHH:mm:ssZ" }
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
  }
}
```

The server caches the bearer token until expiry (with a small safety buffer) to minimize authentication requests.

## Server-Side Cache

- Table: `external_api_cache`
- Columns: `cache_key` (text, PK), `data` (jsonb, not null), `created_at` (timestamptz default `now()`)
- Default TTL: 2 days (configurable via `CHALLENGERMODE_CACHE_TTL_MINUTES`)
- Behavior:
  - First request writes a cache row with the upstream JSON
  - Subsequent requests reuse cache until TTL expires
  - Cache is shared across all users

To clear the cache quickly:

- Run `npx tsx scripts/db-clear.ts` (truncates `external_api_cache` among other tables)

## Client Behavior

- The Tournaments page consumes `/api/challengermode/tournaments`
- The Tournament Detail page consumes `/api/challengermode/tournaments/:id`
- After cache clear, first load may show increased upstream calls until cache is repopulated