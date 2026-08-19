/**
 * API response types.
 *
 * These used to be inferred from the Drizzle schema via `@shared/schema`, which
 * coupled the frontend to the backend's ORM. They are now declared here as the
 * shapes the frontend actually receives over HTTP — notably, timestamps arrive
 * as ISO strings, not `Date` objects.
 *
 * Keep in sync with the backend contract (see docs/backend/api-endpoints.md).
 */

/** `GET /api/auth/me` — the authenticated user, minus secrets stripped server-side. */
export interface User {
  id: string;
  email: string;
  password_hash: string;
  displayName: string;
  photoURL: string | null;
  isAdmin: boolean;
  is_verified: boolean;
  verification_token: string | null;
  verification_token_expires_at: string | null;
  challengerId: string | null;
  challengermodeUsername: string | null;
  challongeId: string | null;
  challongeUsername: string | null;
}

/** Aggregated placements for one full combo, per season. */
export interface ComboStats {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
  season: string;
  primiPosti: number;
  secondiPosti: number;
  terziPosti: number;
  quartiPosti: number;
  punteggioTotale: number;
  dataCreazione: string;
}

/** `GET /api/favorites/combos` */
export interface FavoriteCombo {
  id: string;
  userId: string;
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
}

/** `GET /api/favorites/decks` */
export interface FavoriteDeck {
  id: string;
  userId: string;
  name: string;
}

/** A single combo slot inside a favorite deck. */
export interface FavoriteDeckCombo {
  id: string;
  deckId: string;
  comboNumber: number;
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
}

/** Per-season placement totals shared by every single-component leaderboard. */
interface ComponentStatsBase {
  season: string;
  primiPosti: number;
  secondiPosti: number;
  terziPosti: number;
  quartiPosti: number;
  punteggioTotale: number;
}

/** `GET /api/stats/top/blade` */
export interface BladeStats extends ComponentStatsBase {
  blade: string;
}

/** `GET /api/stats/top/ratchet` */
export interface RatchetStats extends ComponentStatsBase {
  ratchet: string;
}

/** `GET /api/stats/top/bit` */
export interface BitStats extends ComponentStatsBase {
  bit: string;
  isRatchetLess: boolean;
}
