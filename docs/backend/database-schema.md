# Database Schema Reference

All tables are defined in [`shared/schema.ts`](../../shared/schema.ts) using **Drizzle ORM** and mapped to a **PostgreSQL** database. The schema file is the single source of truth — it is imported by both the server (data access) and the client (TypeScript types via `drizzle-zod`).

---

## Table of Contents

- [Authentication & Sessions](#authentication--sessions)
- [Combo Statistics](#combo-statistics)
- [User Favorites](#user-favorites)
- [External Tournament Data](#external-tournament-data)
- [User Aliases & Account Linking](#user-aliases--account-linking)
- [Regional Leaderboards](#regional-leaderboards)
- [Admin & Caching](#admin--caching)
- [Database Views](#database-views)
- [Entity Relationship Overview](#entity-relationship-overview)

---

## Authentication & Sessions

### `users`

Primary user account table.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | Auto-incrementing user ID |
| `email` | `varchar(255)` | UNIQUE, NOT NULL | Login email address |
| `password_hash` | `text` | NOT NULL | bcrypt-hashed password |
| `displayName` | `varchar(100)` | | Public display name |
| `isAdmin` | `boolean` | DEFAULT `false` | Admin access flag |
| `isVerified` | `boolean` | DEFAULT `false` | Email verified flag |
| `verification_token` | `text` | | Email verification token (cleared after use) |
| `challengerId` | `varchar(255)` | | Linked ChallengerMode player ID |
| `challongeId` | `varchar(255)` | | Linked Challonge player ID |
| `photoURL` | `text` | | Profile photo URL |
| `createdAt` | `timestamp` | DEFAULT `now()` | Account creation timestamp |

---

### `session`

PostgreSQL session store for `express-session` (managed by `connect-pg-simple`).

| Column | Type | Description |
|---|---|---|
| `sid` | `varchar` | Session ID (PK) |
| `sess` | `json` | Serialised session data |
| `expire` | `timestamp` | Session expiry time |

---

### `login_attempts`

Audit log for login attempts, used by the rate limiter.

| Column | Type | Description |
|---|---|---|
| `id` | `serial` | PK |
| `ipAddress` | `varchar(45)` | Client IP (supports IPv6) |
| `email` | `varchar(255)` | Attempted email |
| `attemptedAt` | `timestamp` | Timestamp of attempt |
| `success` | `boolean` | Whether the login succeeded |

---

## Combo Statistics

These tables store pre-aggregated statistics computed from raw tournament match results. They are refreshed by `POST /api/admin/recalc-stats`.

### `comboStats`

Aggregated statistics for a blade + ratchet + bit combination per season.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `blade` | `varchar(100)` | PK (composite) | Blade component name |
| `ratchet` | `varchar(50)` | PK (composite) | Ratchet component name |
| `bit` | `varchar(50)` | PK (composite) | Bit component name |
| `lockChip` | `varchar(50)` | PK (composite) | Lock chip component name |
| `season` | `varchar(20)` | PK (composite) | Season identifier (e.g., "S1") |
| `placements` | `integer` | | Total tournament appearances |
| `points` | `integer` | | Total accumulated points |
| `wins` | `integer` | | Number of first-place finishes |
| `top4` | `integer` | | Number of top-4 finishes |
| `updatedAt` | `timestamp` | | Last update timestamp |

> **Primary key** is the composite `(blade, ratchet, bit, lockChip, season)`.

---

### `bladeStats`

Per-season statistics for individual blade components.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `blade` | `varchar(100)` | PK (composite) | Blade name |
| `season` | `varchar(20)` | PK (composite) | Season identifier |
| `placements` | `integer` | | Tournament appearances |
| `points` | `integer` | | Total points |
| `wins` | `integer` | | First-place finishes |
| `top4` | `integer` | | Top-4 finishes |

---

### `assistBladeStats`

Per-season statistics for assist blade components (same columns as `bladeStats`).

---

### `ratchetStats`

Per-season statistics for ratchet components (same columns as `bladeStats`, keyed by `ratchet`).

---

### `bitStats`

Per-season statistics for bit components (same columns as `bladeStats`, keyed by `bit`).

---

### `lockChipStats`

Per-season statistics for lock chip components (same columns as `bladeStats`, keyed by `lockChip`).

---

## User Favorites

### `favoriteCombos`

User-saved favorite combo combinations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `userId` | `integer` | FK → `users.id` | Owner |
| `blade` | `varchar(100)` | NOT NULL | |
| `ratchet` | `varchar(50)` | NOT NULL | |
| `bit` | `varchar(50)` | NOT NULL | |
| `lockChip` | `varchar(50)` | | |
| `savedAt` | `timestamp` | DEFAULT `now()` | |

---

### `favoriteDecks`

User-created named collections of combos.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `userId` | `integer` | FK → `users.id` | Owner |
| `name` | `varchar(100)` | NOT NULL | Deck name |
| `createdAt` | `timestamp` | DEFAULT `now()` | |

---

### `favoriteDeckCombos`

Junction table: combos within a deck.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `deckId` | `integer` | FK → `favoriteDecks.id` | Parent deck |
| `blade` | `varchar(100)` | NOT NULL | |
| `ratchet` | `varchar(50)` | NOT NULL | |
| `bit` | `varchar(50)` | NOT NULL | |
| `lockChip` | `varchar(50)` | | |
| `position` | `integer` | | Ordering within the deck |

---

## External Tournament Data

### `cmPlayers`

Player profiles fetched from ChallengerMode.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `varchar(255)` | PK | ChallengerMode player ID |
| `nickname` | `varchar(255)` | NOT NULL | Display name on CM |
| `avatar` | `text` | | Avatar image URL |
| `updatedAt` | `timestamp` | | Last sync timestamp |

---

### `challongePlayers`

Player profiles fetched from Challonge.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `varchar(255)` | PK | Challonge player ID |
| `nickname` | `varchar(255)` | NOT NULL | Display name on Challonge |
| `avatar` | `text` | | Avatar image URL |
| `updatedAt` | `timestamp` | | Last sync timestamp |

---

### `cmMatchResults`

ChallengerMode tournament match results.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `tournamentId` | `varchar(255)` | NOT NULL | ChallengerMode tournament ID |
| `tournamentName` | `varchar(255)` | | |
| `playerId` | `varchar(255)` | FK → `cmPlayers.id` | |
| `placement` | `integer` | | Final standing |
| `region` | `varchar(100)` | | Geographic region |
| `season` | `varchar(20)` | | Season identifier |
| `date` | `timestamp` | | Tournament date |
| `points` | `integer` | | Points awarded |

---

### `externalPlayerCombos`

Combos used by players in external tournaments (both CM and Challonge).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `tournamentId` | `varchar(255)` | NOT NULL | |
| `platform` | `varchar(20)` | NOT NULL | `"cm"` or `"challonge"` |
| `playerId` | `varchar(255)` | NOT NULL | |
| `playerName` | `varchar(255)` | | |
| `comboNum` | `integer` | | Combo index (1, 2, 3...) |
| `blade` | `varchar(100)` | | |
| `ratchet` | `varchar(50)` | | |
| `bit` | `varchar(50)` | | |
| `lockChip` | `varchar(50)` | | |
| `placement` | `integer` | | Player placement in the tournament |
| `region` | `varchar(100)` | | |
| `season` | `varchar(20)` | | |
| `reportedByUserId` | `integer` | FK → `users.id` | User who reported this combo |

---

### `challongeReportedCombos`

User-reported combos for Challonge tournaments that are not automatically imported.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `tournamentId` | `varchar(255)` | NOT NULL | Challonge tournament ID |
| `challongePlayerId` | `varchar(255)` | | |
| `playerName` | `varchar(255)` | | |
| `comboNum` | `integer` | | |
| `blade` | `varchar(100)` | | |
| `ratchet` | `varchar(50)` | | |
| `bit` | `varchar(50)` | | |
| `lockChip` | `varchar(50)` | | |
| `reportedByUserId` | `integer` | FK → `users.id` | |
| `createdAt` | `timestamp` | DEFAULT `now()` | |

---

### `challongeMatchResults`

Raw Challonge tournament data stored as JSONB.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `tournamentId` | `varchar(255)` | NOT NULL, UNIQUE | Challonge tournament ID |
| `tournamentName` | `varchar(255)` | | |
| `data` | `jsonb` | | Full raw Challonge API response |
| `region` | `varchar(100)` | | |
| `season` | `varchar(20)` | | |
| `syncedAt` | `timestamp` | | Last sync timestamp |

---

## User Aliases & Account Linking

### `userAliases`

Maps player name strings to user accounts, allowing a user to be identified by multiple nicknames across platforms.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `userId` | `integer` | FK → `users.id` | Owner |
| `alias` | `varchar(255)` | NOT NULL | The alias string |
| `platform` | `varchar(20)` | | `"cm"`, `"challonge"`, or `null` for manual |
| `isVerified` | `boolean` | DEFAULT `false` | Admin-verified alias |
| `createdAt` | `timestamp` | DEFAULT `now()` | |

---

## Regional Leaderboards

### `playerRegionalStats`

Pre-computed regional leaderboard scores per player, region, season, and platform.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `playerId` | `varchar(255)` | NOT NULL | Platform-specific player ID |
| `playerName` | `varchar(255)` | NOT NULL | Display name |
| `region` | `varchar(100)` | NOT NULL | Geographic region (e.g., `"EU"`, `"NA"`) |
| `season` | `varchar(20)` | NOT NULL | Season identifier |
| `platform` | `varchar(20)` | NOT NULL | `"cm"` or `"challonge"` |
| `points` | `integer` | DEFAULT `0` | Accumulated regional points |
| `wins` | `integer` | DEFAULT `0` | First-place finishes in region |
| `top4` | `integer` | DEFAULT `0` | Top-4 finishes in region |
| `updatedAt` | `timestamp` | | Last recalculation timestamp |

> Unique constraint on `(playerId, region, season, platform)`.

---

## Admin & Caching

### `adminAuditLogs`

Immutable audit trail for admin actions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `adminUserId` | `integer` | FK → `users.id` | Admin who performed the action |
| `action` | `varchar(100)` | NOT NULL | Action type (e.g., `"import_tournament"`) |
| `targetId` | `varchar(255)` | | ID of the affected resource |
| `details` | `jsonb` | | Additional action metadata |
| `performedAt` | `timestamp` | DEFAULT `now()` | |

---

### `externalApiCache`

Simple key-value cache for external API responses.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | `varchar(500)` | PK | Cache key (URL or query hash) |
| `data` | `jsonb` | NOT NULL | Cached response data |
| `fetchedAt` | `timestamp` | NOT NULL | When the data was fetched |
| `expiresAt` | `timestamp` | | Optional expiry timestamp |

---

### `clubs`

Tournament organiser / club data.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `serial` | PK | |
| `name` | `varchar(255)` | NOT NULL | Club name |
| `region` | `varchar(100)` | | Geographic region |
| `platform` | `varchar(20)` | | Associated platform |
| `externalId` | `varchar(255)` | | ID on the external platform |

---

## Database Views

Views are defined in SQL migration files and are not managed by Drizzle schema — they are read-only query shortcuts used by the analytics and leaderboard endpoints.

### `unified_meta_view`

Merges `cmMatchResults` + `challongeMatchResults` + `externalPlayerCombos` into a single flat record per (player, tournament, combo, placement). Used as the base for all meta analytics queries.

**Key columns:** `platform`, `playerId`, `playerName`, `tournamentId`, `placement`, `blade`, `ratchet`, `bit`, `region`, `season`, `date`.

---

### `player_platform_stats`

Per-player, per-platform aggregated stats. Joins `unified_meta_view` with player tables.

**Key columns:** `playerId`, `playerName`, `platform`, `season`, `totalPoints`, `wins`, `top4`, `tournaments`.

---

### `player_leaderboard`

Aggregated player leaderboard across all platforms. Sums `player_platform_stats` by player.

**Key columns:** `playerName`, `totalPoints`, `wins`, `top4`, `platforms` (array).

---

### `top_component_snapshot`

Top-ranked components by season for the dashboard widgets.

**Key columns:** `season`, `componentType`, `componentName`, `usageCount`, `winRate`.

---

### `tournaments_view`

Tournament metadata enriched with region, platform, participant count, and date.

**Key columns:** `tournamentId`, `tournamentName`, `platform`, `region`, `season`, `date`, `participantCount`.

---

## Entity Relationship Overview

```
users
 ├── session            (express-session store)
 ├── login_attempts     (audit)
 ├── userAliases        (nickname → user mapping)
 ├── favoriteCombos     (saved combos)
 ├── favoriteDecks
 │     └── favoriteDeckCombos
 └── externalPlayerCombos (reportedByUserId)

comboStats             (aggregated from match results)
bladeStats
ratchetStats
bitStats
lockChipStats

cmPlayers              (ChallengerMode player profiles)
 └── cmMatchResults     (tournament placements)

challongePlayers       (Challonge player profiles)
challongeMatchResults  (raw tournament JSONB)
challongeReportedCombos

externalPlayerCombos   (normalised combos from CM + Challonge)

playerRegionalStats    (pre-computed regional leaderboards)
adminAuditLogs
externalApiCache
clubs
```
