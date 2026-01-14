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

function participantMultiplier(n: number | null | undefined): number {
  const num = Number(n || 0);
  if (!Number.isFinite(num) || num <= 0) return 1.0;
  const clamped = Math.max(8, Math.min(num, 256));
  const linear = clamped / 16;
  const min = 0.75;
  const max = 8.0;
  return Math.max(min, Math.min(linear, max));
}

export async function recalculateAllRegionalStats(): Promise<{ inserted: number }> {
  await db.execute(sql`DELETE FROM player_regional_stats`);
  const rows = await db.execute(sql`
    SELECT r.tournament_id, r.player_id, r.piazzamento, r.numero_partecipanti, r.data_torneo, p.nickname AS player_name, tv.region
    FROM cm_match_results r
    JOIN tournaments_view tv ON tv.id = r.tournament_id
    LEFT JOIN cm_players p ON p.id = r.player_id
    WHERE tv.region IS NOT NULL
  `);
  const byTournamentPlayer = new Map<string, { playerId: string; playerName: string; region: string; season: string; placement: number; participants: number; tournamentId: string }>();
  for (const r of rows.rows as any[]) {
    const tournamentId = String(r.tournament_id);
    const playerId = String(r.player_id);
    const key = `${tournamentId}|${playerId}`;
    const placement = Number(r.piazzamento || 0) || 0;
    const existing = byTournamentPlayer.get(key);
    const season = seasonForDate(r.data_torneo ? String(r.data_torneo) : null);
    const playerName = r.player_name ? String(r.player_name) : playerId;
    const region = r.region ? String(r.region) : "";
    const participants = Number(r.numero_partecipanti || 0) || 0;
    if (!existing) {
      byTournamentPlayer.set(key, { playerId, playerName, region, season, placement, participants, tournamentId });
    } else {
      if (placement > 0 && (existing.placement === 0 || placement < existing.placement)) {
        existing.placement = placement;
        existing.participants = participants;
      }
    }
  }
  const agg = new Map<AggregateKey, { playerId: string; playerName: string; region: string; season: string; points: number; tournamentsPlayed: number; wins: number; top4: number }>();
  for (const rec of byTournamentPlayer.values()) {
    const k: AggregateKey = `${rec.playerId}|${rec.region}|${rec.season}`;
    let current = agg.get(k);
    if (!current) {
      current = { playerId: rec.playerId, playerName: rec.playerName, region: rec.region, season: rec.season, points: 0, tournamentsPlayed: 0, wins: 0, top4: 0 };
      agg.set(k, current);
    }
    current.tournamentsPlayed += 1;
    let pts = 0;
    if (rec.placement === 1) {
      pts = 15;
      current.wins += 1;
      current.top4 += 1;
    } else if (rec.placement === 2) {
      pts = 10;
      current.top4 += 1;
    } else if (rec.placement === 3) {
      pts = 7;
      current.top4 += 1;
    } else if (rec.placement === 4) {
      pts = 5;
      current.top4 += 1;
    } else {
      pts = 0;
    }
    if (rec.placement >= 1 && rec.placement <= 4) {
      const mult = participantMultiplier(rec.participants);
      pts = Math.round(pts * mult);
    }
    current.points += pts;
  }
  const values = Array.from(agg.values()).map((v) => ({
    playerId: v.playerId,
    playerName: v.playerName,
    region: v.region,
    season: v.season,
    points: v.points,
    tournamentsPlayed: v.tournamentsPlayed,
    wins: v.wins,
    top4: v.top4,
  }));
  if (values.length > 0) {
    await db.insert(playerRegionalStats).values(values).onConflictDoUpdate({
      target: [playerRegionalStats.playerId, playerRegionalStats.region, playerRegionalStats.season],
      set: {
        points: sql`excluded.points`,
        tournaments_played: sql`excluded.tournaments_played`,
        wins: sql`excluded.wins`,
        top4: sql`excluded.top4`,
        updated_at: sql`now()`,
      } as any,
    });
  }
  return { inserted: values.length };
}

