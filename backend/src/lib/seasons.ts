export function determineSeason(date: Date): string {
  const d = new Date(date);
  const startOff = new Date('2025-10-01T00:00:00Z');
  const endOff = new Date('2026-01-31T23:59:59Z');
  if (d >= startOff && d <= endOff) return 'Off Season 2025';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (y === 2026 && m >= 2) return 'Season 2026';
  if (y === 2025) return 'Season 2025';
  return `Season ${y}`;
}

/**
 * SQL that derives the season name from a date column, mirroring determineSeason.
 *
 * `cm_match_results` has no `season` column — only `external_player_combos`
 * does — so anything filtering ChallengerMode results by season has to compute
 * it from `data_torneo`. Deriving it in SQL keeps the two definitions from
 * drifting apart; the boundaries here are the same ones determineSeason uses.
 */
export function seasonFromDateSql(column: string): string {
  return `CASE
    WHEN ${column} >= DATE '2025-10-01' AND ${column} <= DATE '2026-01-31' THEN 'Off Season 2025'
    WHEN EXTRACT(YEAR FROM ${column}) = 2026 AND EXTRACT(MONTH FROM ${column}) >= 2 THEN 'Season 2026'
    WHEN EXTRACT(YEAR FROM ${column}) = 2025 THEN 'Season 2025'
    ELSE 'Season ' || EXTRACT(YEAR FROM ${column})::text
  END`;
}
