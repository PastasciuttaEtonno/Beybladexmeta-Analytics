import { sql, and, eq } from "drizzle-orm";
import { db } from "../db";
import { cmMatchResults, cmPlayers, playerRegionalStats } from "@shared/schema";

type AggregateKey = string;

function seasonForDate(dateStr: string | null | undefined): string {
  try {
    if (!dateStr) return "Off Season 2025";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "Off Season 2025";
    const start = new Date("2025-10-01T00:00:00Z");
    const end = new Date("2026-02-01T00:00:00Z");
    if (d >= start && d < end) return "Off Season 2025";
    return "Season 2026";
  } catch {
    return "Off Season 2025";
  }
}

// CM Scoring (Static)
function calculateCmPoints(placement: number): number {
  if (placement === 1) return 100;
  if (placement === 2) return 80;
  if (placement === 3) return 65;
  if (placement === 4) return 55;
  if (placement >= 5 && placement <= 8) return 40;
  if (placement >= 9 && placement <= 16) return 25;
  if (placement >= 17 && placement <= 32) return 10;
  if (placement >= 33 && placement <= 64) return 5;
  if (placement >= 65) return 2;
  return 0;
}

// Challonge Scoring (Tiered by Participant Count)
function calculateChallongePoints(placement: number, count: number): number {
  if (count >= 49) { // 49-64 (or more)
    if (placement === 1) return 400;
    if (placement === 2) return 280;
    if (placement === 3) return 160;
    if (placement === 4) return 120;
    if (placement >= 5 && placement <= 8) return 90;
    if (placement >= 9 && placement <= 12) return 65;
    if (placement >= 13 && placement <= 16) return 50;
    if (placement >= 17 && placement <= 24) return 40;
    if (placement >= 25 && placement <= 32) return 30;
    if (placement >= 33 && placement <= 48) return 15;
    if (placement >= 49) return 10;
  } else if (count >= 33) { // 33-48
    if (placement === 1) return 350;
    if (placement === 2) return 240;
    if (placement === 3) return 140;
    if (placement === 4) return 110;
    if (placement >= 5 && placement <= 8) return 80;
    if (placement >= 9 && placement <= 12) return 55;
    if (placement >= 13 && placement <= 16) return 40;
    if (placement >= 17 && placement <= 24) return 30;
    if (placement >= 25 && placement <= 32) return 15;
    if (placement >= 33) return 10;
  } else if (count >= 25) { // 25-32
    if (placement === 1) return 300;
    if (placement === 2) return 200;
    if (placement === 3) return 120;
    if (placement === 4) return 90;
    if (placement >= 5 && placement <= 8) return 70;
    if (placement >= 9 && placement <= 12) return 45;
    if (placement >= 13 && placement <= 16) return 30;
    if (placement >= 17 && placement <= 24) return 15;
    if (placement >= 25) return 10;
  } else if (count >= 17) { // 17-24
    if (placement === 1) return 250;
    if (placement === 2) return 160;
    if (placement === 3) return 100;
    if (placement === 4) return 80;
    if (placement >= 5 && placement <= 8) return 60;
    if (placement >= 9 && placement <= 12) return 30;
    if (placement >= 13 && placement <= 16) return 15;
    if (placement >= 17) return 10;
  } else if (count >= 13) { // 13-16
    if (placement === 1) return 200;
    if (placement === 2) return 120;
    if (placement === 3) return 80;
    if (placement === 4) return 60;
    if (placement >= 5 && placement <= 8) return 30;
    if (placement >= 9 && placement <= 12) return 15;
    if (placement >= 13) return 10;
  } else if (count >= 8) { // 8-12
    if (placement === 1) return 150;
    if (placement === 2) return 80;
    if (placement === 3) return 60;
    if (placement === 4) return 40;
    if (placement >= 5 && placement <= 8) return 20;
    if (placement >= 9) return 10;
  } else { // 6-7 (or less fallback)
    if (placement === 1) return 100;
    if (placement === 2) return 70;
    if (placement === 3) return 50;
    if (placement === 4) return 30;
    if (placement >= 5) return 10;
  }
  return 0;
}

