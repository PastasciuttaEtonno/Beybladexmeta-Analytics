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
