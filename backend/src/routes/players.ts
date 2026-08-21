import type { Express } from "express";
import { db } from "../db";
import {
  cmPlayers, challongePlayers, users, userAliases,
  playerPlatformStats, playerLeaderboardView,
} from "@shared/schema";
import { desc, eq, sql, and, inArray, or } from "drizzle-orm";
import { fetchTournamentDetail } from "../challengermode";
import { calculateChallongePoints } from "../lib/challongePoints";
import { seasonFromDateSql } from "../lib/seasons";

export function registerPlayersRoutes(app: Express): void {
  app.get('/api/stats/leaderboard', async (req, res) => {
    try {
      const platform = req.query.platform as string | undefined;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 200;

      if (platform && platform !== 'challengermode' && platform !== 'challonge') {
        return res.status(400).json({ error: 'Invalid platform. Use challengermode or challonge.' });
      }

      const rows = platform
        ? await db.select().from(playerPlatformStats).where(eq(playerPlatformStats.platform, platform)).orderBy(desc(playerPlatformStats.totalPoints)).limit(limit)
        : await db.select().from(playerLeaderboardView).orderBy(desc(playerLeaderboardView.totalPoints)).limit(limit);

      const players = rows.map((r: any) => ({
        id: r.playerId || r.nickname, nickname: r.nickname, avatar: r.avatar,
        totalPoints: Number(r.totalPoints || 0), tournamentsPlayed: Number(r.tournamentsPlayed || 0),
        wins: Number(r.wins || 0), top3Finishes: Number(r.top3Finishes || 0),
        platform: r.platform || 'mixed'
      }));

      res.json({ players });
    } catch (error) {
      console.error('Player leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch player leaderboard' });
    }
  });

  app.get('/api/stats/player/:nickname', async (req, res) => {
    try {
      const nickname = req.params.nickname;
      if (!nickname) return res.status(400).json({ error: 'Nickname is required' });
      const platformStats = await db.select().from(playerPlatformStats)
        .where(eq(playerPlatformStats.nickname, nickname))
        .orderBy(desc(playerPlatformStats.totalPoints));
      if (platformStats.length === 0) return res.status(404).json({ error: 'Player not found' });
      res.json(platformStats);
    } catch (error) {
      console.error('Player profile error:', error);
      res.status(500).json({ error: 'Failed to fetch player profile' });
    }
  });

  app.get('/api/players/by-nickname/:nickname', async (req, res) => {
    try {
      const nickname = String(req.params.nickname || '').trim();
      if (!nickname) return res.status(400).json({ error: 'Missing nickname' });

      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const season = seasonRaw === 'All Time' ? '' : seasonRaw || 'Off Season 2025';

      const [cmPlayerRows, challongePlayerRows] = await Promise.all([
        db.select().from(cmPlayers).where(eq(cmPlayers.nickname, nickname)).limit(1),
        db.select().from(challongePlayers).where(eq(challongePlayers.nickname, nickname)).limit(1),
      ]);
      const cmPlayer = cmPlayerRows[0] || null;
      const challongePlayer = challongePlayerRows[0] || null;

      if (!cmPlayer && !challongePlayer) return res.status(404).json({ error: 'Player not found' });

      let userAvatar: string | null = null;
      if (cmPlayer) {
        const u = await db.query.users.findFirst({ where: eq(users.challengerId, cmPlayer.id) });
        if (u?.photoURL) userAvatar = u.photoURL;
      }
      if (!userAvatar && challongePlayer) {
        let u = await db.query.users.findFirst({ where: eq(users.challongeId, challongePlayer.id) });
        if (!u) u = await db.query.users.findFirst({ where: sql`LOWER(${users.challongeUsername}) = LOWER(${nickname})` });
        if (u?.photoURL) userAvatar = u.photoURL;
      }

      if (!userAvatar) {
        let userId = null;
        if (cmPlayer) {
          const u = await db.query.users.findFirst({ where: eq(users.challengerId, cmPlayer.id) });
          if (u) userId = u.id;
        }
        if (!userId && challongePlayer) {
          let u = await db.query.users.findFirst({ where: eq(users.challongeId, challongePlayer.id) });
          if (!u) u = await db.query.users.findFirst({ where: sql`LOWER(${users.challongeUsername}) = LOWER(${nickname})` });
          if (u) userId = u.id;
        }
        if (userId) {
          const aliases = await db.select().from(userAliases).where(eq(userAliases.userId, userId));
          for (const alias of aliases) {
            const aliasChallonge = await db.query.challongePlayers.findFirst({ where: eq(challongePlayers.nickname, alias.alias) });
            if (aliasChallonge?.avatar) { userAvatar = aliasChallonge.avatar; break; }
            const aliasCm = await db.query.cmPlayers.findFirst({ where: eq(cmPlayers.nickname, alias.alias) });
            if (aliasCm?.avatar) { userAvatar = aliasCm.avatar; break; }
          }
        }
      }

      const platformStats = await db.select().from(playerPlatformStats)
        .where(eq(playerPlatformStats.nickname, nickname))
        .orderBy(desc(playerPlatformStats.totalPoints));

      const platformStatsWithTop3 = await Promise.all(platformStats.map(async (stat) => {
        let top3Count = 0;
        if (stat.platform === 'challengermode' && cmPlayer) {
          const r = await db.execute(sql`SELECT COUNT(DISTINCT tournament_id) as top3_count FROM cm_match_results WHERE player_id = ${cmPlayer.id} AND piazzamento <= 3`);
          top3Count = Number(r.rows[0]?.top3_count || 0);
        } else if (stat.platform === 'challonge') {
          const userRows = await db.select().from(users).where(eq(users.challongeUsername, nickname)).limit(1);
          if (userRows.length > 0) {
            const r = await db.execute(sql`SELECT COUNT(DISTINCT tournament_id) as top3_count FROM challonge_reported_combos WHERE user_id = ${userRows[0].id} AND rank <= 3`);
            top3Count = Number(r.rows[0]?.top3_count || 0);
          }
        }
        return { platform: stat.platform, totalPoints: stat.totalPoints, tournamentsPlayed: stat.tournamentsPlayed, top3Finishes: top3Count };
      }));

      const totalPoints = platformStatsWithTop3.reduce((sum, stat) => sum + stat.totalPoints, 0);

      let mostUsedCombo = null;
      if (cmPlayer) {
        const q = season
          ? await db.execute(sql`SELECT blade, assist_blade, ratchet, bit, lock_chip, COUNT(*) AS use_count, COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END * total_participants), 0) AS points FROM external_player_combos WHERE player_id = ${cmPlayer.id} AND season = ${season} GROUP BY blade, assist_blade, ratchet, bit, lock_chip ORDER BY use_count DESC, points DESC LIMIT 1`)
          : await db.execute(sql`SELECT blade, assist_blade, ratchet, bit, lock_chip, COUNT(*) AS use_count, COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END * total_participants), 0) AS points FROM external_player_combos WHERE player_id = ${cmPlayer.id} GROUP BY blade, assist_blade, ratchet, bit, lock_chip ORDER BY use_count DESC, points DESC LIMIT 1`);
        const muc = q.rows[0] || null;
        if (muc) mostUsedCombo = { blade: String((muc as any).blade || ''), assistBlade: String((muc as any).assist_blade || ''), ratchet: String((muc as any).ratchet || ''), bit: String((muc as any).bit || ''), lockChip: String((muc as any).lock_chip || ''), count: Number((muc as any).use_count || 0), points: Number((muc as any).points || 0) };
      }

      let favoriteBlade = null;
      if (cmPlayer) {
        const q = season
          ? await db.execute(sql`SELECT blade, COUNT(*) AS use_count, COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END * total_participants), 0) AS points FROM external_player_combos WHERE player_id = ${cmPlayer.id} AND season = ${season} GROUP BY blade ORDER BY use_count DESC, points DESC LIMIT 1`)
          : await db.execute(sql`SELECT blade, COUNT(*) AS use_count, COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END * total_participants), 0) AS points FROM external_player_combos WHERE player_id = ${cmPlayer.id} GROUP BY blade ORDER BY use_count DESC, points DESC LIMIT 1`);
        const fb = q.rows[0] || null;
        if (fb) favoriteBlade = { blade: String((fb as any).blade || ''), count: Number((fb as any).use_count || 0), points: Number((fb as any).points || 0) };
      }

      const userRows = await db.select().from(users).where(eq(users.challongeUsername, nickname)).limit(1);
      let challongeMostUsedCombo = null;
      let challongeFavoriteBlade = null;

      if (userRows.length > 0) {
        const user = userRows[0];
        const cq = await db.execute(sql`SELECT blade, assist_blade, ratchet, bit, lock_chip, COUNT(*) AS use_count FROM challonge_reported_combos WHERE user_id = ${user.id} GROUP BY blade, assist_blade, ratchet, bit, lock_chip ORDER BY use_count DESC LIMIT 1`);
        const chc = cq.rows[0] || null;
        if (chc) challongeMostUsedCombo = { blade: String((chc as any).blade || ''), assistBlade: String((chc as any).assist_blade || ''), ratchet: String((chc as any).ratchet || ''), bit: String((chc as any).bit || ''), lockChip: String((chc as any).lock_chip || ''), count: Number((chc as any).use_count || 0), points: 0 };

        const cbq = season
          ? await db.execute(sql`SELECT blade, COUNT(*) AS use_count FROM challonge_reported_combos c JOIN challonge_match_results m ON c.tournament_id = m.tournament_id WHERE c.user_id = ${user.id} AND m.data->>'season' = ${season} GROUP BY blade ORDER BY use_count DESC LIMIT 1`)
          : await db.execute(sql`SELECT blade, COUNT(*) AS use_count FROM challonge_reported_combos WHERE user_id = ${user.id} GROUP BY blade ORDER BY use_count DESC LIMIT 1`);
        const chb = cbq.rows[0] || null;
        if (chb) challongeFavoriteBlade = { blade: String((chb as any).blade || ''), count: Number((chb as any).use_count || 0), points: 0 };
      }

      if (!mostUsedCombo && challongeMostUsedCombo) mostUsedCombo = challongeMostUsedCombo;
      if (!favoriteBlade && challongeFavoriteBlade) favoriteBlade = challongeFavoriteBlade;

      res.json({
        player: { nickname, avatar: userAvatar || challongePlayer?.avatar || cmPlayer?.avatar || null, platforms: platformStatsWithTop3.map(s => s.platform) },
        stats: { totalPoints, mostUsedCombo, favoriteBlade },
        platformStats: platformStatsWithTop3,
      });
    } catch (error) {
      console.error('Unified player profile error:', error);
      res.status(500).json({ error: 'Failed to fetch player profile' });
    }
  });

  app.get('/api/players/by-nickname/:nickname/tournaments', async (req, res) => {
    try {
      const nickname = String(req.params.nickname || '').trim();
      if (!nickname) return res.status(400).json({ error: 'Missing nickname' });

      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = !seasonRaw || seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';
      const season = isAllTime ? '' : seasonRaw;

      const cmPlayerRows = await db.select().from(cmPlayers).where(eq(cmPlayers.nickname, nickname)).limit(1);
      const cmPlayer = cmPlayerRows[0] || null;
      const tournaments: any[] = [];

      if (cmPlayer) {
        const cmTournamentsQuery = season
          ? await db.execute(sql`SELECT tournament_id, MAX(data_torneo) AS date, MIN(piazzamento) AS best_placement, SUM(punti_guadagnati) AS total_points, COUNT(*) AS combo_count, 'challengermode' AS platform FROM cm_match_results WHERE player_id = ${cmPlayer.id} AND ${sql.raw(seasonFromDateSql('data_torneo'))} = ${season} GROUP BY tournament_id ORDER BY date DESC LIMIT 25`)
          : await db.execute(sql`SELECT tournament_id, MAX(data_torneo) AS date, MIN(piazzamento) AS best_placement, SUM(punti_guadagnati) AS total_points, COUNT(*) AS combo_count, 'challengermode' AS platform FROM cm_match_results WHERE player_id = ${cmPlayer.id} GROUP BY tournament_id ORDER BY date DESC LIMIT 25`);

        const cmTournaments = await Promise.all((cmTournamentsQuery.rows || []).map(async (r: any) => {
          try {
            const detail = await fetchTournamentDetail(String(r.tournament_id));
            return { tournamentId: String(r.tournament_id), date: r.date ? String(r.date) : (detail?.schedule?.startedAt ? String(detail.schedule.startedAt).slice(0, 10) : null), name: detail?.name || null, bestPlacement: r.best_placement != null ? Number(r.best_placement) : null, totalPoints: Number(r.total_points || 0), comboCount: Number(r.combo_count || 0), platform: 'challengermode' };
          } catch {
            return { tournamentId: String(r.tournament_id), date: r.date ? String(r.date) : null, name: null, bestPlacement: r.best_placement != null ? Number(r.best_placement) : null, totalPoints: Number(r.total_points || 0), comboCount: Number(r.combo_count || 0), platform: 'challengermode' };
          }
        }));
        tournaments.push(...cmTournaments);
      }

      const userRows = await db.select().from(users).where(eq(users.challongeUsername, nickname)).limit(1);
      if (userRows.length > 0) {
        const user = userRows[0];
        const challongeTournamentsQuery = season
          ? await db.execute(sql`SELECT c.tournament_id, MAX(c.tournament_name) AS tournament_name, MIN(c.rank) AS best_placement, COUNT(DISTINCT c.id) AS combo_count, 'challonge' AS platform, MAX(c.created_at) AS date, (SELECT COALESCE(NULLIF((m2.data->>'participants_count')::int, 0), NULLIF((m2.data->>'total_players')::int, 0), jsonb_array_length(m2.data->'standings')) FROM challonge_match_results m2 WHERE m2.tournament_id = c.tournament_id LIMIT 1) as total_participants FROM challonge_reported_combos c WHERE c.user_id = ${user.id} AND c.season = ${season} GROUP BY c.tournament_id ORDER BY date DESC LIMIT 25`)
          : await db.execute(sql`SELECT c.tournament_id, MAX(c.tournament_name) AS tournament_name, MIN(c.rank) AS best_placement, COUNT(DISTINCT c.id) AS combo_count, 'challonge' AS platform, MAX(c.created_at) AS date, (SELECT COALESCE(NULLIF((m2.data->>'participants_count')::int, 0), NULLIF((m2.data->>'total_players')::int, 0), jsonb_array_length(m2.data->'standings')) FROM challonge_match_results m2 WHERE m2.tournament_id = c.tournament_id LIMIT 1) as total_participants FROM challonge_reported_combos c WHERE c.user_id = ${user.id} GROUP BY c.tournament_id ORDER BY date DESC LIMIT 25`);

        const challongeTournaments = (challongeTournamentsQuery.rows || []).map((r: any) => ({
          tournamentId: String(r.tournament_id), date: r.date ? String(r.date).slice(0, 10) : null,
          name: r.tournament_name ? String(r.tournament_name) : null,
          bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
          totalPoints: calculateChallongePoints(Number(r.best_placement), Number(r.total_participants)),
          comboCount: Number(r.combo_count || 0), platform: 'challonge',
        }));
        tournaments.push(...challongeTournaments);
      } else {
        const ghostToursQuery = await db.execute(sql`
          SELECT c.tournament_id, c.data->>'tournament_name' as tournament_name, c.data->>'start_date' as date,
                 (s->>'rank')::int as rank,
                 COALESCE(NULLIF((c.data->>'participants_count')::int, 0), NULLIF((c.data->>'total_players')::int, 0), jsonb_array_length(c.data->'standings')) as total_participants
          FROM challonge_match_results c, jsonb_array_elements(c.data->'standings') as s
          WHERE COALESCE(s->'participant'->>'name', s->>'name', s->'participant'->>'display_name') = ${nickname}
          ORDER BY c.data->>'start_date' DESC LIMIT 50
        `);
        if (ghostToursQuery.rows.length > 0) {
          tournaments.push(...ghostToursQuery.rows.map((r: any) => ({
            tournamentId: String(r.tournament_id), date: r.date ? String(r.date).slice(0, 10) : null,
            name: r.tournament_name || `Torneo ${r.tournament_id}`,
            bestPlacement: r.rank, totalPoints: calculateChallongePoints(r.rank, r.total_participants),
            comboCount: 0, platform: 'challonge',
          })));
        }
      }

      const deduped = new Map<string, (typeof tournaments)[0]>();
      for (const t of tournaments) {
        const existing = deduped.get(t.tournamentId);
        if (!existing) { deduped.set(t.tournamentId, t); }
        else {
          const preferNew = (!existing.name && t.name) || (existing.name && t.name && (t.bestPlacement ?? 999) < (existing.bestPlacement ?? 999));
          if (preferNew) deduped.set(t.tournamentId, t);
        }
      }
      const uniqueTournaments = Array.from(deduped.values()).sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      res.json({ tournaments: uniqueTournaments.slice(0, 50) });
    } catch (error) {
      console.error('Unified player tournaments error:', error);
      res.status(500).json({ error: 'Failed to fetch player tournaments' });
    }
  });

  app.get('/api/player-rankings', async (req, res) => {
    try {
      const rows = await db.select().from(playerLeaderboardView).orderBy(desc(playerLeaderboardView.totalPoints)).limit(100);
      const players = rows.map((r: any) => ({
        id: r.playerId || r.nickname, nickname: r.nickname, avatar: r.avatar,
        totalPoints: Number(r.totalPoints || 0), tournamentsPlayed: Number(r.tournamentsPlayed || 0),
        wins: Number(r.wins || 0), top3Finishes: Number(r.top3Finishes || 0), top4Finishes: Number(r.top4Finishes || 0)
      }));
      res.json({ players });
    } catch (error) {
      console.error('Error fetching player rankings:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/players/:id', async (req, res) => {
    try {
      const playerId = String(req.params.id || '').trim();
      if (!playerId) return res.status(400).json({ error: 'Missing player id' });

      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const season = seasonRaw === 'All Time' ? '' : seasonRaw || 'Off Season 2025';

      const playerRows = await db.select().from(cmPlayers).where(eq(cmPlayers.id, playerId)).limit(1);
      const player = playerRows[0] || null;
      if (!player) return res.status(404).json({ error: 'Player not found' });

      const legacyOff = 'Off Season';
      const totalPointsQuery = season.toLowerCase().startsWith('off season')
        ? await db.execute(sql`SELECT COALESCE(SUM(points), 0) AS total_points FROM player_regional_stats WHERE player_id = ${playerId} AND (season = ${season} OR season = ${legacyOff})`)
        : await db.execute(sql`SELECT COALESCE(SUM(points), 0) AS total_points FROM player_regional_stats WHERE player_id = ${playerId} AND season = ${season}`);
      const totalPoints = Number(totalPointsQuery.rows[0]?.total_points || 0);

      const mostUsedComboQuery = await db.execute(sql`SELECT blade, assist_blade, ratchet, bit, lock_chip, COUNT(*) AS use_count, COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END * total_participants), 0) AS points FROM external_player_combos WHERE player_id = ${playerId} GROUP BY blade, assist_blade, ratchet, bit, lock_chip ORDER BY use_count DESC, points DESC LIMIT 1`);
      const muc = mostUsedComboQuery.rows[0] || null;

      const favoriteBladeQuery = await db.execute(sql`SELECT blade, COUNT(*) AS use_count, COALESCE(SUM(CASE placement WHEN 1 THEN 10 WHEN 2 THEN 7 WHEN 3 THEN 5 ELSE 0 END * total_participants), 0) AS points FROM external_player_combos WHERE player_id = ${playerId} GROUP BY blade ORDER BY use_count DESC, points DESC LIMIT 1`);
      const favBlade = favoriteBladeQuery.rows[0] || null;

      res.json({
        player: { id: player.id, nickname: player.nickname, avatar: player.avatar },
        stats: {
          totalPoints,
          mostUsedCombo: muc ? { blade: (muc as any).blade, assistBlade: (muc as any).assist_blade, ratchet: (muc as any).ratchet, bit: (muc as any).bit, lockChip: (muc as any).lock_chip, count: Number((muc as any).use_count || 0), points: Number((muc as any).points || 0) } : null,
          favoriteBlade: favBlade ? { blade: (favBlade as any).blade, count: Number((favBlade as any).use_count || 0), points: Number((favBlade as any).points || 0) } : null,
        },
      });
    } catch (error) {
      console.error('Error fetching player profile:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/players/:id/tournaments', async (req, res) => {
    try {
      const playerId = String(req.params.id || '').trim();
      if (!playerId) return res.status(400).json({ error: 'Missing player id' });

      const q = await db.execute(sql`SELECT tournament_id, MAX(data_torneo) AS date, MIN(piazzamento) AS best_placement, SUM(punti_guadagnati) AS total_points, COUNT(*) AS combo_count FROM cm_match_results WHERE player_id = ${playerId} GROUP BY tournament_id ORDER BY date DESC LIMIT 50`);

      const base = (q.rows || []).map((r: any) => ({
        tournamentId: String(r.tournament_id), date: r.date ? String(r.date) : null,
        bestPlacement: r.best_placement != null ? Number(r.best_placement) : null,
        totalPoints: Number(r.total_points || 0), comboCount: Number(r.combo_count || 0),
      }));

      const enriched = await Promise.all(base.map(async (t) => {
        try {
          const detail = await fetchTournamentDetail(t.tournamentId);
          return { ...t, name: detail?.name || null, date: t.date || (detail?.schedule?.startedAt ? String(detail.schedule.startedAt).slice(0, 10) : null) };
        } catch { return { ...t, name: null }; }
      }));

      res.json({ tournaments: enriched });
    } catch (error) {
      console.error('Error fetching player tournaments:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  app.get('/api/leaderboard/regional', async (req, res) => {
    try {
      const region = String((req.query.region ?? '') as string).trim();
      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const season = seasonRaw || 'All Time';
      const platform = req.query.platform ? String(req.query.platform).trim() : 'all';

      if (season === 'All Time') {
        const query = region
          ? sql`SELECT prs.player_id, MAX(prs.player_name) AS player_name, prs.region, 'All Time' AS season, SUM(prs.points) AS points, SUM(prs.tournaments_played) AS tournaments_played, SUM(prs.wins) AS wins, SUM(prs.top4) AS top4, MAX(p.avatar) AS avatar FROM player_regional_stats prs LEFT JOIN cm_players p ON p.id = prs.player_id WHERE prs.region = ${region} GROUP BY prs.player_id, prs.region ORDER BY points DESC, wins DESC, top4 DESC`
          : sql`SELECT prs.player_id, MAX(prs.player_name) AS player_name, 'Global' AS region, 'All Time' AS season, SUM(prs.points) AS points, SUM(prs.tournaments_played) AS tournaments_played, SUM(prs.wins) AS wins, SUM(prs.top4) AS top4, MAX(p.avatar) AS avatar FROM player_regional_stats prs LEFT JOIN cm_players p ON p.id = prs.player_id GROUP BY prs.player_id ORDER BY points DESC, wins DESC, top4 DESC`;
        const rows = await db.execute(query);
        return res.json({ leaderboard: rows.rows });
      }

      const legacyOff = 'Off Season';
      const isOffSeason2025 = season.toLowerCase().startsWith('off season');

      let query;
      if (region) {
        if (isOffSeason2025) {
          query = sql`SELECT prs.player_id, MAX(prs.player_name) AS player_name, prs.region, 'Off Season 2025' AS season, SUM(prs.points) AS points, SUM(prs.tournaments_played) AS tournaments_played, SUM(prs.wins) AS wins, SUM(prs.top4) AS top4, MAX(p.avatar) AS avatar FROM player_regional_stats prs LEFT JOIN cm_players p ON p.id = prs.player_id WHERE prs.region = ${region} AND (prs.season = ${season} OR prs.season = ${legacyOff})`;
          if (platform !== 'all' && platform !== '') query.append(sql` AND prs.platform = ${platform}`);
          query.append(sql` GROUP BY prs.player_id, prs.region ORDER BY points DESC, wins DESC, top4 DESC`);
        } else {
          query = sql`SELECT prs.player_id, prs.player_name, prs.region, prs.season, prs.points, prs.tournaments_played, prs.wins, prs.top4, p.avatar FROM player_regional_stats prs LEFT JOIN cm_players p ON p.id = prs.player_id WHERE prs.season = ${season} AND prs.region = ${region}`;
          if (platform !== 'all' && platform !== '') query.append(sql` AND prs.platform = ${platform}`);
          query.append(sql` ORDER BY prs.points DESC, prs.wins DESC, prs.top4 DESC`);
        }
      } else {
        if (isOffSeason2025) {
          query = sql`SELECT prs.player_id, MAX(prs.player_name) AS player_name, 'Global' AS region, 'Off Season 2025' AS season, SUM(prs.points) AS points, SUM(prs.tournaments_played) AS tournaments_played, SUM(prs.wins) AS wins, SUM(prs.top4) AS top4, MAX(p.avatar) AS avatar FROM player_regional_stats prs LEFT JOIN cm_players p ON p.id = prs.player_id WHERE (prs.season = ${season} OR prs.season = ${legacyOff})`;
          if (platform !== 'all' && platform !== '') query.append(sql` AND prs.platform = ${platform}`);
          query.append(sql` GROUP BY prs.player_id ORDER BY points DESC, wins DESC, top4 DESC`);
        } else {
          query = sql`SELECT prs.player_id, MAX(prs.player_name) AS player_name, 'Global' AS region, prs.season, SUM(prs.points) AS points, SUM(prs.tournaments_played) AS tournaments_played, SUM(prs.wins) AS wins, SUM(prs.top4) AS top4, MAX(p.avatar) AS avatar FROM player_regional_stats prs LEFT JOIN cm_players p ON p.id = prs.player_id WHERE prs.season = ${season}`;
          if (platform !== 'all' && platform !== '') query.append(sql` AND prs.platform = ${platform}`);
          query.append(sql` GROUP BY prs.player_id, prs.season ORDER BY points DESC, wins DESC, top4 DESC`);
        }
      }

      const rows = await db.execute(query);
      res.json({ leaderboard: rows.rows });
    } catch (error: any) {
      console.error('Error fetching regional leaderboard:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to fetch regional leaderboard' });
    }
  });
}
