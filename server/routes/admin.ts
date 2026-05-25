import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  users, cmPlayers, cmMatchResults, externalPlayerCombos, adminAuditLogs,
  challongeMatchResults, challongePlayers, challongeReportedCombos, comboStats,
  bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats,
  externalTournamentResultSchema, upsertTournamentPlayerCombosSchema,
  tournamentComboSchema,
} from "@shared/schema";
import { desc, asc, eq, and, inArray, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "./middleware";
import { fetchTournamentDetail } from "../challengermode";
import {
  processExternalCombo,
  calculatePoints as calcExternalPoints,
  revertExternalCombo,
  revertExternalComboTx,
} from "../scoreExternalCombo";
import { recalculateAllRegionalStats } from "../lib/regionalScoring";
import { determineSeason } from "../lib/seasons";

async function syncGhostPlayersFromData(data: any): Promise<number> {
  let count = 0;

  const upsertPlayer = async (pid: string, name: string, avatar: string | null) => {
    if (!pid || !name || pid === 'undefined') return;
    await db.insert(challongePlayers).values({
      id: pid,
      nickname: name,
      avatar,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: challongePlayers.id,
      set: {
        nickname: sql`excluded.nickname`,
        avatar: sql`COALESCE(excluded.avatar, challonge_players.avatar)`,
        updatedAt: new Date(),
      }
    });
    count++;
  };

  if (Array.isArray(data.standings)) {
    console.log(`[Admin] Syncing ghost players from data: ${data.standings.length} standings found`);
    for (const p of data.standings) {
      const part = p.participant || p;
      const name = part.name || part.username || part.display_name || 'Unknown';
      const pid = part.id ? String(part.id) : name;
      await upsertPlayer(pid, name, part.avatar_url || part.icon || null);
    }
  } else if (Array.isArray(data.participants)) {
    console.log(`[Admin] Syncing ghost players from data: ${data.participants.length} participants found`);
    for (const p of data.participants) {
      const part = p.participant || p;
      const name = part.name || part.username || part.display_name || 'Unknown';
      const pid = part.id ? String(part.id) : name;
      await upsertPlayer(pid, name, part.avatar_url || null);
    }
  }

  try {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
  } catch {
    try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch { }
  }

  try {
    const { recalculateRegionalStatsForTournament } = await import('../lib/regionalScoring');
    await recalculateRegionalStatsForTournament('ALL');
  } catch (e) {
    console.error("[Admin] Failed to recalculate regional stats:", e);
  }

  return count;
}

export function registerAdminRoutes(app: Express): void {
  // Deprecated endpoint — returns 410
  app.post('/api/admin/tournament-results', requireAdmin, async (_req, res) => {
    return res.status(410).json({
      error: 'Endpoint deprecato. Usa /api/admin/tournament-results/external con playerId e tournamentId da Challengermode.'
    });
  });

  app.post('/api/admin/tournament-results/external', requireAdmin, async (req, res) => {
    try {
      if (req.body && typeof req.body.isAdmin !== 'undefined') {
        return res.status(400).json({ error: 'Client cannot set isAdmin; admin is verified server-side.' });
      }

      const data = externalTournamentResultSchema.parse(req.body);

      const calculatePoints = (participants: number, position: number) => {
        if (position === 1) return participants * 3;
        if (position === 2) return participants * 2;
        if (position === 3) return participants * 1;
        if (position === 4) return Math.floor(participants * 0.5);
        return 0;
      };

      const firstPoints = calculatePoints(data.participants, 1);
      const secondPoints = calculatePoints(data.participants, 2);
      const thirdPoints = calculatePoints(data.participants, 3);
      const fourthPoints = calculatePoints(data.participants, 4);

      const processCombo = async (combo: any, position: number) => {
        const points = position === 1 ? firstPoints : position === 2 ? secondPoints : thirdPoints;
        const primiPosti = position === 1 ? 1 : 0;
        const secondiPosti = position === 2 ? 1 : 0;
        const terziPosti = position === 3 ? 1 : 0;

        await db.execute(sql`
          INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione)
          VALUES (${combo.blade}, ${combo.assistBlade}, ${combo.ratchet}, ${combo.bit}, ${combo.lockChip}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points}, NOW())
          ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip)
          DO UPDATE SET
            primi_posti = combo_stats.primi_posti + ${primiPosti},
            secondi_posti = combo_stats.secondi_posti + ${secondiPosti},
            terzi_posti = combo_stats.terzi_posti + ${terziPosti},
            punteggio_totale = combo_stats.punteggio_totale + ${points}
        `);

        for (const [table, col, val] of [
          ['blade_stats', 'blade', combo.blade],
          ['assist_blade_stats', 'assist_blade', combo.assistBlade],
          ['ratchet_stats', 'ratchet', combo.ratchet],
          ['bit_stats', 'bit', combo.bit],
          ['lock_chip_stats', 'lock_chip', combo.lockChip],
        ] as [string, string, string][]) {
          await db.execute(sql`
            INSERT INTO ${sql.raw(table)} (${sql.raw(col)}, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
            VALUES (${val}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
            ON CONFLICT (${sql.raw(col)})
            DO UPDATE SET
              primi_posti = ${sql.raw(table)}.primi_posti + ${primiPosti},
              secondi_posti = ${sql.raw(table)}.secondi_posti + ${secondiPosti},
              terzi_posti = ${sql.raw(table)}.terzi_posti + ${terziPosti},
              punteggio_totale = ${sql.raw(table)}.punteggio_totale + ${points}
          `);
        }
      };

      const loadCombosForPlayer = async (playerId: string) => {
        const rows = await db.select().from(externalPlayerCombos)
          .where(and(eq(externalPlayerCombos.tournamentId, data.tournamentId), eq(externalPlayerCombos.playerId, playerId)))
          .orderBy(asc(externalPlayerCombos.comboNumber));
        return rows.map((r: any) => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip }));
      };

      const firstCombos = await loadCombosForPlayer(data.firstPlacePlayerId);
      const secondCombos = await loadCombosForPlayer(data.secondPlacePlayerId);
      const thirdCombos = await loadCombosForPlayer(data.thirdPlacePlayerId);
      const fourthCombos = data.fourthPlacePlayerId ? await loadCombosForPlayer(data.fourthPlacePlayerId) : [];

      if (firstCombos.length !== 3 || secondCombos.length !== 3 || thirdCombos.length !== 3) {
        return res.status(400).json({ error: 'Each winner must have exactly 3 combos in external_player_combos' });
      }
      if (data.fourthPlacePlayerId && fourthCombos.length !== 3) {
        return res.status(400).json({ error: '4th place player must have exactly 3 combos' });
      }

      const existingResults = await db
        .select({ playerId: cmMatchResults.playerId, comboNumber: cmMatchResults.comboNumber })
        .from(cmMatchResults)
        .where(eq(cmMatchResults.tournamentId, data.tournamentId));
      const existingKeySet = new Set(existingResults.map(r => `${r.playerId}|${r.comboNumber}`));

      await db.insert(cmPlayers).values([
        { id: data.firstPlacePlayerId, nickname: data.firstPlacePlayerId, avatar: null },
        { id: data.secondPlacePlayerId, nickname: data.secondPlacePlayerId, avatar: null },
        { id: data.thirdPlacePlayerId, nickname: data.thirdPlacePlayerId, avatar: null },
        ...(data.fourthPlacePlayerId ? [{ id: data.fourthPlacePlayerId, nickname: data.fourthPlacePlayerId, avatar: null }] : []),
      ]).onConflictDoUpdate({
        target: cmPlayers.id,
        set: { nickname: sql`excluded.nickname`, avatar: sql`excluded.avatar`, updatedAt: sql`now()` }
      });

      const insertValues = [
        ...firstCombos.map((combo, idx) => ({ tournamentId: data.tournamentId, playerId: data.firstPlacePlayerId, comboNumber: idx + 1, ...combo, piazzamento: 1, numeroPartecipanti: data.participants, dataTorneo: new Date(data.dataTorneo), puntiGuadagnati: firstPoints })),
        ...secondCombos.map((combo, idx) => ({ tournamentId: data.tournamentId, playerId: data.secondPlacePlayerId, comboNumber: idx + 1, ...combo, piazzamento: 2, numeroPartecipanti: data.participants, dataTorneo: new Date(data.dataTorneo), puntiGuadagnati: secondPoints })),
        ...thirdCombos.map((combo, idx) => ({ tournamentId: data.tournamentId, playerId: data.thirdPlacePlayerId, comboNumber: idx + 1, ...combo, piazzamento: 3, numeroPartecipanti: data.participants, dataTorneo: new Date(data.dataTorneo), puntiGuadagnati: thirdPoints })),
        ...fourthCombos.map((combo, idx) => ({ tournamentId: data.tournamentId, playerId: data.fourthPlacePlayerId!, comboNumber: idx + 1, ...combo, piazzamento: 4, numeroPartecipanti: data.participants, dataTorneo: new Date(data.dataTorneo), puntiGuadagnati: fourthPoints })),
      ];

      const ensureComboStats = [...firstCombos, ...secondCombos, ...thirdCombos, ...fourthCombos]
        .map(combo => ({ blade: combo.blade, assistBlade: combo.assistBlade, ratchet: combo.ratchet, bit: combo.bit, lockChip: combo.lockChip }));
      if (ensureComboStats.length > 0) {
        await db.insert(comboStats).values(ensureComboStats as any).onConflictDoNothing();
      }

      await db.insert(cmMatchResults).values(insertValues as any).onConflictDoUpdate({
        target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any,
        set: {
          blade: sql`excluded.blade`, assistBlade: sql`excluded.assist_blade`, ratchet: sql`excluded.ratchet`,
          bit: sql`excluded.bit`, lockChip: sql`excluded.lock_chip`, piazzamento: sql`excluded.piazzamento`,
          numeroPartecipanti: sql`excluded.numero_partecipanti`, dataTorneo: sql`excluded.data_torneo`,
          puntiGuadagnati: sql`excluded.punti_guadagnati`, updatedAt: sql`now()`,
        }
      });

      const seasonValAdmin = determineSeason(new Date(data.dataTorneo));
      const applyIfNew = async (combos: any[], playerId: string, placement: number) => {
        for (const [idx, combo] of combos.entries()) {
          const key = `${playerId}|${idx + 1}`;
          if (!existingKeySet.has(key)) {
            await processExternalCombo({ ...combo, season: seasonValAdmin, placement, totalParticipants: data.participants });
          }
        }
      };
      await applyIfNew(firstCombos, data.firstPlacePlayerId, 1);
      await applyIfNew(secondCombos, data.secondPlacePlayerId, 2);
      await applyIfNew(thirdCombos, data.thirdPlacePlayerId, 3);
      if (data.fourthPlacePlayerId) await applyIfNew(fourthCombos, data.fourthPlacePlayerId, 4);

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      } catch {
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`); } catch (e) { console.error('Failed to refresh materialized view:', e); }
      }

      try {
        const { recalculateRegionalStatsForTournament } = await import('../lib/regionalScoring');
        await recalculateRegionalStatsForTournament(data.tournamentId);
      } catch { }

      res.json({ success: true, message: 'External tournament results submitted successfully', tournamentId: data.tournamentId });
    } catch (error) {
      console.error('External tournament submission error:', error);
      res.status(400).json({ error: 'Failed to submit external tournament results' });
    }
  });

  app.get('/api/admin/tournaments', requireAuth, async (req, res) => {
    try {
      const { fetchTournamentsForGame, mapToTorneoCards } = await import('../challengermode');
      const after = (req.query.after as string) || '2025-10-11T00:00:00Z';
      const nodes = await fetchTournamentsForGame(after);
      const tournaments = mapToTorneoCards(nodes);
      res.json({ tournaments });
    } catch (error: any) {
      console.error('Failed to fetch Challengermode tournaments:', error?.message || error);
      res.status(500).json({ error: 'Failed to fetch tournaments from Challengermode' });
    }
  });

  app.get('/api/admin/tournaments/:id/results', requireAuth, async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'Missing tournament id' });

      const results = await db.select().from(cmMatchResults)
        .where(eq(cmMatchResults.tournamentId, id))
        .orderBy(asc(cmMatchResults.piazzamento), asc(cmMatchResults.comboNumber));

      const filterByPlacement = (p: number) =>
        results.filter((r: any) => r.piazzamento === p).map((r: any) => ({
          blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet,
          bit: r.bit, lockChip: r.lockChip, puntiGuadagnati: r.puntiGuadagnati,
        }));

      res.json({
        firstPlaceCombos: filterByPlacement(1),
        secondPlaceCombos: filterByPlacement(2),
        thirdPlaceCombos: filterByPlacement(3),
        fourthPlaceCombos: filterByPlacement(4),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tournament results' });
    }
  });

  app.get('/api/admin/tournament-results', requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: 'User not found' });
      const { password_hash: _, password: __, ...userWithoutPassword } = user as any;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  app.post('/api/admin/refresh-all-tournaments', requireAdmin, async (req, res) => {
    try {
      const rows = await db.execute(sql`SELECT id FROM tournaments_view`);
      const ids = rows.rows.map((r: any) => String(r.id));

      console.log(`[Admin] Refreshing ${ids.length} tournaments...`);

      let successCount = 0;
      let errorCount = 0;

      for (const id of ids) {
        try {
          await fetchTournamentDetail(id);
          successCount++;
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          console.error(`[Admin] Failed to refresh tournament ${id}:`, e);
          errorCount++;
        }
      }

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
      } catch {
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch { }
      }

      res.json({ success: true, total: ids.length, refreshed: successCount, errors: errorCount });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || 'Failed to refresh tournaments' });
    }
  });

  app.post('/api/admin/sync-challonge', requireAdmin, async (req, res) => {
    try {
      const { syncChallongeTournaments } = await import('../lib/challonge');
      const result = await syncChallongeTournaments();

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
      } catch {
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch { }
      }

      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Challonge sync failed:', error);
      res.status(500).json({ error: error?.message || 'Failed to sync Challonge tournaments' });
    }
  });

  app.post('/api/admin/recalc-stats', requireAdmin, async (req, res) => {
    try {
      console.log(`[Admin] Starting regional stats recalculation...`);
      const result = await recalculateAllRegionalStats();
      console.log(`[Admin] Stats recalculation complete. Inserted/Updated: ${result.inserted}`);
      res.json({ success: true, result });
    } catch (error: any) {
      console.error(`[Admin] Stats recalculation failed:`, error);
      res.status(500).json({ error: error?.message || 'Failed to recalculate stats' });
    }
  });

  app.post('/api/admin/import-tournament', requireAdmin, async (req, res) => {
    try {
      const body = req.body;

      if (!body.id || !body.tournament_name || !body.start_date || !body.total_players || !body.standings) {
        return res.status(400).json({ error: 'Invalid JSON format. Missing required fields: id, tournament_name, start_date, total_players, standings' });
      }

      await db.insert(challongeMatchResults).values({
        tournamentId: body.id,
        data: body,
        fetchedAt: new Date(),
      }).onConflictDoUpdate({
        target: challongeMatchResults.tournamentId,
        set: { data: body, fetchedAt: new Date() }
      });

      await syncGhostPlayersFromData(body);

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`);
      } catch {
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW player_platform_stats`); } catch (e) { console.error("Failed to refresh leaderboard view:", e); }
      }

      try {
        const { recalculateRegionalStatsForTournament } = await import('../lib/regionalScoring');
        await recalculateRegionalStatsForTournament('ALL');
      } catch (e) {
        console.error("[Admin] Failed to recalculate regional stats:", e);
      }

      console.log(`[Admin] Imported tournament: ${body.tournament_name} (${body.id})`);
      res.json({ success: true, id: body.id });
    } catch (error) {
      console.error("[Admin] Import failed:", error);
      res.status(500).json({ error: 'Import failed' });
    }
  });

  app.post('/api/admin/tournaments/:id/sync-ghost-players', requireAdmin, async (req, res) => {
    try {
      const tournamentId = req.params.id;
      const rows = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId} LIMIT 1`);
      if (rows.rows.length === 0) return res.status(404).json({ error: 'Tournament not found' });

      const count = await syncGhostPlayersFromData(rows.rows[0].data);
      res.json({ success: true, count });
    } catch (error: any) {
      console.error("[Admin] Sync ghost players failed:", error);
      res.status(500).json({ error: error?.message || 'Failed to sync players' });
    }
  });

  app.post('/api/admin/tournaments/:id/combos/reset', requireAdmin, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      if (!tournamentId) return res.status(400).json({ error: 'Missing tournament id' });

      let affected = 0;
      await db.transaction(async (tx: any) => {
        const resRows = await tx.execute(sql`
          SELECT blade,
                 assist_blade AS "assistBlade",
                 ratchet,
                 bit,
                 lock_chip AS "lockChip",
                 data_torneo AS "dataTorneo",
                 piazzamento,
                 numero_partecipanti AS "numeroPartecipanti"
          FROM cm_match_results
          WHERE tournament_id = ${tournamentId}
        `);
        const rows = (resRows.rows as any[]) || [];

        for (const r of rows) {
          const placement = Number(r.piazzamento ?? 0);
          const participants = Number(r.numeroPartecipanti ?? 0);
          if (placement >= 1 && placement <= 3 && participants > 0) {
            const seasonForRevert = r.dataTorneo ? determineSeason(new Date(r.dataTorneo)) : determineSeason(new Date());
            await revertExternalComboTx(tx, {
              blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet,
              bit: r.bit, lockChip: r.lockChip, season: seasonForRevert,
              placement, totalParticipants: participants,
            });
            affected++;
          }
        }

        await tx.execute(sql`DELETE FROM cm_match_results WHERE tournament_id = ${tournamentId}`);
        await tx.execute(sql`DELETE FROM external_player_combos WHERE tournament_id = ${tournamentId}`);
      });

      try {
        await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      } catch {
        await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
      }

      try {
        const adminRow = await db.select({ email: users.email }).from(users).where(eq(users.id, req.session.userId!));
        const email = adminRow[0]?.email || '';
        await db.insert(adminAuditLogs).values({
          adminUserId: req.session.userId!,
          email,
          action: 'reset_tournament_combos',
          tournamentId,
          payload: { affected },
        } as any);
      } catch { }

      return res.json({ success: true, affected });
    } catch (error: any) {
      console.error('Failed to reset tournament combos:', error);
      return res.status(500).json({ error: error?.message || 'Failed to reset tournament combos' });
    }
  });

  // Admin upsert player combos (also used by authenticated users for Challonge claim)
  app.put('/api/tournaments/:id/players/:playerId/combos', requireAdmin, async (req, res) => {
    try {
      const parsed = upsertTournamentPlayerCombosSchema.parse({
        tournamentId: String(req.params.id || '').trim(),
        playerId: String(req.params.playerId || '').trim(),
        combos: Array.isArray(req.body?.combos) ? req.body.combos : [],
        platform: req.body?.platform || 'challengermode',
      });

      for (const combo of parsed.combos) {
        const bladeRows = await db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, combo.blade));
        const bladeCount = Number(bladeRows[0]?.count ?? 0);

        const assistCount = combo.assistBlade === 'None'
          ? 1
          : Number((await db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, combo.assistBlade)))[0]?.count ?? 0);

        const bitRows = await db.select().from(bitStats).where(eq(bitStats.bit, combo.bit)).limit(1);
        const bitCount = bitRows.length ? 1 : 0;
        const bitIsRatchetLess = !!(bitRows[0] as any)?.isRatchetLess;

        const ratchetCount = combo.ratchet === 'None'
          ? (bitIsRatchetLess ? 1 : 0)
          : Number((await db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, combo.ratchet)))[0]?.count ?? 0);

        const lockChipCount = combo.lockChip === 'None'
          ? 1
          : Number((await db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, combo.lockChip)))[0]?.count ?? 0);

        if (!bladeCount || !assistCount || !ratchetCount || !bitCount || !lockChipCount) {
          return res.status(400).json({ error: 'Invalid combo components' });
        }
      }

      const seen = new Set<string>();
      for (const c of parsed.combos) {
        const key = `${c.blade}|${c.assistBlade}|${c.ratchet}|${c.bit}|${c.lockChip}`;
        if (seen.has(key)) return res.status(400).json({ error: 'Duplicate combos in the deck' });
        seen.add(key);
      }

      await db.execute(sql`DELETE FROM external_player_combos WHERE tournament_id = ${parsed.tournamentId} AND player_id = ${parsed.playerId}`);

      if (parsed.platform === 'challonge') {
        try {
          const userRows = await db.execute(sql`
            SELECT u.id FROM users u
            LEFT JOIN user_aliases ua ON ua.user_id = u.id
            WHERE LOWER(TRIM(u.challonge_username)) = LOWER(TRIM(${parsed.playerId}))
               OR LOWER(TRIM(ua.alias)) = LOWER(TRIM(${parsed.playerId}))
            LIMIT 1
          `);
          if (userRows.rows.length > 0) {
            const uid = (userRows.rows[0] as any).id;
            await db.delete(challongeReportedCombos)
              .where(and(eq(challongeReportedCombos.tournamentId, parsed.tournamentId), eq(challongeReportedCombos.userId, uid)));
          }
        } catch (err) {
          console.warn('Failed to clean up potential duplicate Challonge reported combos:', err);
        }
      }

      await db.insert(cmPlayers).values({ id: parsed.playerId, nickname: parsed.playerId, avatar: null as any })
        .onConflictDoNothing();

      let placement: number | null = null;
      let totalParticipants: number | null = null;
      let tournamentDate: Date | null = null;

      if (parsed.platform === 'challonge') {
        try {
          const challongeRes = await db.execute(sql`SELECT * FROM challonge_match_results WHERE tournament_id = ${parsed.tournamentId} LIMIT 1`);
          if (challongeRes.rows.length > 0) {
            const row = challongeRes.rows[0] as any;
            const d = row.data || {};
            const dateStr = d.start_date || d.started_at || d.tournament?.started_at;
            if (dateStr) tournamentDate = new Date(dateStr);
            totalParticipants = Number(d.total_players || d.participants_count || d.tournament?.participants_count || 0);

            const normalizeStr = (s: string) => String(s || '').trim().toLowerCase();
            const pIdNorm = normalizeStr(parsed.playerId);
            const found = (d.standings || []).find((p: any) =>
              normalizeStr(p.name || p.username || '') === pIdNorm || String(p.id) === pIdNorm
            );
            if (found?.rank) placement = parseInt(String(found.rank), 10);
          }
        } catch (e) {
          console.warn('Failed to fetch Challonge tournament data for enrichment:', (e as any)?.message || e);
        }
      } else {
        try {
          const detail = await fetchTournamentDetail(parsed.tournamentId);
          const startedAtStr = detail?.schedule?.startedAt as string | undefined;
          if (startedAtStr) {
            const dateOnly = String(startedAtStr).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) tournamentDate = new Date(dateOnly);
          }
          const userCount = detail?.attendance?.signups?.userCount as number | undefined;
          if (typeof userCount === 'number' && userCount > 0) totalParticipants = userCount;
          const lineups: any[] = detail?.attendance?.signups?.lineups || [];
          const found = lineups.find(l => Array.isArray(l.members) && l.members.some((m: any) => m?.user?.userId === parsed.playerId));
          const disp = found?.placement?.displayPlacement as string | undefined;
          if (disp) {
            const p = parseInt(String(disp), 10);
            if (!Number.isNaN(p)) placement = p;
          }
        } catch (e) {
          console.warn('Failed to fetch tournament detail for enrichment:', (e as any)?.message || e);
        }
      }

      const seasonVal = tournamentDate ? determineSeason(tournamentDate) : determineSeason(new Date());
      const values = parsed.combos.map((c, idx) => ({
        tournamentId: parsed.tournamentId,
        playerId: parsed.playerId,
        comboNumber: idx + 1,
        blade: c.blade, assistBlade: c.assistBlade, ratchet: c.ratchet, bit: c.bit, lockChip: c.lockChip,
        placement: placement ?? null,
        totalParticipants: totalParticipants ?? null,
        tournamentDate: tournamentDate ?? null,
        season: seasonVal,
        platform: parsed.platform,
      }));
      const inserted = await db.insert(externalPlayerCombos).values(values).returning();

      const prevRows = await db
        .select({ comboNumber: cmMatchResults.comboNumber, blade: cmMatchResults.blade, assistBlade: cmMatchResults.assistBlade, ratchet: cmMatchResults.ratchet, bit: cmMatchResults.bit, lockChip: cmMatchResults.lockChip, piazzamento: cmMatchResults.piazzamento, numeroPartecipanti: cmMatchResults.numeroPartecipanti })
        .from(cmMatchResults)
        .where(and(eq(cmMatchResults.tournamentId, parsed.tournamentId), eq(cmMatchResults.playerId, parsed.playerId)));
      const prevMap = new Map<number, any>(prevRows.map((r: any) => [Number(r.comboNumber), r]));

      if (tournamentDate) {
        const baseCombos = inserted.map((r: any) => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip, season: seasonVal }));
        if (baseCombos.length > 0) await db.insert(comboStats).values(baseCombos as any).onConflictDoNothing();

        const cmValues = inserted.map((r: any, idx: number) => ({
          tournamentId: parsed.tournamentId,
          playerId: parsed.playerId,
          comboNumber: r.comboNumber ?? idx + 1,
          blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip,
          piazzamento: placement ?? 0,
          numeroPartecipanti: totalParticipants ?? 0,
          dataTorneo: tournamentDate,
          puntiGuadagnati: (placement && totalParticipants && placement >= 1 && placement <= 4 && totalParticipants > 0)
            ? calcExternalPoints(placement, totalParticipants) : 0,
        }));
        await db.insert(cmMatchResults).values(cmValues as any).onConflictDoUpdate({
          target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber],
          set: {
            blade: sql`excluded.blade`, assistBlade: sql`excluded.assist_blade`, ratchet: sql`excluded.ratchet`,
            bit: sql`excluded.bit`, lockChip: sql`excluded.lock_chip`, piazzamento: sql`excluded.piazzamento`,
            numeroPartecipanti: sql`excluded.numero_partecipanti`, dataTorneo: sql`excluded.data_torneo`,
            puntiGuadagnati: sql`excluded.punti_guadagnati`, updatedAt: sql`now()`,
          }
        });
      }

      if (placement && totalParticipants && placement >= 1 && placement <= 4 && totalParticipants > 0) {
        for (const r of inserted) {
          const comboNum = Number(r.comboNumber ?? 0);
          const prev = prevMap.get(comboNum);
          const changed = !!prev && (
            prev.blade !== r.blade || prev.assistBlade !== r.assistBlade ||
            prev.ratchet !== r.ratchet || prev.bit !== r.bit || prev.lockChip !== r.lockChip ||
            Number(prev.piazzamento) !== Number(placement) || Number(prev.numeroPartecipanti) !== Number(totalParticipants)
          );

          if (changed) {
            await revertExternalCombo({ blade: prev.blade, assistBlade: prev.assistBlade, ratchet: prev.ratchet, bit: prev.bit, lockChip: prev.lockChip, season: seasonVal, placement: Number(prev.piazzamento ?? 0), totalParticipants: Number(prev.numeroPartecipanti ?? 0) });
            await processExternalCombo({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip, season: seasonVal, placement, totalParticipants });
          } else if (!prev) {
            await processExternalCombo({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip, season: seasonVal, placement, totalParticipants });
          }
        }

        try {
          await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
        } catch {
          try { await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`); } catch (e) { console.error('Failed to refresh materialized view:', e); }
        }
      }

      try {
        const { recalculateRegionalStatsForTournament } = await import('../lib/regionalScoring');
        await recalculateRegionalStatsForTournament(parsed.tournamentId);
      } catch { }

      try {
        const adminRow = await db.select({ email: users.email }).from(users).where(eq(users.id, req.session.userId!));
        const email = adminRow[0]?.email || '';
        await db.insert(adminAuditLogs).values({
          adminUserId: req.session.userId!, email,
          action: 'upsert_player_combos',
          tournamentId: parsed.tournamentId,
          playerId: parsed.playerId,
          payload: { combos: parsed.combos },
        } as any);
      } catch { }

      res.json({ success: true, combos: inserted.map((r: any) => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip })) });
    } catch (error: any) {
      console.error('Failed to upsert player combos:', error);
      res.status(400).json({ error: error?.message || 'Failed to upsert player combos' });
    }
  });
}
