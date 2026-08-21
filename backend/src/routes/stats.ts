import type { Express } from "express";
import { db } from "../db";
import {
  comboStats, bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats,
  externalPlayerCombos, cmPlayers, unifiedMetaView,
} from "@shared/schema";
import { desc, asc, or, ilike, sql, eq, and } from "drizzle-orm";
import { fetchTournamentDetail } from "../challengermode";
import { calculateChallongePoints } from "../lib/challongePoints";
import { determineSeason } from "../lib/seasons";

export function registerStatsRoutes(app: Express): void {
  app.get('/api/stats/combos', async (req, res) => {
    try {
      const pageParam = req.query.page ? parseInt(req.query.page as string) : 1;
      const page = Number.isFinite(pageParam) ? Math.max(1, pageParam) : 1;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 20;
      const offset = (page - 1) * limit;

      const search = req.query.search as string | undefined;
      const sortByParam = (req.query.sortBy as string) || 'score';
      const sortOrder = (req.query.sortOrder as string) || 'desc';
      const seasonRaw = String(req.query.season || '').trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';

      const validSortFields = ['score', 'first', 'second', 'third', 'fourth'];
      const sortBy = validSortFields.includes(sortByParam) ? sortByParam : 'score';

      const buildSearchWhere = () => {
        if (search && search.trim()) {
          const searchTerm = `%${search.trim()}%`;
          return or(
            ilike(comboStats.blade, searchTerm),
            ilike(comboStats.assistBlade, searchTerm),
            ilike(comboStats.ratchet, searchTerm),
            ilike(comboStats.bit, searchTerm),
            ilike(comboStats.lockChip, searchTerm)
          );
        }
        return null;
      };

      if (isAllTime || !seasonRaw) {
        const sumScore = sql<number>`sum(${comboStats.punteggioTotale})`.mapWith(Number);
        const sumFirst = sql<number>`sum(${comboStats.primiPosti})`.mapWith(Number);
        const sumSecond = sql<number>`sum(${comboStats.secondiPosti})`.mapWith(Number);
        const sumThird = sql<number>`sum(${comboStats.terziPosti})`.mapWith(Number);
        const sumFourth = sql<number>`sum(${comboStats.quartiPosti})`.mapWith(Number);

        let aggQuery = db.select({
          blade: comboStats.blade,
          assistBlade: comboStats.assistBlade,
          ratchet: comboStats.ratchet,
          bit: comboStats.bit,
          lockChip: comboStats.lockChip,
          punteggioTotale: sumScore,
          primiPosti: sumFirst,
          secondiPosti: sumSecond,
          terziPosti: sumThird,
          quartiPosti: sumFourth,
        }).from(comboStats);

        const whereClause = buildSearchWhere();
        if (whereClause) aggQuery = (aggQuery as any).where(whereClause);

        aggQuery = aggQuery.groupBy(
          comboStats.blade, comboStats.assistBlade, comboStats.ratchet,
          comboStats.bit, comboStats.lockChip,
        );

        const orderFn = sortOrder === 'asc' ? asc : desc;
        const sortExpr = {
          score: sql`sum(${comboStats.punteggioTotale})`,
          first: sql`sum(${comboStats.primiPosti})`,
          second: sql`sum(${comboStats.secondiPosti})`,
          third: sql`sum(${comboStats.terziPosti})`,
          fourth: sql`sum(${comboStats.quartiPosti})`,
        }[sortBy]!;

        const [topCombos, countResult] = await Promise.all([
          (aggQuery as any).orderBy(orderFn(sortExpr)).limit(limit).offset(offset),
          db.execute(sql`
            SELECT COUNT(*) AS c
            FROM (
              SELECT 1 FROM combo_stats
              ${search && search.trim()
              ? sql`WHERE blade ILIKE ${'%' + search.trim() + '%'}
                       OR assist_blade ILIKE ${'%' + search.trim() + '%'}
                       OR ratchet ILIKE ${'%' + search.trim() + '%'}
                       OR bit ILIKE ${'%' + search.trim() + '%'}
                       OR lock_chip ILIKE ${'%' + search.trim() + '%'}`
              : sql``}
              GROUP BY blade, assist_blade, ratchet, bit, lock_chip
            ) t
          `),
        ]);

        const total = Number(((countResult.rows as any[])[0]?.c) || 0);
        return res.json({ combos: topCombos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
      }

      let query = db.select().from(comboStats);
      let countQuery = db.select({ count: sql<number>`count(*)` }).from(comboStats);

      // ONE where() per builder. Calling it twice does not add a condition —
      // Drizzle keeps only the last, so the previous version silently dropped
      // the search whenever a season was also chosen, returning every combo in
      // the season instead of the matching ones.
      const searchClause = buildSearchWhere();
      const seasonClause = eq(comboStats.season, seasonRaw);
      const combined = searchClause ? and(searchClause, seasonClause) : seasonClause;

      query = (query as any).where(combined);
      countQuery = (countQuery as any).where(combined);

      const sortColumn = {
        score: comboStats.punteggioTotale,
        first: comboStats.primiPosti,
        second: comboStats.secondiPosti,
        third: comboStats.terziPosti,
        fourth: comboStats.quartiPosti,
        date: comboStats.dataCreazione,
      }[sortBy];

      const orderFn = sortOrder === 'asc' ? asc : desc;
      const [topCombos, countResult] = await Promise.all([
        query.orderBy(orderFn(sortColumn!), desc(comboStats.dataCreazione)).limit(limit).offset(offset),
        countQuery
      ]);

      const total = Number(countResult[0]?.count || 0);
      res.json({ combos: topCombos, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch combo stats' });
    }
  });

  app.get('/api/stats/combos/by-key', async (req, res) => {
    try {
      const key = String(req.query.key || '').trim();
      if (!key) return res.status(400).json({ error: 'Missing key' });

      let combo: any = null;
      let rank = 0;

      if (key.includes('|')) {
        const parts = key.split('|');
        if (parts.length === 5) {
          const [blade, assistBlade, ratchet, bit, lockChip] = parts;
          const result = await db.execute(sql`
            WITH ranked AS (
              SELECT blade, assist_blade, ratchet, bit, lock_chip,
                     primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale, data_creazione,
                     ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank
              FROM combo_stats
            )
            SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
                   primi_posti AS "primiPosti", secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti", quarti_posti AS "quartiPosti",
                   punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione", rank
            FROM ranked
            WHERE blade = ${blade} AND assist_blade = ${assistBlade}
              AND ratchet = ${ratchet} AND bit = ${bit} AND lock_chip = ${lockChip}
            LIMIT 1
          `);
          if (result.rows.length > 0) {
            combo = (result.rows as any[])[0];
            rank = Number(combo.rank);
          }
        }
      }

      if (!combo) {
        const allCombos = await db.execute(sql`
          SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
                 primi_posti AS "primiPosti", secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti", quarti_posti AS "quartiPosti",
                 punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione"
          FROM combo_stats ORDER BY punteggio_totale DESC, data_creazione DESC
        `);
        const toSlug = (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const targetIndex = (allCombos.rows as any[]).findIndex((c: any) => {
          const parts = [
            (c.lockChip || '').toLowerCase() !== 'none' ? c.lockChip : '',
            c.blade,
            (c.assistBlade || '').toLowerCase() !== 'none' ? c.assistBlade : '',
            (c.ratchet || '').toLowerCase() !== 'none' ? c.ratchet : '',
            c.bit
          ].filter(Boolean).map(toSlug);
          return parts.join('-') === key;
        });
        if (targetIndex !== -1) {
          combo = (allCombos.rows as any[])[targetIndex];
          rank = targetIndex + 1;
        }
      }

      if (!combo) return res.status(404).json({ error: 'Combo not found' });

      return res.json({
        combo: {
          blade: combo.blade, assistBlade: combo.assistBlade, ratchet: combo.ratchet,
          bit: combo.bit, lockChip: combo.lockChip, primiPosti: combo.primiPosti,
          secondiPosti: combo.secondiPosti, terziPosti: combo.terziPosti,
          quartiPosti: combo.quartiPosti, punteggioTotale: combo.punteggioTotale, dataCreazione: combo.dataCreazione,
        },
        rank
      });
    } catch (error) {
      console.error('Error fetching combo by key:', error);
      res.status(500).json({ error: 'Failed to fetch combo by key' });
    }
  });

  app.get('/api/stats/combos/by-slug', async (req, res) => {
    try {
      const slug = String(req.query.slug || '').trim();
      if (!slug) return res.status(400).json({ error: 'Missing slug' });
      const result = await db.execute(sql`
        WITH ranked AS (
          SELECT blade, assist_blade, ratchet, bit, lock_chip,
                 primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale, data_creazione,
                 ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank
          FROM combo_stats
        )
        SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
               primi_posti AS "primiPosti", secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti", quarti_posti AS "quartiPosti",
               punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione", rank
        FROM ranked
        WHERE concat_ws('-',
          CASE WHEN lower(lock_chip) <> 'none' THEN regexp_replace(regexp_replace(lower(trim(lock_chip)), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g') END,
          regexp_replace(regexp_replace(lower(trim(blade)), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g'),
          CASE WHEN lower(assist_blade) <> 'none' THEN regexp_replace(regexp_replace(lower(trim(assist_blade)), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g') END,
          CASE WHEN lower(ratchet) <> 'none' THEN regexp_replace(regexp_replace(lower(trim(ratchet)), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g') END,
          regexp_replace(regexp_replace(lower(trim(bit)), '\\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')
        ) = ${slug}
        LIMIT 1
      `);
      const row = (result.rows as any[])[0];
      if (!row) return res.status(404).json({ error: 'Combo not found' });
      return res.json({
        combo: {
          blade: row.blade, assistBlade: row.assistBlade, ratchet: row.ratchet, bit: row.bit, lockChip: row.lockChip,
          primiPosti: row.primiPosti, secondiPosti: row.secondiPosti, terziPosti: row.terziPosti,
          quartiPosti: row.quartiPosti, punteggioTotale: row.punteggioTotale, dataCreazione: row.dataCreazione,
        },
        rank: Number(row.rank)
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch combo by slug' });
    }
  });

  app.get('/api/stats/combos/:comboKey/tournaments', async (req, res) => {
    try {
      const key = String(req.params.comboKey || '').trim();
      if (!key) return res.status(400).json({ error: 'Missing combo key' });

      const parts = key.split('|');
      if (parts.length !== 5) return res.status(400).json({ error: 'Invalid key format' });
      const [blade, assistBlade, ratchet, bit, lockChip] = parts;

      const seasonRaw = String((req.query.season ?? '') as string).trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = !seasonRaw || seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 200;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 200;

      const tournaments: any[] = [];

      const cmQuery = !isAllTime && seasonRaw
        ? sql`
          SELECT epc.tournament_id, epc.player_id, cm.nickname as player_name,
                 epc.placement, epc.total_participants, epc.tournament_date as date, epc.season, 'challengermode' as platform
          FROM external_player_combos epc
          JOIN cm_players cm ON epc.player_id = cm.id
          WHERE epc.blade = ${blade} AND epc.assist_blade = ${assistBlade} AND epc.ratchet = ${ratchet}
            AND epc.bit = ${bit} AND epc.lock_chip = ${lockChip} AND epc.placement <= 4 AND epc.season = ${seasonRaw}
          ORDER BY epc.tournament_date DESC LIMIT ${limit}
        `
        : sql`
          SELECT epc.tournament_id, epc.player_id, cm.nickname as player_name,
                 epc.placement, epc.total_participants, epc.tournament_date as date, epc.season, 'challengermode' as platform
          FROM external_player_combos epc
          JOIN cm_players cm ON epc.player_id = cm.id
          WHERE epc.blade = ${blade} AND epc.assist_blade = ${assistBlade} AND epc.ratchet = ${ratchet}
            AND epc.bit = ${bit} AND epc.lock_chip = ${lockChip} AND epc.placement <= 4
          ORDER BY epc.tournament_date DESC LIMIT ${limit}
        `;

      const cmResults = await db.execute(cmQuery);

      const cmTournaments = await Promise.all((cmResults.rows || []).map(async (r: any) => {
        try {
          const detail = await fetchTournamentDetail(String(r.tournament_id));
          const name = detail?.name || null;
          const startedAt = detail?.schedule?.startedAt as string | undefined;
          const dateFromDetail = startedAt ? String(startedAt).slice(0, 10) : null;
          const points = (r.placement && r.total_participants)
            ? Number(r.placement) * Number(r.total_participants) : 0;
          return {
            tournamentId: String(r.tournament_id),
            tournamentName: name || `Tournament ${r.tournament_id}`,
            date: r.date ? String(r.date) : dateFromDetail,
            playerName: r.player_name, playerId: r.player_id,
            placement: r.placement != null ? Number(r.placement) : null,
            totalParticipants: Number(r.total_participants || 0),
            points, platform: 'challengermode', season: r.season || 'Unknown',
          };
        } catch {
          const points = (r.placement && r.total_participants)
            ? Number(r.placement) * Number(r.total_participants) : 0;
          return {
            tournamentId: String(r.tournament_id),
            tournamentName: `Tournament ${r.tournament_id}`,
            date: r.date ? String(r.date) : null,
            playerName: r.player_name, playerId: r.player_id,
            placement: r.placement != null ? Number(r.placement) : null,
            totalParticipants: Number(r.total_participants || 0),
            points, platform: 'challengermode', season: r.season || 'Unknown',
          };
        }
      }));
      tournaments.push(...cmTournaments);

      const challongeQuery = !isAllTime && seasonRaw
        ? sql`
          SELECT crc.tournament_id,
            COALESCE(crc.tournament_name, mr.data->>'tournament_name', mr.data->>'name', mr.data->'tournament'->>'name') as tournament_name,
            crc.created_at as date, u.display_name as player_name, u.id as player_id, crc.rank as placement, crc.season, 'challonge' as platform,
            COALESCE(NULLIF((mr.data->>'participants_count')::int, 0), NULLIF((mr.data->>'total_players')::int, 0), jsonb_array_length(mr.data->'standings')) as total_participants
          FROM challonge_reported_combos crc
          JOIN users u ON crc.user_id = u.id
          LEFT JOIN challonge_match_results mr ON crc.tournament_id = mr.tournament_id
          WHERE crc.blade = ${blade} AND COALESCE(crc.assist_blade, 'None') = ${assistBlade}
            AND crc.ratchet = ${ratchet} AND crc.bit = ${bit} AND COALESCE(crc.lock_chip, 'None') = ${lockChip}
            AND crc.rank <= 4 AND crc.season = ${seasonRaw}
          ORDER BY crc.created_at DESC LIMIT ${limit}
        `
        : sql`
          SELECT crc.tournament_id,
            COALESCE(crc.tournament_name, mr.data->>'tournament_name', mr.data->>'name', mr.data->'tournament'->>'name') as tournament_name,
            crc.created_at as date, u.display_name as player_name, u.id as player_id, crc.rank as placement, crc.season, 'challonge' as platform,
            COALESCE(NULLIF((mr.data->>'participants_count')::int, 0), NULLIF((mr.data->>'total_players')::int, 0), jsonb_array_length(mr.data->'standings')) as total_participants
          FROM challonge_reported_combos crc
          JOIN users u ON crc.user_id = u.id
          LEFT JOIN challonge_match_results mr ON crc.tournament_id = mr.tournament_id
          WHERE crc.blade = ${blade} AND COALESCE(crc.assist_blade, 'None') = ${assistBlade}
            AND crc.ratchet = ${ratchet} AND crc.bit = ${bit} AND COALESCE(crc.lock_chip, 'None') = ${lockChip}
            AND crc.rank <= 4
          ORDER BY crc.created_at DESC LIMIT ${limit}
        `;

      const challongeResults = await db.execute(challongeQuery);
      const challongeTournaments = (challongeResults.rows || []).map((r: any) => ({
        tournamentId: String(r.tournament_id),
        tournamentName: r.tournament_name ? String(r.tournament_name) : `Tournament ${r.tournament_id}`,
        date: r.date ? String(r.date).slice(0, 10) : null,
        playerName: r.player_name || 'Unknown', playerId: r.player_id,
        placement: r.placement != null ? Number(r.placement) : null,
        totalParticipants: Number(r.total_participants || 0),
        points: calculateChallongePoints(Number(r.placement), Number(r.total_participants)),
        platform: 'challonge', season: r.season || 'Unknown',
      }));
      tournaments.push(...challongeTournaments);

      tournaments.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      res.json({ tournaments: tournaments.slice(0, limit) });
    } catch (error) {
      console.error('Combo tournaments error:', error);
      res.status(500).json({ error: 'Failed to fetch combo tournaments' });
    }
  });

  app.get('/api/stats/top/components', async (req, res) => {
    try {
      const seasonRaw = String(req.query.season || '').trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';
      const targetSeason = seasonRaw || 'Off Season 2025';
      const result = await db.execute(
        isAllTime
          ? sql`
            SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
            FROM (
              SELECT component_type, name, SUM(primi_posti) AS primi_posti, SUM(secondi_posti) AS secondi_posti,
                     SUM(terzi_posti) AS terzi_posti, SUM(punteggio_totale) AS punteggio_totale,
                     ROW_NUMBER() OVER (PARTITION BY component_type ORDER BY SUM(primi_posti) DESC, SUM(punteggio_totale) DESC, name ASC) AS rn
              FROM top_component_snapshot GROUP BY component_type, name
            ) t WHERE rn = 1
          `
          : sql`
            SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
            FROM (
              SELECT component_type, name, primi_posti, secondi_posti, terzi_posti, punteggio_totale,
                     ROW_NUMBER() OVER (PARTITION BY component_type ORDER BY primi_posti DESC, punteggio_totale DESC, name ASC) AS rn
              FROM top_component_snapshot WHERE season = ${targetSeason}
            ) t WHERE rn = 1
          `
      );
      const topComponents: any = {};
      for (const row of result.rows as any[]) {
        topComponents[row.component_type] = {
          [row.component_type]: row.name,
          primiPosti: row.primi_posti, secondiPosti: row.secondi_posti,
          terziPosti: row.terzi_posti, punteggioTotale: row.punteggio_totale,
        };
      }
      res.json(topComponents);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top components' });
    }
  });

  app.get('/api/stats/top/blade', async (req, res) => {
    try {
      const topBlade = await db.select().from(bladeStats).orderBy(desc(bladeStats.punteggioTotale)).limit(1);
      res.json({ blade: topBlade[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top blade' });
    }
  });

  app.get('/api/stats/top/ratchet', async (req, res) => {
    try {
      const topRatchet = await db.select().from(ratchetStats).orderBy(desc(ratchetStats.punteggioTotale)).limit(1);
      res.json({ ratchet: topRatchet[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top ratchet' });
    }
  });

  app.get('/api/stats/top/bit', async (req, res) => {
    try {
      const topBit = await db.select().from(bitStats).orderBy(desc(bitStats.punteggioTotale)).limit(1);
      res.json({ bit: topBit[0] || null });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch top bit' });
    }
  });

  app.get('/api/stats/leaderboard/:type', async (req, res) => {
    try {
      const type = String(req.params.type || '').toLowerCase();
      const limitParam = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 50)) : 10;
      const season = req.query.season as string | undefined;
      const isAllTime = !season || season.toLowerCase() === 'all time' || season.toLowerCase() === 'all-time';

      let rows: any[] = [];

      if (type === 'blade') {
        rows = isAllTime
          ? await db.select({
            blade: bladeStats.blade,
            punteggioTotale: sql<number>`sum(${bladeStats.punteggioTotale})`.as('punteggioTotale'),
            primiPosti: sql<number>`sum(${bladeStats.primiPosti})`.as('primiPosti'),
            secondiPosti: sql<number>`sum(${bladeStats.secondiPosti})`.as('secondiPosti'),
            terziPosti: sql<number>`sum(${bladeStats.terziPosti})`.as('terziPosti'),
            quartiPosti: sql<number>`sum(${bladeStats.quartiPosti})`.as('quartiPosti'),
          }).from(bladeStats).groupBy(bladeStats.blade).orderBy(desc(sql`sum(${bladeStats.punteggioTotale})`)).limit(limit)
          : await db.select({
            blade: bladeStats.blade, punteggioTotale: bladeStats.punteggioTotale,
            primiPosti: bladeStats.primiPosti, secondiPosti: bladeStats.secondiPosti,
            terziPosti: bladeStats.terziPosti, quartiPosti: bladeStats.quartiPosti,
          }).from(bladeStats).where(eq(bladeStats.season, season!)).orderBy(desc(bladeStats.punteggioTotale)).limit(limit);
      } else if (type === 'ratchet') {
        rows = isAllTime
          ? await db.select({
            ratchet: ratchetStats.ratchet,
            punteggioTotale: sql<number>`sum(${ratchetStats.punteggioTotale})`.as('punteggioTotale'),
            primiPosti: sql<number>`sum(${ratchetStats.primiPosti})`.as('primiPosti'),
            secondiPosti: sql<number>`sum(${ratchetStats.secondiPosti})`.as('secondiPosti'),
            terziPosti: sql<number>`sum(${ratchetStats.terziPosti})`.as('terziPosti'),
            quartiPosti: sql<number>`sum(${ratchetStats.quartiPosti})`.as('quartiPosti'),
          }).from(ratchetStats).groupBy(ratchetStats.ratchet).orderBy(desc(sql`sum(${ratchetStats.punteggioTotale})`)).limit(limit)
          : await db.select({
            ratchet: ratchetStats.ratchet, punteggioTotale: ratchetStats.punteggioTotale,
            primiPosti: ratchetStats.primiPosti, secondiPosti: ratchetStats.secondiPosti,
            terziPosti: ratchetStats.terziPosti, quartiPosti: ratchetStats.quartiPosti,
          }).from(ratchetStats).where(eq(ratchetStats.season, season!)).orderBy(desc(ratchetStats.punteggioTotale)).limit(limit);
      } else if (type === 'bit') {
        rows = isAllTime
          ? await db.select({
            bit: bitStats.bit,
            punteggioTotale: sql<number>`sum(${bitStats.punteggioTotale})`.as('punteggioTotale'),
            primiPosti: sql<number>`sum(${bitStats.primiPosti})`.as('primiPosti'),
            secondiPosti: sql<number>`sum(${bitStats.secondiPosti})`.as('secondiPosti'),
            terziPosti: sql<number>`sum(${bitStats.terziPosti})`.as('terziPosti'),
            quartiPosti: sql<number>`sum(${bitStats.quartiPosti})`.as('quartiPosti'),
          }).from(bitStats).groupBy(bitStats.bit).orderBy(desc(sql`sum(${bitStats.punteggioTotale})`)).limit(limit)
          : await db.select({
            bit: bitStats.bit, punteggioTotale: bitStats.punteggioTotale,
            primiPosti: bitStats.primiPosti, secondiPosti: bitStats.secondiPosti,
            terziPosti: bitStats.terziPosti, quartiPosti: bitStats.quartiPosti,
          }).from(bitStats).where(eq(bitStats.season, season!)).orderBy(desc(bitStats.punteggioTotale)).limit(limit);
      } else {
        return res.status(400).json({ error: 'Invalid type. Use blade, ratchet, or bit.' });
      }

      res.json({ items: rows, type, limit, season: season || 'All Time' });
    } catch (error) {
      console.error('Leaderboard error:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  app.get('/api/components', async (req, res) => {
    try {
      const [blades, assistBlades, ratchets, bits, lockChips] = await Promise.all([
        db.select({ name: bladeStats.blade }).from(bladeStats).groupBy(bladeStats.blade).orderBy(asc(bladeStats.blade)),
        db.select({ name: assistBladeStats.assistBlade }).from(assistBladeStats).groupBy(assistBladeStats.assistBlade).orderBy(asc(assistBladeStats.assistBlade)),
        db.select({ name: ratchetStats.ratchet }).from(ratchetStats).groupBy(ratchetStats.ratchet).orderBy(asc(ratchetStats.ratchet)),
        db.select({ name: bitStats.bit, isRatchetLess: bitStats.isRatchetLess }).from(bitStats).groupBy(bitStats.bit, bitStats.isRatchetLess).orderBy(asc(bitStats.bit)),
        db.select({ name: lockChipStats.lockChip }).from(lockChipStats).groupBy(lockChipStats.lockChip).orderBy(asc(lockChipStats.lockChip)),
      ]);
      res.json({
        blades: blades.map((b: any) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        assistBlades: assistBlades.map((b: any) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        ratchets: ratchets.map((b: any) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
        bits: bits.filter((b: any) => b.name && b.name.toUpperCase() !== 'NONE' && b.name !== '-').map((b: any) => ({ name: b.name, isRatchetLess: !!b.isRatchetLess })),
        lockChips: lockChips.map((b: any) => b.name).filter((n: string) => n && n.toUpperCase() !== 'NONE' && n !== '-'),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch components' });
    }
  });

  app.get('/api/seasons', async (_req, res) => {
    try {
      const seasonsSet = new Set<string>();
      const tables = ['player_regional_stats', 'combo_stats', 'blade_stats', 'ratchet_stats', 'bit_stats'];
      for (const table of tables) {
        try {
          const r = await db.execute(sql`SELECT DISTINCT season FROM ${sql.raw(table)}`);
          for (const row of r.rows as any[]) { const s = String(row.season || '').trim(); if (s) seasonsSet.add(s); }
        } catch { }
      }
      try {
        const hasSeason = await db.execute(sql`
          SELECT EXISTS(SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'top_component_snapshot' AND column_name = 'season') AS has_season
        `);
        if (Boolean((hasSeason.rows[0] as any)?.has_season)) {
          const r = await db.execute(sql`SELECT DISTINCT season FROM top_component_snapshot`);
          for (const row of r.rows as any[]) { const s = String((row as any).season || '').trim(); if (s) seasonsSet.add(s); }
        }
      } catch { }
      const result = ['Season 2026', 'All Time', 'Off Season 2025'];
      for (const s of Array.from(seasonsSet)) {
        if (!result.includes(s)) result.push(s);
      }
      res.json({ seasons: result });
    } catch (error: any) {
      console.error('Error fetching seasons:', error?.message || error);
      res.status(500).json({ error: error?.message || 'Failed to fetch seasons' });
    }
  });
}
