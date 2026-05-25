# API Endpoint Reference

All endpoints are prefixed with the server's base URL (e.g., `http://localhost:5000`). JSON is the request and response format for all endpoints unless noted.

Session cookies must be included in all requests (`credentials: "include"` in `fetch`).

**Auth legend:**
- `Public` — No authentication required
- `Auth` — Requires an active session (`req.session.userId` must be set)
- `Admin` — Requires `Auth` + `user.isAdmin === true`

---

## Table of Contents

- [System](#system)
- [Authentication](#authentication)
- [User Profile & Platform Linking](#user-profile--platform-linking)
- [Statistics & Meta Analytics](#statistics--meta-analytics)
- [Leaderboards](#leaderboards)
- [Players](#players)
- [Tournaments](#tournaments)
- [ChallengerMode Integration](#challengermode-integration)
- [Favorites](#favorites)
- [Admin](#admin)
- [Components](#components)
- [SEO & Open Graph](#seo--open-graph)

---

## System

### `GET /api/health`
**Auth:** Public

Returns database and service status. Used by the client's `useServiceHealth` hook to show the `ServiceUnavailable` page.

**Response:**
```json
{ "status": "ok", "db": "ok" }
// or
{ "status": "degraded", "db": "unavailable" }  // HTTP 503
```

---

## Authentication

### `POST /api/auth/register`
**Auth:** Public | **Rate limited:** Yes

Register a new user account.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "s3cur3pass",
  "displayName": "PlayerName",
  "recaptchaToken": "<token from client>"
}
```

**Response:** `201 Created`
```json
{ "message": "Registration successful. Please check your email to verify your account." }
```

**Errors:** `400` (validation), `409` (email taken), `422` (reCAPTCHA failed)

---

### `POST /api/auth/login`
**Auth:** Public | **Rate limited:** Yes (IP-based)

Log in with email and password.

**Request body:**
```json
{ "email": "user@example.com", "password": "s3cur3pass" }
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "displayName": "PlayerName",
  "isAdmin": false,
  "challengerId": null,
  "challongeId": null
}
```

**Errors:** `400` (missing fields), `401` (invalid credentials), `403` (email not verified), `429` (too many attempts)

---

### `GET /api/auth/verify`
**Auth:** Public

Verify an email address using the token sent in the registration email.

**Query params:** `?token=<verification_token>`

**Response:** Redirects to `/` on success, or returns `400` with an error message.

---

### `POST /api/auth/logout`
**Auth:** Auth

Destroy the current session.

**Response:** `200 OK`
```json
{ "message": "Logged out successfully" }
```

---

### `GET /api/auth/me`
**Auth:** Auth (returns `null` if not authenticated)

Get the current authenticated user.

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "displayName": "PlayerName",
  "isAdmin": false,
  "isVerified": true,
  "challengerId": "cm_player_id",
  "challongeId": "challonge_id",
  "photoURL": null
}
```

Returns `null` (HTTP 200) if not logged in.

---

### `PATCH /api/auth/profile`
**Auth:** Auth

Update the authenticated user's profile.

**Request body (all fields optional):**
```json
{
  "displayName": "NewName",
  "email": "new@example.com",
  "photoURL": "https://..."
}
```

**Response:** `200 OK` — updated user object.

---

## User Profile & Platform Linking

### `POST /api/user/link-challonge`
**Auth:** Auth

Link a Challonge account by username or ID.

**Request body:**
```json
{ "challongeId": "challonge_username_or_id" }
```

**Response:** `200 OK` — updated user object.

---

### `POST /api/user/link-challengermode`
**Auth:** Auth

Link a ChallengerMode account by player ID.

**Request body:**
```json
{ "challengerId": "cm_player_id" }
```

**Response:** `200 OK` — updated user object.

---

### `GET /api/user/aliases`
**Auth:** Auth

Get all aliases for the authenticated user.

**Response:** `200 OK`
```json
[
  { "id": 1, "alias": "PlayerAlias", "platform": "challonge", "isVerified": true }
]
```

---

### `POST /api/user/aliases`
**Auth:** Auth

Create a new alias for the authenticated user.

**Request body:**
```json
{ "alias": "PlayerAlias", "platform": "challonge" }
```

**Response:** `201 Created` — created alias object.

---

### `DELETE /api/user/aliases/:id`
**Auth:** Auth

Delete an alias by ID (must belong to the authenticated user).

**Response:** `200 OK`

---

## Statistics & Meta Analytics

### `GET /api/stats/combos`
**Auth:** Public

Get all combo statistics, optionally filtered by season.

**Query params:** `?season=S1` (optional)

**Response:** `200 OK`
```json
[
  {
    "blade": "Dran Sword",
    "ratchet": "3-60",
    "bit": "Flat",
    "season": "S1",
    "placements": 42,
    "points": 1200,
    "wins": 18,
    "top4": 30
  }
]
```

---

### `GET /api/stats/combos/by-key`
**Auth:** Public

Get a single combo by its composite key.

**Query params:** `?key=<blade>-<ratchet>-<bit>` or `?blade=&ratchet=&bit=`

**Response:** `200 OK` — single combo stat object.

---

### `GET /api/stats/combos/by-slug`
**Auth:** Public

Get a single combo by its URL-friendly slug.

**Query params:** `?slug=dran-sword-3-60-flat`

**Response:** `200 OK` — single combo stat object.

---

### `GET /api/stats/combos/:comboKey/tournaments`
**Auth:** Public

Get the list of tournaments where a specific combo appeared.

**URL params:** `:comboKey` — the combo's composite key.

**Response:** `200 OK`
```json
[
  { "tournamentId": "t_123", "tournamentName": "WBO Regional", "placement": 1, "playerName": "Alice" }
]
```

---

### `GET /api/stats/top/components`
**Auth:** Public

Get top-performing components for the current season.

**Response:** `200 OK`
```json
{
  "blades": [...],
  "ratchets": [...],
  "bits": [...]
}
```

---

### `GET /api/stats/top/blade`
**Auth:** Public | **Query:** `?season=S1`

Get top blades ranked by win rate / usage.

---

### `GET /api/stats/top/ratchet`
**Auth:** Public | **Query:** `?season=S1`

Get top ratchets.

---

### `GET /api/stats/top/bit`
**Auth:** Public | **Query:** `?season=S1`

Get top bits.

---

### `GET /api/analytics/meta`
**Auth:** Public

Get full meta analytics data — all combos with computed stats.

**Query params:** `?season=S1` (optional)

**Response:** Array of combo stat objects with extended analytics fields (usage share, trend direction, etc.).

---

### `GET /api/trends`
**Auth:** Public

Get week-by-week combo and component usage trends.

**Query params:** `?season=S1&type=combo|blade|ratchet|bit`

---

### `GET /api/synergy`
**Auth:** Public

Get component synergy data — pairwise co-occurrence rates between blades, ratchets, and bits.

---

## Leaderboards

### `GET /api/stats/leaderboard`
**Auth:** Public

Get the global player leaderboard (aggregated across all platforms).

**Query params:** `?season=S1&limit=50`

**Response:**
```json
[
  {
    "playerName": "Alice",
    "totalPoints": 4200,
    "wins": 28,
    "top4": 55,
    "platform": "combined"
  }
]
```

---

### `GET /api/stats/leaderboard/:type`
**Auth:** Public

Get a leaderboard filtered by type (`cm` | `challonge` | `combined`).

---

### `GET /api/stats/player/:nickname`
**Auth:** Public

Get a player's aggregate stats by nickname.

---

### `GET /api/player-rankings`
**Auth:** Public

Get all player rankings (optimised query for ranking tables).

---

### `GET /api/leaderboard/regional`
**Auth:** Public

Get the regional leaderboard.

**Query params:** `?region=EU&season=S1&platform=cm|challonge|combined`

**Response:**
```json
[
  {
    "playerId": "cm_123",
    "playerName": "Bob",
    "region": "EU",
    "season": "S1",
    "platform": "cm",
    "points": 800,
    "wins": 12,
    "top4": 20
  }
]
```

---

## Players

### `GET /api/players/:id`
**Auth:** Public

Get player details by internal player ID.

**Response:** Player object with profile info, platform IDs, and stats summary.

---

### `GET /api/players/:id/tournaments`
**Auth:** Public

Get all tournaments a player has participated in.

---

### `GET /api/players/by-nickname/:nickname`
**Auth:** Public

Look up a player by their display nickname (cross-platform search).

---

### `GET /api/players/by-nickname/:nickname/tournaments`
**Auth:** Public

Get tournaments for a player found by nickname.

---

## Tournaments

### `GET /api/tournaments`
**Auth:** Public

List all tracked tournaments.

**Query params:** `?region=EU&platform=cm|challonge&season=S1`

**Response:**
```json
[
  {
    "id": "t_123",
    "name": "WBO Regional EU Spring",
    "platform": "cm",
    "region": "EU",
    "date": "2025-03-15",
    "participantCount": 64
  }
]
```

---

### `GET /api/tournaments/:id`
**Auth:** Public

Get full tournament detail including standings and combo usage per player.

---

### `GET /api/tournaments/:id/players/:playerId/combos`
**Auth:** Public

Get the combos used by a specific player in a specific tournament.

---

### `GET /api/tournaments/:id/my-combos`
**Auth:** Auth

Get the authenticated user's combos in a specific tournament.

---

### `POST /api/tournaments/:id/claim`
**Auth:** Auth

Claim tournament results — link the authenticated user to a player entry in the tournament.

**Request body:**
```json
{ "playerName": "Alice" }
```

---

### `PUT /api/tournaments/:id/combos/:num`
**Auth:** Auth

Update one of the authenticated user's combos in a tournament.

**Request body:**
```json
{
  "blade": "Dran Sword",
  "ratchet": "3-60",
  "bit": "Flat"
}
```

---

### `DELETE /api/tournaments/:id/combos/:num`
**Auth:** Auth

Delete one of the authenticated user's reported combos in a tournament.

---

## ChallengerMode Integration

### `GET /api/challengermode/tournaments`
**Auth:** Public

List all tournaments imported from ChallengerMode.

---

### `GET /api/challenger/participations`
**Auth:** Auth

Get the authenticated user's ChallengerMode tournament participations (requires a linked ChallengerMode account).

---

### `GET /api/me/tournaments`
**Auth:** Auth

Get all tournaments the authenticated user has participated in (across all linked platforms).

---

## Favorites

### `GET /api/favorites/combos`
**Auth:** Auth

Get the authenticated user's saved favorite combos.

**Response:**
```json
[
  {
    "id": 1,
    "blade": "Dran Sword",
    "ratchet": "3-60",
    "bit": "Flat",
    "savedAt": "2025-01-10T12:00:00Z"
  }
]
```

---

### `POST /api/favorites/combos`
**Auth:** Auth

Save a combo to favorites.

**Request body:**
```json
{ "blade": "Dran Sword", "ratchet": "3-60", "bit": "Flat" }
```

**Response:** `201 Created` — saved favorite object.

---

### `DELETE /api/favorites/combos/:id`
**Auth:** Auth

Remove a combo from favorites.

**Response:** `200 OK`

---

### `GET /api/favorites/decks`
**Auth:** Auth

Get the authenticated user's saved decks.

**Response:**
```json
[
  {
    "id": 1,
    "name": "My Main Deck",
    "combos": [
      { "blade": "Dran Sword", "ratchet": "3-60", "bit": "Flat" }
    ]
  }
]
```

---

### `POST /api/favorites/decks`
**Auth:** Auth

Create a new deck.

**Request body:**
```json
{
  "name": "My Main Deck",
  "combos": [
    { "blade": "Dran Sword", "ratchet": "3-60", "bit": "Flat" }
  ]
}
```

**Response:** `201 Created` — created deck object.

---

### `DELETE /api/favorites/decks/:id`
**Auth:** Auth

Delete a deck (and its associated combos).

**Response:** `200 OK`

---

## Admin

All admin endpoints require `Auth` + `isAdmin === true`.

### `POST /api/admin/tournament-results`
Submit internal tournament results.

**Request body:** Tournament result payload (platform-dependent schema).

---

### `POST /api/admin/tournament-results/external`
Submit external (Challonge) tournament results.

---

### `GET /api/admin/tournaments`
Get all tournaments with admin-level detail (including unpublished).

---

### `GET /api/admin/tournaments/:id/results`
Get raw result data for a specific tournament.

---

### `POST /api/admin/tournaments/:id/combos/reset`
Reset all combo assignments for a tournament.

---

### `PUT /api/admin/tournaments/:id/players/:playerId/combos`
Update combos for a specific player in a specific tournament.

**Request body:**
```json
[
  { "num": 1, "blade": "Dran Sword", "ratchet": "3-60", "bit": "Flat" }
]
```

---

### `POST /api/admin/refresh-all-tournaments`
Trigger a full refresh of all tournament data from all external sources.

**Response:** `200 OK` with a summary of updated tournaments.

---

### `POST /api/admin/sync-challonge`
Manually sync Challonge tournament data.

**Request body:** `{ "tournamentId": "challonge_id" }` (optional; syncs all if omitted).

---

### `POST /api/admin/recalc-stats`
Recalculate all combo statistics from raw match data. Also recalculates regional leaderboards.

**Response:** `200 OK`

---

### `POST /api/admin/import-tournament`
Import a new tournament from ChallengerMode or Challonge.

**Request body:**
```json
{
  "platform": "cm",
  "tournamentId": "cm_tournament_id",
  "region": "EU"
}
```

---

### `POST /api/admin/tournaments/:id/sync-ghost-players`
Link "ghost" (unmatched) player entries to registered user accounts where possible.

---

## Components

### `GET /api/components`
**Auth:** Public

Get a list of all unique component names (blades, ratchets, bits, lock chips) used across all recorded combos.

**Response:**
```json
{
  "blades": ["Dran Sword", "Hells Scythe", ...],
  "ratchets": ["3-60", "4-80", ...],
  "bits": ["Flat", "Point", ...],
  "lockChips": ["Standard", ...]
}
```

---

### `GET /api/seasons`
**Auth:** Public

Get all available season identifiers.

**Response:**
```json
["S1", "S2", "S3"]
```

---

## SEO & Open Graph

### `GET /api/og/combo/:id`
**Auth:** Public

Generate and return a PNG Open Graph image for a combo by ID.

**Response:** `image/png` buffer (not JSON).

---

### `GET /api/og/combo/:key`
**Auth:** Public

Generate and return a PNG OG image for a combo by composite key.

---

### `GET /sitemap.xml`
**Auth:** Public

Returns the XML sitemap for all public pages and combo URLs. Used by search engine crawlers.

---

### `GET /combo/:id`
**Auth:** Public

Server-rendered combo page (Express route). Injects OG meta tags into `index.html` before sending, enabling link preview crawlers (Twitter, Discord, etc.) to read them.
