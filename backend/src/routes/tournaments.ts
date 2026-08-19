import type { Express } from "express";
import { z } from "zod";
import { db } from "../db";
import { storage } from "../storage";
import {
  comboStats, externalPlayerCombos, cmPlayers, cmMatchResults,
  challongeReportedCombos, challongePlayers, bladeStats, assistBladeStats,
  ratchetStats, bitStats, lockChipStats, tournamentComboSchema, users, adminAuditLogs, userAliases,
} from "@shared/schema";
import { desc, asc, eq, and, sql, inArray, or } from "drizzle-orm";
import {
  fetchTournamentsForGame, fetchTournamentDetail, fetchUserParticipations,
} from "../challengermode";
import { checkTournamentPlacement } from "../lib/challengermode";
import {
  processExternalCombo, calculatePoints as calcExternalPoints,
  revertExternalCombo, revertExternalComboTx,
} from "../scoreExternalCombo";
import { determineSeason } from "../lib/seasons";
import { calculateChallongePoints } from "../lib/challongePoints";
import { requireAuth, requireAdmin } from "./middleware";

export function registerTournamentsRoutes(app: Express): void {
  app.post('/api/tournaments/claim', requireAuth, async (req, res) => {
    try {
      const BodySchema = z.object({
        tournamentId: z.string().min(1).max(64).transform((s) => s.trim()),
        combos: z.array(tournamentComboSchema).length(3),
        rank: z.number().min(1).max(9999).optional(),
        platform: z.enum(['challengermode', 'challonge']).optional().default('challengermode'),
      });
      const parsed = BodySchema.parse(req.body);
      if (parsed.rank && parsed.rank > 4) return res.status(400).json({ error: "Only Top 4 ranks are allowed" });

      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ error: 'User not found' });

      const platform = parsed.platform || 'challengermode';

      if (platform === 'challonge') {
        const tCheck = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${parsed.tournamentId}`);
        if (tCheck.rows.length === 0) return res.status(404).json({ error: 'Torneo Challonge non trovato' });
        const tournamentData = tCheck.rows[0]?.data as any;
        const tournamentName = tournamentData?.name || tournamentData?.tournament?.name || null;

        await db.transaction((async (tx: any) => {
          await tx.delete(challongeReportedCombos).where(and(eq(challongeReportedCombos.tournamentId, parsed.tournamentId), eq(challongeReportedCombos.userId, user.id)));
          for (let i = 0; i < parsed.combos.length; i++) {
            const c = parsed.combos[i];
            await tx.insert(challongeReportedCombos).values({ userId: user.id, tournamentId: parsed.tournamentId, tournamentName, comboNumber: i + 1, blade: c.blade, ratchet: c.ratchet, bit: c.bit, assistBlade: c.assistBlade || null, lockChip: c.lockChip || null, rank: parsed.rank || 0 } as any);
          }
          if (user.challongeId) {
            await tx.insert(challongePlayers).values({ id: user.challongeId, nickname: user.challongeUsername || user.displayName, avatar: user.photoURL, updatedAt: new Date() } as any).onConflictDoUpdate({ target: challongePlayers.id, set: { avatar: sql`excluded.avatar`, updatedAt: sql`now()` } });
          }
        }) as any);

        return res.json({ success: true, message: 'Deck Challonge registrato' });
      }

      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(400).json({ error: 'Devi effettuare il login con Challengermode' });

      const verified = await checkTournamentPlacement(parsed.tournamentId, challengerId);
      if (!verified) return res.status(403).json({ error: 'Non risulti nella Top 4 di questo torneo' });

      await db.insert(cmPlayers).values({ id: challengerId, nickname: user?.displayName || challengerId, avatar: user.photoURL || null })
        .onConflictDoUpdate({ target: cmPlayers.id, set: { avatar: sql`excluded.avatar`, updatedAt: sql`now()` } });

      let placement: number | null = null;
      let totalParticipants: number | null = null;
      let tournamentDate: Date | null = null;
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
        const found = lineups.find(l => Array.isArray(l.members) && l.members.some((m: any) => m?.user?.userId === challengerId));
        const disp = found?.placement?.displayPlacement as string | undefined;
        if (disp) { const p = parseInt(String(disp), 10); if (!Number.isNaN(p)) placement = p; }
      } catch { }

      await db.delete(externalPlayerCombos).where(and(eq(externalPlayerCombos.tournamentId, parsed.tournamentId), eq(externalPlayerCombos.playerId, challengerId)));

      const seasonVal = tournamentDate ? determineSeason(tournamentDate) : determineSeason(new Date());
      const values = parsed.combos.map((c, idx) => ({ tournamentId: parsed.tournamentId, playerId: challengerId, comboNumber: idx + 1, blade: c.blade, assistBlade: c.assistBlade, ratchet: c.ratchet, bit: c.bit, lockChip: c.lockChip, placement: placement ?? null, totalParticipants: totalParticipants ?? null, tournamentDate: tournamentDate ?? null, season: seasonVal }));
      const inserted = await db.insert(externalPlayerCombos).values(values).returning();

      if (tournamentDate) {
        const baseCombos = inserted.map((r) => ({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip, season: seasonVal }));
        if (baseCombos.length > 0) await db.insert(comboStats).values(baseCombos as any).onConflictDoNothing();
        const cmValues = inserted.map((r, idx) => ({ tournamentId: parsed.tournamentId, playerId: challengerId, comboNumber: r.comboNumber ?? idx + 1, blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip, piazzamento: placement ?? 0, numeroPartecipanti: totalParticipants ?? 0, dataTorneo: tournamentDate, puntiGuadagnati: (placement && totalParticipants && placement >= 1 && placement <= 4 && totalParticipants > 0) ? calcExternalPoints(placement, totalParticipants) : 0 }));
        await db.insert(cmMatchResults).values(cmValues as any).onConflictDoUpdate({ target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any, set: { blade: sql`excluded.blade`, assistBlade: sql`excluded.assist_blade`, ratchet: sql`excluded.ratchet`, bit: sql`excluded.bit`, lockChip: sql`excluded.lock_chip`, piazzamento: sql`excluded.piazzamento`, numeroPartecipanti: sql`excluded.numero_partecipanti`, dataTorneo: sql`excluded.data_torneo`, puntiGuadagnati: sql`excluded.punti_guadagnati`, updatedAt: sql`now()` } });
      }

      if (placement && totalParticipants && placement >= 1 && placement <= 4 && totalParticipants > 0) {
        for (const r of inserted) {
          await processExternalCombo({ blade: r.blade, assistBlade: r.assistBlade, ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip, season: seasonVal, placement, totalParticipants });
        }
      }

      try {
        const { recalculateRegionalStatsForTournament } = await import('../lib/regionalScoring');
        await recalculateRegionalStatsForTournament(parsed.tournamentId);
      } catch { }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Invalid request' });
    }
  });

  app.get('/api/tournaments', async (req, res) => {
    try {
      const region = String((req.query.region ?? '') as string).trim();
      const platform = String((req.query.platform ?? 'all') as string).trim().toLowerCase();
      const season = String((req.query.season ?? '') as string).trim();
      const after = String(req.query.after || '2024-01-01T00:00:00Z');

      let cmNodes: any[] = [];
      if (platform === 'all' || platform === 'challengermode') {
        try { cmNodes = await fetchTournamentsForGame(after); } catch (e) { console.error('Error fetching CM tournaments:', e); }
      }

      let challongeNodes: any[] = [];
      if (platform === 'all' || platform === 'challonge') {
        const rawChallonge = await db.execute(sql`SELECT tournament_id, data, fetched_at FROM challonge_match_results`);
        challongeNodes = (rawChallonge.rows as any[]).map(r => {
          const d = r.data || {};
          const tName = d.tournament_name || d.name || (d.tournament && d.tournament.name) || 'Unknown Tournament';
          const tStartDate = d.start_date || d.started_at || (d.tournament && d.tournament.started_at) || null;
          const tPlayers = d.total_players || d.participants_count || (d.tournament && d.tournament.participants_count) || 0;
          const tUrl = d.full_challonge_url || (d.tournament && d.tournament.full_challonge_url) || null;
          return { id: r.tournament_id, name: tName, description: d.description || '', state: d.state || 'ended', contactUrl: tUrl, schedule: { startedAt: tStartDate }, gameTitle: { title: 'Beyblade X' }, hasCombos: false, region: null, city: null, organizerName: null, platform: 'challonge', attendance: { signups: { uCount: tPlayers, count: tPlayers } } };
        });
        if (season) {
          challongeNodes = challongeNodes.filter(n => {
            const d = n.schedule?.startedAt ? new Date(n.schedule.startedAt) : null;
            return d ? determineSeason(d) === season : false;
          });
        }
      }

      const allNodes = [...cmNodes, ...challongeNodes];
      const rowsCombos = await db.execute(sql`SELECT DISTINCT tournament_id FROM cm_match_results UNION SELECT DISTINCT tournament_id FROM challonge_reported_combos UNION SELECT DISTINCT tournament_id FROM external_player_combos`);
      const idSet = new Set<string>((rowsCombos.rows as any[]).map((r) => String((r as any).tournament_id || (r as any).tournamentId)));

      const metaRows = await db.execute(region ? sql`SELECT id, region, city, organizer_name FROM tournaments_view WHERE region = ${region}` : sql`SELECT id, region, city, organizer_name FROM tournaments_view`);
      const metaMap = new Map<string, any>();
      for (const r of (metaRows.rows as any[]) || []) metaMap.set(String(r.id), r);

      const concurrency = 6;
      let out: any[] = [];
      let i = 0;
      challongeNodes.forEach(c => { c.hasCombos = idSet.has(String(c.id)); if (!region) out.push(c); });

      if (cmNodes.length > 0) {
        const cmWorker = async () => {
          while (i < cmNodes.length) {
            const idx = i++;
            const base = cmNodes[idx] as any;
            const id = String(base.id);
            try {
              const detail = await fetchTournamentDetail(id);
              const meta = metaMap.get(id) || {};
              out.push({ ...base, hosts: detail?.hosts, schedule: detail?.schedule, hasCombos: idSet.has(id), region: meta.region || null, city: meta.city || null, organizerName: meta.organizer_name || (detail?.hosts?.spaces?.[0]?.name ?? undefined), platform: 'challengermode' });
            } catch {
              const meta = metaMap.get(id) || {};
              out.push({ ...base, hasCombos: idSet.has(id), region: meta.region || null, city: meta.city || null, organizerName: meta.organizer_name, platform: 'challengermode' });
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => cmWorker()));
      }

      out.sort((a, b) => new Date(b.schedule?.startedAt || 0).getTime() - new Date(a.schedule?.startedAt || 0).getTime());
      if (season) out = out.filter(t => { const d = t.schedule?.startedAt ? new Date(t.schedule.startedAt) : null; return d ? determineSeason(d) === season : false; });

      res.json({ tournaments: out.filter(t => (region ? t.region === region : true)) });
    } catch (error: any) {
      console.error('Error fetching unified tournaments:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch tournaments' });
    }
  });

  app.get('/api/tournaments/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!id) return res.status(400).json({ error: 'Missing tournament id' });

      const challongeRes = await db.execute(sql`SELECT * FROM challonge_match_results WHERE tournament_id = ${id} LIMIT 1`);
      if (challongeRes.rows.length > 0) {
        const row = challongeRes.rows[0] as any;
        const data = row.data || {};

        const combosRes = await db.execute(sql`SELECT c.*, u.display_name, u.photo_url, 'challonge' as source_type FROM challonge_reported_combos c JOIN users u ON u.id = c.user_id WHERE c.tournament_id = ${id} ORDER BY c.rank ASC, c.combo_number ASC`);
        const externalCombosRes = await db.execute(sql`SELECT e.*, e.placement as rank, 'admin' as source_type FROM external_player_combos e WHERE e.tournament_id = ${id} AND e.platform = 'challonge' ORDER BY e.combo_number ASC`);

        const combinedCombos = [...combosRes.rows];
        for (const adminCombo of externalCombosRes.rows as any[]) {
          combinedCombos.push({ ...adminCombo, player_identifier: adminCombo.player_id });
        }

        let validUserNames: string[] = [];
        const normalize = (s: string) => s?.trim().toLowerCase() || '';
        if (req.user) {
          const aliasesRes = await db.execute(sql`SELECT alias FROM user_aliases WHERE user_id = ${req.user.id} AND is_verified = TRUE`);
          validUserNames = aliasesRes.rows.map((r: any) => r.alias);
          if (req.user.challongeUsername) validUserNames.push(req.user.challongeUsername);
        }

        const standings = data.standings || [];
        const topParticipants = standings.filter((p: any) => p.rank <= 4);
        const pIds: string[] = [];
        const pUsernames: string[] = [];
        topParticipants.forEach((p: any) => {
          const pRaw = p.participant || p;
          if (pRaw.user_id) pIds.push(String(pRaw.user_id));
          if (pRaw.username) pUsernames.push(String(pRaw.username).toLowerCase());
          if (pRaw.challonge_username) pUsernames.push(String(pRaw.challonge_username).toLowerCase());
          if (pRaw.name) pUsernames.push(String(pRaw.name).toLowerCase());
          if (pRaw.display_name) pUsernames.push(String(pRaw.display_name).toLowerCase());
        });

        const usersMap = new Map<string, string>();
        if (pIds.length > 0 || pUsernames.length > 0) {
          try {
            const criteria = [];
            if (pIds.length > 0) criteria.push(inArray(users.challongeId, pIds));
            if (pUsernames.length > 0) {
              criteria.push(inArray(sql`LOWER(${users.challongeUsername})`, pUsernames));
              criteria.push(inArray(sql`LOWER(${users.displayName})`, pUsernames));
            }
            if (criteria.length > 0) {
              const foundUsers = await db.select({ cid: users.challongeId, cname: users.challongeUsername, dname: users.displayName, photo: users.photoURL }).from(users).where(or(...criteria));
              foundUsers.forEach((u: any) => {
                if (u.photo) {
                  if (u.cid) usersMap.set(`id:${u.cid}`, u.photo);
                  if (u.cname) usersMap.set(`name:${u.cname.toLowerCase()}`, u.photo);
                  if (u.dname) usersMap.set(`name:${u.dname.toLowerCase()}`, u.photo);
                }
              });
            }
          } catch (err) { console.error("Failed to fetch users for avatars:", err); }
        }

        const top3 = topParticipants.sort((a: any, b: any) => a.rank - b.rank).map((p: any) => {
          const pRaw = p.participant || p;
          const pName = p.name || p.username || '';
          const pNameNorm = normalize(pName);
          let isCurrentUser = validUserNames.some(v => normalize(v) === pNameNorm);
          if (!isCurrentUser) {
            const pDisplayNameNorm = normalize(p.display_name || p.display_user || '');
            if (pDisplayNameNorm && pDisplayNameNorm !== pNameNorm) isCurrentUser = validUserNames.some(v => normalize(v) === pDisplayNameNorm);
          }
          let avatarUrl = pRaw.avatar_url || pRaw.attached_participatable_portrait_url || pRaw.portrait_url || null;
          const pid = pRaw.user_id ? String(pRaw.user_id) : null;
          const puname = (pRaw.username || pRaw.challonge_username || pRaw.name || pRaw.display_name || '').trim().toLowerCase();
          if (pid && usersMap.has(`id:${pid}`)) avatarUrl = usersMap.get(`id:${pid}`);
          else if (puname && usersMap.has(`name:${puname}`)) avatarUrl = usersMap.get(`name:${puname}`);
          return { id: p.name || p.id, username: pName, placement: p.rank, isCurrentUser, deck: [], profilePicture: { url: avatarUrl } };
        });

        return res.json({
          detail: {
            id: row.tournament_id, name: data.tournament_name || 'Unknown Tournament',
            date: data.start_date, schedule: { startedAt: data.start_date },
            platform: 'challonge', state: 'COMPLETED',
            participants: top3, fetchedCombos: combinedCombos, hasCombos: combinedCombos.length > 0,
            attendance: { signups: { uCount: data.total_players || 0, lineups: [] } },
          }
        });
      }

      try {
        const detail = await fetchTournamentDetail(id);
        const metaRows = await db.execute(sql`SELECT region, city, organizer_name FROM tournaments_view WHERE id = ${id}`);
        const meta = (metaRows.rows as any[])[0] || {};
        return res.json({ detail: { ...detail, region: meta.region || null, city: meta.city || null, organizerName: meta.organizer_name || (detail?.hosts?.spaces?.[0]?.name ?? undefined), platform: 'challengermode' } });
      } catch {
        return res.status(404).json({ error: 'Tournament not found' });
      }
    } catch (error) {
      console.error('Error fetching tournament detail:', error);
      res.status(500).json({ error: 'Failed to fetch tournament detail' });
    }
  });

  app.get('/api/tournaments/:id/players/:playerId/combos', async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const playerId = String(req.params.playerId || '').trim();
      if (!tournamentId || !playerId) return res.status(400).json({ error: 'Missing tournament or player id' });

      const challongeRowsResult = await db.select().from(challongeReportedCombos)
        .where(and(eq(challongeReportedCombos.tournamentId, tournamentId), eq(challongeReportedCombos.userId, playerId)))
        .orderBy(asc(challongeReportedCombos.comboNumber));

      let rows: any[] = challongeRowsResult.length > 0 ? challongeRowsResult : await db.select().from(externalPlayerCombos)
        .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, playerId)))
        .orderBy(asc(externalPlayerCombos.comboNumber));

      const combos = rows.map((r: any) => ({
        blade: r.blade, assistBlade: r.assistBlade || r.assist_blade || 'None',
        ratchet: r.ratchet, bit: r.bit, lockChip: r.lockChip || r.lock_chip || 'None',
        season: r.season, lockTime: r.createdAt || r.updatedAt || r.updated_at,
      }));
      res.json({ combos });
    } catch (error: any) {
      console.error('Failed to fetch player combos:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to fetch player combos' });
    }
  });

  app.put('/api/tournaments/:id/combos/:num', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const comboNumber = parseInt(String(req.params.num || '0'), 10);
      if (!tournamentId || !Number.isFinite(comboNumber) || comboNumber < 1 || comboNumber > 3) return res.status(400).json({ error: 'Parametri non validi' });

      const newCombo = tournamentComboSchema.parse({ blade: String(req.body?.blade || '').trim(), assistBlade: String(req.body?.assistBlade || '').trim(), ratchet: String(req.body?.ratchet || '').trim(), bit: String(req.body?.bit || '').trim(), lockChip: String(req.body?.lockChip || '').trim() });

      const hasMultipleCapitals = /[A-Z].*[A-Z]/.test(newCombo.blade || '');
      if (hasMultipleCapitals && (newCombo.assistBlade !== 'None' || newCombo.lockChip !== 'None')) return res.status(400).json({ error: 'Assist Blade e Lock Chip devono essere None per questa Blade' });

      const [[bladeExists], [assistExists], bitRows, [lockChipExists]] = await Promise.all([
        db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, newCombo.blade)),
        newCombo.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, newCombo.assistBlade)),
        db.select().from(bitStats).where(eq(bitStats.bit, newCombo.bit)).limit(1),
        newCombo.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, newCombo.lockChip)),
      ]);
      const bitIsRatchetLess = !!(bitRows[0] as any)?.isRatchetLess;
      const ratchetCount = newCombo.ratchet === 'None' ? (bitIsRatchetLess ? 1 : 0)
        : Number((await db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, newCombo.ratchet)))[0]?.count ?? 0);
      if (!Number(bladeExists?.count) || !Number(assistExists?.count) || !ratchetCount || !bitRows.length || !Number(lockChipExists?.count)) return res.status(400).json({ error: 'Invalid combo components' });

      const user = await storage.getUser(req.session.userId!);
      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(403).json({ error: 'Per registrare combo su tornei Challengermode devi collegare il tuo account Challengermode.' });

      const rows = await db.select().from(externalPlayerCombos).where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber))).limit(1);
      const existing = rows[0];

      if (!existing) {
        let cmPlacement: number | null = null;
        let cmTotalParticipants: number | null = null;
        let cmTournamentDate: Date | null = null;
        try {
          const detail = await fetchTournamentDetail(tournamentId);
          const lineups = detail?.attendance?.signups?.lineups || [];
          for (const lineup of lineups) {
            const disp = lineup?.placement?.displayPlacement ?? '';
            const rankMatch = String(disp).match(/\d+/);
            const rank = rankMatch ? parseInt(rankMatch[0], 10) : null;
            const members = lineup?.members || [];
            if (members.some((m: any) => (m?.user?.userId || '') === challengerId)) {
              cmPlacement = rank;
              break;
            }
          }
          const userCount = detail?.attendance?.signups?.userCount;
          cmTotalParticipants = typeof userCount === 'number' && userCount > 0 ? userCount : null;
          const startedAtStr = detail?.schedule?.startedAt as string | undefined;
          if (startedAtStr) {
            const dateOnly = String(startedAtStr).slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) cmTournamentDate = new Date(dateOnly);
          }
        } catch (e: any) {
          console.warn('Failed to fetch CM tournament detail for upsert:', e?.message || e);
          return res.status(404).json({ error: 'Impossibile verificare il piazzamento nel torneo.' });
        }
        if (!cmPlacement || cmPlacement > 4) return res.status(403).json({ error: 'Solo i primi 4 classificati possono registrare le combo.' });
        const seasonVal = cmTournamentDate ? determineSeason(cmTournamentDate) : determineSeason(new Date());
        await db.insert(cmPlayers).values({ id: challengerId, nickname: challengerId, avatar: null as any }).onConflictDoNothing();
        await db.insert(externalPlayerCombos).values({ tournamentId, playerId: challengerId, comboNumber, blade: newCombo.blade, assistBlade: newCombo.assistBlade, ratchet: newCombo.ratchet, bit: newCombo.bit, lockChip: newCombo.lockChip, placement: cmPlacement, totalParticipants: cmTotalParticipants, tournamentDate: cmTournamentDate, season: seasonVal, platform: 'challengermode' }).returning();
        if (cmPlacement > 0 && cmTotalParticipants && cmTotalParticipants > 0) {
          await processExternalCombo({ blade: newCombo.blade, assistBlade: newCombo.assistBlade, ratchet: newCombo.ratchet, bit: newCombo.bit, lockChip: newCombo.lockChip, season: seasonVal, placement: cmPlacement, totalParticipants: cmTotalParticipants });
          try { await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`); } catch { await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`); }
        }
        if (cmTournamentDate) {
          await db.insert(cmMatchResults).values({ tournamentId, playerId: challengerId, comboNumber, blade: newCombo.blade, assistBlade: newCombo.assistBlade, ratchet: newCombo.ratchet, bit: newCombo.bit, lockChip: newCombo.lockChip, piazzamento: cmPlacement, numeroPartecipanti: cmTotalParticipants || 0, dataTorneo: cmTournamentDate, puntiGuadagnati: cmPlacement && cmTotalParticipants ? calcExternalPoints(cmPlacement, cmTotalParticipants) : 0, updatedAt: sql`now()` } as any).onConflictDoUpdate({ target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any, set: { blade: sql`excluded.blade`, assistBlade: sql`excluded.assist_blade`, ratchet: sql`excluded.ratchet`, bit: sql`excluded.bit`, lockChip: sql`excluded.lock_chip`, piazzamento: sql`excluded.piazzamento`, numeroPartecipanti: sql`excluded.numero_partecipanti`, dataTorneo: sql`excluded.data_torneo`, puntiGuadagnati: sql`excluded.punti_guadagnati`, updatedAt: sql`now()` } });
        }
        try { await db.insert(adminAuditLogs).values({ adminUserId: req.session.userId!, email: (user as any)?.email || '', action: 'user_insert_combo', tournamentId, playerId: challengerId, payload: { comboNumber, combo: { blade: newCombo.blade, assistBlade: newCombo.assistBlade, ratchet: newCombo.ratchet, bit: newCombo.bit, lockChip: newCombo.lockChip } } } as any); } catch { }
        return res.json({ success: true, combo: { tournamentId, comboNumber, blade: newCombo.blade, assistBlade: newCombo.assistBlade, ratchet: newCombo.ratchet, bit: newCombo.bit, lockChip: newCombo.lockChip } });
      }

      if (!req.user!.isAdmin) {
        const lastUpdated = existing.updatedAt;
        if (lastUpdated && (Date.now() - new Date(lastUpdated).getTime() > 172800000)) return res.status(403).json({ error: 'Tempo per le modifiche scaduto (48 ore).' });
      }

      const placement = Number(existing.placement ?? 0);
      const totalParticipants = Number(existing.totalParticipants ?? 0);
      if (placement > 4) return res.status(403).json({ error: 'Solo i primi 4 classificati possono registrare le combo.' });

      if (placement > 0 && totalParticipants > 0) {
        const seasonForDelete = existing?.season || (existing?.tournamentDate ? determineSeason(new Date(existing.tournamentDate as any)) : determineSeason(new Date()));
        await revertExternalCombo({ blade: existing.blade, assistBlade: existing.assistBlade, ratchet: existing.ratchet, bit: existing.bit, lockChip: existing.lockChip, season: seasonForDelete, placement, totalParticipants });
      }

      const updatedRows = await db.update(externalPlayerCombos).set({ blade: newCombo.blade, assistBlade: newCombo.assistBlade, ratchet: newCombo.ratchet, bit: newCombo.bit, lockChip: newCombo.lockChip, updatedAt: sql`now()` }).where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber))).returning();
      const updated = updatedRows[0];

      if (placement > 0 && totalParticipants > 0) {
        const seasonForUpdate = updated?.season || (updated?.tournamentDate ? determineSeason(new Date(updated.tournamentDate as any)) : determineSeason(new Date()));
        await processExternalCombo({ blade: updated.blade, assistBlade: updated.assistBlade, ratchet: updated.ratchet, bit: updated.bit, lockChip: updated.lockChip, season: seasonForUpdate, placement, totalParticipants });
        try { await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`); } catch { await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`); }
      }

      if (updated?.tournamentDate) {
        await db.insert(cmMatchResults).values({ tournamentId, playerId: challengerId, comboNumber, blade: updated.blade, assistBlade: updated.assistBlade, ratchet: updated.ratchet, bit: updated.bit, lockChip: updated.lockChip, piazzamento: placement || 0, numeroPartecipanti: totalParticipants || 0, dataTorneo: updated.tournamentDate, puntiGuadagnati: placement && totalParticipants ? calcExternalPoints(placement, totalParticipants) : 0, updatedAt: sql`now()` } as any).onConflictDoUpdate({ target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any, set: { blade: sql`excluded.blade`, assistBlade: sql`excluded.assist_blade`, ratchet: sql`excluded.ratchet`, bit: sql`excluded.bit`, lockChip: sql`excluded.lock_chip`, piazzamento: sql`excluded.piazzamento`, numeroPartecipanti: sql`excluded.numero_partecipanti`, dataTorneo: sql`excluded.data_torneo`, puntiGuadagnati: sql`excluded.punti_guadagnati`, updatedAt: sql`now()` } });
      }

      try {
        await db.insert(adminAuditLogs).values({ adminUserId: req.session.userId!, email: (user as any)?.email || '', action: 'user_update_combo', tournamentId, playerId: challengerId, payload: { comboNumber, before: { blade: existing.blade, assistBlade: existing.assistBlade, ratchet: existing.ratchet, bit: existing.bit, lockChip: existing.lockChip }, after: { blade: updated.blade, assistBlade: updated.assistBlade, ratchet: updated.ratchet, bit: updated.bit, lockChip: updated.lockChip } } } as any);
      } catch { }

      res.json({ success: true, combo: { tournamentId, comboNumber, blade: updated.blade, assistBlade: updated.assistBlade, ratchet: updated.ratchet, bit: updated.bit, lockChip: updated.lockChip } });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Richiesta non valida' });
    }
  });

  app.delete('/api/tournaments/:id/combos/:num', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const comboNumber = parseInt(String(req.params.num || '0'), 10);
      if (!tournamentId || !Number.isFinite(comboNumber) || comboNumber < 1 || comboNumber > 3) return res.status(400).json({ error: 'Parametri non validi' });

      const user = await storage.getUser(req.session.userId!);
      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(403).json({ error: 'Operazione consentita solo agli utenti Challengermode' });

      const rows = await db.select().from(externalPlayerCombos).where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber))).limit(1);
      const existing = rows[0];
      if (!existing) return res.status(404).json({ error: 'Combo non trovata o non di tua proprietà' });

      if (!req.user!.isAdmin) {
        const lastUpdated = existing.updatedAt;
        if (lastUpdated && (Date.now() - new Date(lastUpdated).getTime() > 172800000)) return res.status(403).json({ error: 'Tempo per le modifiche scaduto (48 ore).' });
      }

      const placement = Number(existing.placement ?? 0);
      const totalParticipants = Number(existing.totalParticipants ?? 0);
      if (placement > 0 && totalParticipants > 0) {
        const seasonForDelete = existing?.season || (existing?.tournamentDate ? determineSeason(new Date(existing.tournamentDate as any)) : determineSeason(new Date()));
        await revertExternalCombo({ blade: existing.blade, assistBlade: existing.assistBlade, ratchet: existing.ratchet, bit: existing.bit, lockChip: existing.lockChip, season: seasonForDelete, placement, totalParticipants });
      }

      await db.delete(externalPlayerCombos).where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.playerId, challengerId), eq(externalPlayerCombos.comboNumber, comboNumber)));
      await db.delete(cmMatchResults).where(and(eq(cmMatchResults.tournamentId, tournamentId), eq(cmMatchResults.playerId, challengerId), eq(cmMatchResults.comboNumber, comboNumber)));

      try {
        await db.insert(adminAuditLogs).values({ adminUserId: req.session.userId!, email: (user as any)?.email || '', action: 'user_delete_combo', tournamentId, playerId: challengerId, payload: { comboNumber, deleted: { blade: existing.blade, assistBlade: existing.assistBlade, ratchet: existing.ratchet, bit: existing.bit, lockChip: existing.lockChip } } } as any);
      } catch { }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || 'Richiesta non valida' });
    }
  });

  app.get('/api/challengermode/tournaments', async (req, res) => {
    try {
      const after = String(req.query.after || '2024-01-01T00:00:00Z');
      const nodes = await fetchTournamentsForGame(after);
      const rows = await db.execute(sql`SELECT DISTINCT tournament_id FROM cm_match_results`);
      const idSet = new Set<string>((rows.rows as any[]).map((r) => String(r.tournament_id || r.tournamentId)));
      const tournaments = (nodes as any[]).map((n) => ({ ...n, hasCombos: idSet.has(String(n.id)) }));
      res.json({ tournaments });
    } catch (error: any) {
      console.error('Error fetching Challengermode tournaments:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch external tournaments' });
    }
  });

  app.get('/api/challenger/participations', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const challengerId = (user as any)?.challengerId as string | undefined;
      if (!challengerId) return res.status(400).json({ error: 'Devi effettuare il login con Challengermode' });
      const accessToken = (req.session as any).cm_access_token as string | undefined;
      if (!accessToken) return res.status(400).json({ error: 'Sessione Challengermode non disponibile. Effettua nuovamente il login con Challengermode.' });

      const parts = await fetchUserParticipations(accessToken);
      const ids = Array.from(new Set(parts.map(p => p.tournamentId).filter(Boolean)));
      const rows = await db.execute(sql`SELECT DISTINCT tournament_id FROM cm_match_results`);
      const existingSet = new Set<string>((rows.rows as any[]).map(r => String(r.tournament_id || r.tournamentId)));

      const enriched = await Promise.all(ids.map(async (tid) => {
        try {
          const detail = await fetchTournamentDetail(tid);
          return { tournamentId: tid, name: detail?.name || null, state: detail?.state || null, date: detail?.schedule?.startedAt ? String(detail.schedule.startedAt).slice(0, 10) : null, hasCombos: existingSet.has(tid) };
        } catch { return { tournamentId: tid, name: null, state: null, date: null, hasCombos: existingSet.has(tid) }; }
      }));
      res.json({ participations: enriched });
    } catch (error: any) {
      console.error('Error fetching user participations:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch participations' });
    }
  });

  app.get('/api/me/tournaments', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const tournaments: any[] = [];

      if (user?.challengerId) {
        const cmTours = await db.execute(sql`SELECT tournament_id, MAX(data_torneo) AS date, MIN(piazzamento) AS best_placement, SUM(punti_guadagnati) AS total_points, COUNT(*) AS combo_count, 'challengermode' AS platform FROM cm_match_results WHERE player_id = ${user.challengerId} GROUP BY tournament_id`);
        const enrichedCM = await Promise.all((cmTours.rows || []).map(async (r: any) => {
          let name = null; let date = r.date ? String(r.date) : null;
          try { const detail = await fetchTournamentDetail(String(r.tournament_id)); name = detail?.name || null; if (!date && detail?.schedule?.startedAt) date = String(detail.schedule.startedAt).slice(0, 10); } catch { }
          return { tournamentId: String(r.tournament_id), date, name, bestPlacement: r.best_placement != null ? Number(r.best_placement) : null, totalPoints: Number(r.total_points || 0), comboCount: Number(r.combo_count || 0), platform: 'challengermode' };
        }));
        tournaments.push(...enrichedCM);
      }

      const challongeTours = await db.execute(sql`SELECT tournament_id, MAX(tournament_name) AS tournament_name, MIN(rank) AS best_placement, COUNT(*) AS combo_count, 'challonge' AS platform, MAX(created_at) AS date FROM challonge_reported_combos WHERE user_id = ${user?.id} GROUP BY tournament_id`);
      tournaments.push(...(challongeTours.rows || []).map((r: any) => ({ tournamentId: String(r.tournament_id), date: r.date ? String(r.date).slice(0, 10) : null, name: r.tournament_name ? String(r.tournament_name) : null, bestPlacement: r.best_placement != null ? Number(r.best_placement) : null, totalPoints: 0, comboCount: Number(r.combo_count || 0), platform: 'challonge' })));

      const deduped = new Map<string, typeof tournaments[0]>();
      for (const t of tournaments) {
        const existing = deduped.get(t.tournamentId);
        if (!existing) {
          deduped.set(t.tournamentId, t);
        } else {
          const preferNew = (!existing.name && t.name) ||
            (existing.name && t.name && (t.bestPlacement ?? 999) < (existing.bestPlacement ?? 999));
          if (preferNew) deduped.set(t.tournamentId, t);
        }
      }
      const uniqueTournaments = Array.from(deduped.values());

      uniqueTournaments.sort((a, b) => {
        const dA = a.date ? new Date(a.date).getTime() : 0;
        const dB = b.date ? new Date(b.date).getTime() : 0;
        return dB - dA;
      });
      res.json({ tournaments: uniqueTournaments.slice(0, 50) });
    } catch (error: any) {
      console.error('Error fetching my tournaments:', error);
      res.status(500).json({ error: error?.message || 'Failed to fetch tournaments' });
    }
  });

  app.post('/api/tournaments/:id/claim', requireAuth, async (req, res) => {
    try {
      const tournamentId = String(req.params.id || '').trim();
      const user = req.user!;
      if (!tournamentId) return res.status(400).json({ error: 'Missing tournament id' });

      if (!req.user!.isAdmin) {
        const existingCombosCheck = await db.select({ createdAt: challongeReportedCombos.createdAt })
          .from(challongeReportedCombos)
          .where(and(eq(challongeReportedCombos.tournamentId, tournamentId), eq(challongeReportedCombos.userId, user.id)))
          .orderBy(asc(challongeReportedCombos.createdAt))
          .limit(1);
        if (existingCombosCheck.length > 0) {
          const firstCreated = existingCombosCheck[0].createdAt;
          if (firstCreated && (Date.now() - new Date(firstCreated).getTime() > 172800000))
            return res.status(403).json({ error: 'Tempo per le modifiche scaduto (48 ore).' });
        }
      }

      const challongeRes = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId} LIMIT 1`);
      if (challongeRes.rows.length === 0) return res.status(404).json({ error: 'Tournament not found' });
      const data = challongeRes.rows[0].data as any;

      const normalize = (s: string) => s?.trim().toLowerCase() || '';
      let validUserNames: string[] = [];
      const aliasesResRaw = await db.select({ alias: userAliases.alias })
        .from(userAliases)
        .where(and(eq(userAliases.userId, user.id), eq(userAliases.isVerified, true)));
      validUserNames = aliasesResRaw.map((r: any) => r.alias);
      if (user.challongeUsername) validUserNames.push(user.challongeUsername);

      if (validUserNames.length === 0 && !req.user!.isAdmin)
        return res.status(403).json({ error: 'Per registrare combo su tornei Challonge devi collegare il tuo account Challonge.' });

      const standings = data.standings || [];
      const participant = standings.find((p: any) => {
        const pName = p.name || p.username || '';
        return validUserNames.some(v => normalize(v) === normalize(pName));
      });

      const possiblePlayerIds = new Set<string>();
      if (participant) {
        if (participant.name) possiblePlayerIds.add(participant.name);
        if (participant.username) possiblePlayerIds.add(participant.username);
        if (participant.id) possiblePlayerIds.add(String(participant.id));
        validUserNames.forEach(v => possiblePlayerIds.add(v));
      }

      if (!participant) return res.status(403).json({ error: 'Utente non trovato tra i partecipanti del torneo.' });
      if (participant.rank > 4) return res.status(403).json({ error: 'Solo i primi 4 classificati possono registrare le combo.' });

      let computedSeason: string | null = null;
      try {
        const tournamentDate = data.start_date || data.started_at || (data.tournament && data.tournament.started_at);
        if (tournamentDate) computedSeason = determineSeason(new Date(tournamentDate));
      } catch { }

      const combosRaw = Array.isArray(req.body?.combos) ? req.body.combos : [];
      const combos = combosRaw.slice(0, 3);

      const blades = combos.map((c: any) => c.blade?.trim()).filter((b: any) => b);
      if (new Set(blades.map((b: string) => b.toLowerCase())).size !== blades.length)
        return res.status(400).json({ error: 'Regola Deck Unico violata: Non puoi usare la stessa Blade più volte.' });

      const totalParticipants = data.total_players || data.participants_count || (data.tournament && data.tournament.participants_count) || 0;

      const existingCombosRows = await db.select({ blade: challongeReportedCombos.blade, assistBlade: challongeReportedCombos.assistBlade, ratchet: challongeReportedCombos.ratchet, bit: challongeReportedCombos.bit, lockChip: challongeReportedCombos.lockChip, rank: challongeReportedCombos.rank, season: challongeReportedCombos.season })
        .from(challongeReportedCombos)
        .where(and(eq(challongeReportedCombos.tournamentId, tournamentId), eq(challongeReportedCombos.userId, user.id)));

      if (possiblePlayerIds.size > 0) {
        const pIds = Array.from(possiblePlayerIds);
        const adminCombosRows = await db.select({ blade: externalPlayerCombos.blade, assistBlade: externalPlayerCombos.assistBlade, ratchet: externalPlayerCombos.ratchet, bit: externalPlayerCombos.bit, lockChip: externalPlayerCombos.lockChip, rank: externalPlayerCombos.placement, season: externalPlayerCombos.season })
          .from(externalPlayerCombos)
          .where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.platform, 'challonge'), inArray(externalPlayerCombos.playerId, pIds)));
        if (adminCombosRows.length > 0 && totalParticipants > 0) {
          for (const ac of adminCombosRows as any[]) {
            if (ac.season) {
              try { await revertExternalCombo({ blade: ac.blade, assistBlade: ac.assistBlade || 'None', ratchet: ac.ratchet, bit: ac.bit, lockChip: ac.lockChip || 'None', season: ac.season, placement: ac.rank, totalParticipants }); } catch { }
            }
          }
        }
        await db.delete(externalPlayerCombos).where(and(eq(externalPlayerCombos.tournamentId, tournamentId), eq(externalPlayerCombos.platform, 'challonge'), inArray(externalPlayerCombos.playerId, pIds)));
      }

      if (existingCombosRows.length > 0 && totalParticipants > 0) {
        for (const oldCombo of existingCombosRows as any[]) {
          if (oldCombo.season) {
            try { await revertExternalCombo({ blade: oldCombo.blade, assistBlade: oldCombo.assistBlade || 'None', ratchet: oldCombo.ratchet, bit: oldCombo.bit, lockChip: oldCombo.lockChip || 'None', season: oldCombo.season, placement: oldCombo.rank, totalParticipants }); } catch { }
          }
        }
      }

      await db.delete(challongeReportedCombos).where(and(eq(challongeReportedCombos.tournamentId, tournamentId), eq(challongeReportedCombos.userId, user.id)));

      for (let i = 0; i < combos.length; i++) {
        const c = combos[i];
        if (c.blade) {
          await db.insert(challongeReportedCombos).values({ tournamentId, userId: user.id, comboNumber: i + 1, rank: participant.rank, blade: c.blade, assistBlade: c.assistBlade || 'None', ratchet: c.ratchet, bit: c.bit, lockChip: c.lockChip || 'None', season: computedSeason } as any);
          if (computedSeason && totalParticipants > 0) {
            await processExternalCombo({ blade: c.blade, assistBlade: c.assistBlade || 'None', ratchet: c.ratchet, bit: c.bit, lockChip: c.lockChip || 'None', season: computedSeason, placement: participant.rank, totalParticipants });
          }
        }
      }

      try { await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`); } catch { await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`); }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error claiming Challonge combos:', error);
      res.status(500).json({ error: 'Failed to claim combos' });
    }
  });
}
