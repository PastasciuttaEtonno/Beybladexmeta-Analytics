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

// New scoring table based on placement
function calculatePoints(placement: number): number {
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

export async function recalculateAllRegionalStats(): Promise<{ inserted: number }> {
  // Clear existing stats for Challengermode. 
  // Note: If we had other platforms, we should filter by platform = 'challengermode'
  await db.execute(sql`DELETE FROM player_regional_stats WHERE platform = 'challengermode'`);

  // Fetch all match results. 
  // Note: match results table (cm_match_results) is populated from the external JSONs via the refresh mechanism.
  // We rely on the refresh mechanism to populate cm_match_results correctly with ALL participants.
  // Wait, the previous logic populated cm_match_results ONLY for top 4 during claim.
  // The user requirement says: "Itera su tutti i partecipanti presenti nel JSON (row.data)".
  // This implies we should be reading from `external_api_cache` where the tournament details are stored!
  // BUT the instruction says: "Itera su tutti i partecipanti presenti nel JSON (row.data)".
  // row.data refers to `external_api_cache` data probably?
  // Let's look at how the data is structured. 
  // Actually, the user says "Modifica server/lib/regionalScoring.ts".
  // And "Itera su tutti i partecipanti presenti nel JSON (row.data)".

  // Queries external_api_cache for tournament details
  const rows = await db.execute(sql`
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

  for (const row of rows.rows as any[]) {
    const data = row.data as any; // ExternalTournamentDetail
    const region = String(row.region);

    // Determine season from startedAt
    const startedAt = data.schedule?.startedAt;
    const season = seasonForDate(startedAt);

    // Parse lineups
    const lineups = data.attendance?.signups?.lineups || [];

    // Track unique players per tournament to avoid double counting if bad data
    const playersInTournament = new Set<string>();

    for (const lineup of lineups) {
      const displayPlacement = lineup.placement?.displayPlacement;
      let placement = 999999;

      // Parse placement
      if (displayPlacement) {
        if (/^\d+$/.test(displayPlacement)) {
          placement = parseInt(displayPlacement, 10);
        } else {
          // Handle "1st", "2nd" etc if necessary, though CM API usually gives integer-like
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

        const key: AggregateKey = `${playerId}|${region}|${season}`;

        let stats = agg.get(key);
        if (!stats) {
          stats = {
            playerId,
            playerName: username,
            region,
            season,
            platform: 'challengermode',
            points: 0,
            tournamentsPlayed: 0,
            wins: 0,
            top4: 0
          };
          agg.set(key, stats);
        }

        // Update stats
        stats.tournamentsPlayed += 1;
        const pts = calculatePoints(placement);
        stats.points += pts;

        if (placement === 1) stats.wins += 1;
        if (placement <= 4) stats.top4 += 1;
      }
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
    // Batch insert/update
    // We can use a loop for safety or huge insert
    // For now, assuming manageable size
    await db.insert(playerRegionalStats).values(values).onConflictDoUpdate({
      target: [playerRegionalStats.playerId, playerRegionalStats.region, playerRegionalStats.season, playerRegionalStats.platform],
      set: {
        points: sql`excluded.points`,
        tournamentsPlayed: sql`excluded.tournaments_played`,
        wins: sql`excluded.wins`,
        top4: sql`excluded.top4`,
        updatedAt: sql`now()`,
        playerName: sql`excluded.player_name` // Update name if changed
      }
    });
  }

  return { inserted: values.length };
}

// We remove the per-tournament recalculation because it's complex to do partial updates with global points
// Actually, the previous implementation did per-tournament calc. 
// But now we are scanning ALL JSONs to rebuild the stats.
// So we can keep this empty or aliasing to full recalc if needed, but for now let's just export the main one.
export async function recalculateRegionalStatsForTournament(tournamentId: string): Promise<{ inserted: number }> {
  // With the new architecture (reading from Cache JSONs directly), 
  // it's safer to just run a full recalc or at least fetch that specific JSON and update.
  // However, since the user asked for "recalculateAllRegionalStats", we will use that as the primary engine.
  // For performance, we could implement a single-tournament updater, but let's stick to the request for now.
  // We can just call the main function here if we want to support the hook, 
  // OR just leave it as a no-op since the "Claim" flow might verify top 4 but we want the background job to handle stats.
  // Better yet: just run the full recalc. It's safe.
  return recalculateAllRegionalStats();
}