export async function recalculateAllRegionalStats(): Promise<{ inserted: number }> {
  // Clear existing stats.
  await db.execute(sql`DELETE FROM player_regional_stats`);

  // --- 1. Challengermode (existing logic) ---
  const cmRows = await db.execute(sql`
    SELECT c.data, tv.region
    FROM external_api_cache c
    JOIN tournaments_view tv ON tv.id = substring(c.cache_key from 'cm:tournamentDetail:(.*)')
    WHERE c.cache_key LIKE 'cm:tournamentDetail:%'
      AND tv.region IS NOT NULL
  `);

  const agg = new Map<AggregateKey, {
    playerId: string;
    playerName: string;
    region: string;
    season: string;
    platform: string;
    points: number;
    tournamentsPlayed: number;
    wins: number;
    top4: number
  }>();

  // Helper to update agg map
  const updateAgg = (playerId: string, username: string, region: string, season: string, platform: string, points: number, placement: number) => {
    const key: AggregateKey = `${playerId}|${region}|${season}|${platform}`;
    let stats = agg.get(key);
    if (!stats) {
      stats = {
        playerId,
        playerName: username,
        region,
        season,
        platform,
        points: 0,
        tournamentsPlayed: 0,
        wins: 0,
        top4: 0
      };
      agg.set(key, stats);
    }
    stats.tournamentsPlayed += 1;
    stats.points += points;
    if (placement === 1) stats.wins += 1;
    if (placement <= 4) stats.top4 += 1;
  };

  // Process CM
  for (const row of cmRows.rows as any[]) {
    const data = row.data as any;
    const region = String(row.region);
    const season = seasonForDate(data.schedule?.startedAt);

    // Track unique players per tournament
    const playersInTournament = new Set<string>();

    const lineups = data.attendance?.signups?.lineups || [];
    for (const lineup of lineups) {
      const displayPlacement = lineup.placement?.displayPlacement;
      let placement = 999999;
      if (displayPlacement) {
        if (/^\d+$/.test(displayPlacement)) {
          placement = parseInt(displayPlacement, 10);
        } else {
          const m = displayPlacement.match(/(\d+)/);
          if (m) placement = parseInt(m[1], 10);
        }
      }

      const members = lineup.members || [];
      for (const member of members) {
        const user = member.user;
        if (!user || !user.userId) continue;
        const playerId = user.userId;
        const username = user.username || "Unknown";

        if (playersInTournament.has(playerId)) continue;
        playersInTournament.add(playerId);

        // CM uses static scoring
        const pts = calculateCmPoints(placement);
        updateAgg(playerId, username, region, season, 'challengermode', pts, placement);
      }
    }
  }

  // --- 2. Challonge (NEW) ---
  const challongeRows = await db.execute(sql`
    SELECT c.data, c.fetched_at
    FROM challonge_match_results c
  `);

  for (const row of challongeRows.rows as any[]) {
    const data = row.data as any;
    // Date
    const startedAt = data.start_date || data.started_at || row.fetched_at;
    const season = seasonForDate(startedAt);

    // Region
    const region = 'Global';

    const standings = data.standings || [];
    // Total Participants
    const totalParticipants = data.participants_count || data.total_players || standings.length || 0;

    // Track unique players
    const playersInTournament = new Set<string>();

    for (const p of standings) {
      // p: { rank, name/username, id... }
      const rank = parseInt(String(p.rank), 10) || 999999;
      const part = p.participant || p;
      const pid = String(part.id);
      const name = part.name || part.username || part.display_name || 'Unknown';

      if (!pid || playersInTournament.has(pid)) continue;
      playersInTournament.add(pid);

      // Challonge uses Tiered scoring logic
      const pts = calculateChallongePoints(rank, totalParticipants);
      updateAgg(pid, name, region, season, 'challonge', pts, rank);
    }
  }

  const values = Array.from(agg.values()).map(v => ({
    playerId: v.playerId,
    playerName: v.playerName,
    region: v.region,
    season: v.season,
    platform: v.platform,
    points: v.points,
    tournamentsPlayed: v.tournamentsPlayed,
    wins: v.wins,
    top4: v.top4,
    updatedAt: new Date()
  }));

  if (values.length > 0) {
    await db.insert(playerRegionalStats).values(values).onConflictDoUpdate({
      target: [playerRegionalStats.playerId, playerRegionalStats.region, playerRegionalStats.season, playerRegionalStats.platform],
      set: {
        points: sql`excluded.points`,
        tournamentsPlayed: sql`excluded.tournaments_played`,
        wins: sql`excluded.wins`,
        top4: sql`excluded.top4`,
        updatedAt: sql`now()`,
        playerName: sql`excluded.player_name`
      }
    });
  }

  return { inserted: values.length };
}

export async function recalculateRegionalStatsForTournament(tournamentId: string): Promise<{ inserted: number }> {
  return recalculateAllRegionalStats();
}