export async function recalculateRegionalStatsForTournament(tournamentId: string): Promise<{ inserted: number }> {
  const pidRows = await db.execute(sql`
    SELECT DISTINCT player_id
    FROM cm_match_results
    WHERE tournament_id = ${tournamentId}
  `);
  const playerIds = (pidRows.rows as any[]).map((r) => String(r.player_id)).filter((s) => !!s);
  if (playerIds.length === 0) return { inserted: 0 };
  let total = 0;
  for (const playerId of playerIds) {
    const rows = await db.execute(sql`
      SELECT r.tournament_id, r.player_id, r.piazzamento, r.numero_partecipanti, r.data_torneo, p.nickname AS player_name, tv.region
      FROM cm_match_results r
      JOIN tournaments_view tv ON tv.id = r.tournament_id
      LEFT JOIN cm_players p ON p.id = r.player_id
      WHERE tv.region IS NOT NULL AND r.player_id = ${playerId}
    `);
    const byTournamentPlayer = new Map<string, { playerId: string; playerName: string; region: string; season: string; placement: number; participants: number; tournamentId: string }>();
    for (const r of rows.rows as any[]) {
      const tid = String(r.tournament_id);
      const pid = String(r.player_id);
      const key = `${tid}|${pid}`;
      const placement = Number(r.piazzamento || 0) || 0;
      const existing = byTournamentPlayer.get(key);
      const season = seasonForDate(r.data_torneo ? String(r.data_torneo) : null);
      const playerName = r.player_name ? String(r.player_name) : pid;
      const region = r.region ? String(r.region) : "";
      const participants = Number(r.numero_partecipanti || 0) || 0;
      if (!existing) {
        byTournamentPlayer.set(key, { playerId: pid, playerName, region, season, placement, participants, tournamentId: tid });
      } else {
        if (placement > 0 && (existing.placement === 0 || placement < existing.placement)) {
          existing.placement = placement;
          existing.participants = participants;
        }
      }
    }
    const agg = new Map<AggregateKey, { playerId: string; playerName: string; region: string; season: string; points: number; tournamentsPlayed: number; wins: number; top4: number }>();
    for (const rec of byTournamentPlayer.values()) {
      const k: AggregateKey = `${rec.playerId}|${rec.region}|${rec.season}`;
      let current = agg.get(k);
      if (!current) {
        current = { playerId: rec.playerId, playerName: rec.playerName, region: rec.region, season: rec.season, points: 0, tournamentsPlayed: 0, wins: 0, top4: 0 };
        agg.set(k, current);
      }
      current.tournamentsPlayed += 1;
      let pts = 0;
      if (rec.placement === 1) {
        pts = 15;
        current.wins += 1;
        current.top4 += 1;
      } else if (rec.placement === 2) {
        pts = 10;
        current.top4 += 1;
      } else if (rec.placement === 3) {
        pts = 7;
        current.top4 += 1;
      } else if (rec.placement === 4) {
        pts = 5;
        current.top4 += 1;
      } else {
        pts = 0;
      }
      if (rec.placement >= 1 && rec.placement <= 4) {
        const mult = participantMultiplier(rec.participants);
        pts = Math.round(pts * mult);
      }
      current.points += pts;
    }
    const values = Array.from(agg.values()).map((v) => ({
      playerId: v.playerId,
      playerName: v.playerName,
      region: v.region,
      season: v.season,
      points: v.points,
      tournamentsPlayed: v.tournamentsPlayed,
      wins: v.wins,
      top4: v.top4,
    }));
    await db.transaction(async (tx: any) => {
      await tx.execute(sql`DELETE FROM player_regional_stats WHERE player_id = ${playerId}`);
      if (values.length > 0) {
        await tx.insert(playerRegionalStats).values(values).onConflictDoUpdate({
          target: [playerRegionalStats.playerId, playerRegionalStats.region, playerRegionalStats.season],
          set: {
            points: sql`excluded.points`,
            tournaments_played: sql`excluded.tournaments_played`,
            wins: sql`excluded.wins`,
            top4: sql`excluded.top4`,
            updated_at: sql`now()`,
          } as any,
        });
      }
    });
    total += values.length;
  }
  return { inserted: total };
}
