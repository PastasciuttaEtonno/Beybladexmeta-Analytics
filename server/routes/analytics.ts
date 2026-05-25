import type { Express } from "express";
import { db } from "../db";
import { unifiedMetaView } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { determineSeason } from "../lib/seasons";

export function registerAnalyticsRoutes(app: Express): void {
  app.get('/api/analytics/meta', async (req, res) => {
    try {
      const seasonRaw = String(req.query.season || '').trim();
      const seasonLower = seasonRaw.toLowerCase();
      const isAllTime = !seasonRaw || seasonLower === 'all' || seasonLower === 'all time' || seasonLower === 'all-time';
      const platform = String(req.query.platform || 'all').trim().toLowerCase();

      let query = db.select().from(unifiedMetaView);

      const conditions = [];
      if (platform && platform !== 'all') {
        conditions.push(eq(unifiedMetaView.platform, platform));
      }

      if (conditions.length > 0) {
        query = (query as any).where(and(...conditions));
      }

      const rows = await query;

      const topBlades: any = {};
      const topRatchets: any = {};
      const topBits: any = {};
      const topCombos: any = {};
      const countBlades: any = {};
      const countRatchets: any = {};
      const countBits: any = {};
      const countCombos: any = {};

      for (const row of rows) {
        const rank = row.rank as number;
        if (!rank || rank > 4) continue;

        if (!isAllTime && seasonRaw) {
          const d = row.date ? new Date(row.date) : null;
          if (!d || determineSeason(d) !== seasonRaw) continue;
        }

        let baseScore = 0;
        if (rank === 1) baseScore = 10;
        else if (rank === 2) baseScore = 7;
        else if (rank === 3) baseScore = 5;
        else if (rank === 4) baseScore = 3;

        const multiplier = (row.participantCount as number) || 0;
        const points = baseScore * multiplier;

        if (points === 0) continue;

        if (row.blade) {
          topBlades[row.blade] = (topBlades[row.blade] || 0) + points;
          countBlades[row.blade] = (countBlades[row.blade] || 0) + 1;
        }
        if (row.ratchet) {
          topRatchets[row.ratchet] = (topRatchets[row.ratchet] || 0) + points;
          countRatchets[row.ratchet] = (countRatchets[row.ratchet] || 0) + 1;
        }
        if (row.bit) {
          topBits[row.bit] = (topBits[row.bit] || 0) + points;
          countBits[row.bit] = (countBits[row.bit] || 0) + 1;
        }

        if (row.blade && row.ratchet && row.bit) {
          const assist = (row.assistBlade && row.assistBlade !== 'None') ? row.assistBlade : null;
          const chip = (row.lockChip && row.lockChip !== 'None') ? row.lockChip : null;
          let key = row.blade;
          if (assist) key += ` (${assist})`;
          key += ` ${row.ratchet} ${row.bit}`;
          if (chip) key += ` (${chip})`;

          topCombos[key] = (topCombos[key] || 0) + points;
          countCombos[key] = (countCombos[key] || 0) + 1;
        }
      }

      const formatList = (pointsMap: any, countsMap: any) =>
        Object.entries(pointsMap).map(([name, totalPoints]) => ({
          name,
          totalPoints: Number(totalPoints),
          count: countsMap[name] || 0
        })).sort((a, b) => b.totalPoints - a.totalPoints);

      res.json({
        topBlades: formatList(topBlades, countBlades),
        topRatchets: formatList(topRatchets, countRatchets),
        topBits: formatList(topBits, countBits),
        topCombos: formatList(topCombos, countCombos),
      });
    } catch (error) {
      console.error('Analytics Meta Error:', error);
      res.status(500).json({ error: 'Failed to fetch analytics meta' });
    }
  });

  app.get("/api/trends", async (req, res) => {
    try {
      const metricParam = String((req.query.metric || 'points')).toLowerCase();
      const granularityParam = String((req.query.granularity || 'month')).toLowerCase();
      const metric = metricParam === 'count' ? 'count' : 'points';
      const granularity = granularityParam === 'week' ? 'week' : 'month';
      const seasonRaw = String(req.query.season || '').trim();

      let seasonFilter = sql``;
      if (seasonRaw === 'Season 2026') {
        seasonFilter = sql` AND cm.data_torneo >= '2026-02-01'`;
      } else if (seasonRaw === 'Off Season 2025') {
        seasonFilter = sql` AND cm.data_torneo >= '2025-10-01' AND cm.data_torneo <= '2026-01-31'`;
      } else if (seasonRaw === 'Season 2025') {
        seasonFilter = sql` AND cm.data_torneo >= '2025-01-01' AND cm.data_torneo < '2025-10-01'`;
      }

      let query;

      if (granularity === 'month' && metric === 'points') {
        query = sql`
          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(cm.data_torneo, 'YYYY-MM-01') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.bit
        `;
      } else if (granularity === 'week' && metric === 'points') {
        query = sql`
          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'blade' AS component_type,
            cm.blade AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.blade

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'ratchet' AS component_type,
            cm.ratchet AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.ratchet

          UNION ALL

          SELECT
            to_char(date_trunc('week', cm.data_torneo), 'YYYY-MM-DD') AS month,
            'bit' AS component_type,
            cm.bit AS name,
            SUM(cm.punti_guadagnati) AS total_points
          FROM cm_match_results cm
          WHERE 1=1 ${seasonFilter}
          GROUP BY month, cm.bit
        `;
      } else if (granularity === 'month' && metric === 'count') {
        let externalSeasonFilter = sql``;
        if (seasonRaw === 'Season 2026') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2026-02-01'`;
        } else if (seasonRaw === 'Off Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-10-01' AND epc.tournament_date <= '2026-01-31'`;
        } else if (seasonRaw === 'Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-01-01' AND epc.tournament_date < '2025-10-01'`;
        }

        query = sql`
          WITH combined_data AS (
            SELECT data_torneo as date, blade, ratchet, bit
            FROM cm_match_results cm
            WHERE 1=1 ${seasonFilter}

            UNION ALL

            SELECT tournament_date as date, blade, ratchet, bit
            FROM external_player_combos epc
            WHERE 1=1 ${externalSeasonFilter}
          )
          SELECT
            to_char(date, 'YYYY-MM-01') AS month,
            'blade' AS component_type,
            blade AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY month, blade

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-01') AS month,
            'ratchet' AS component_type,
            ratchet AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY month, ratchet

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-01') AS month,
            'bit' AS component_type,
            bit AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY month, bit
        `;
      } else {
        let externalSeasonFilter = sql``;
        if (seasonRaw === 'Season 2026') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2026-02-01'`;
        } else if (seasonRaw === 'Off Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-10-01' AND epc.tournament_date <= '2026-01-31'`;
        } else if (seasonRaw === 'Season 2025') {
          externalSeasonFilter = sql` AND epc.tournament_date >= '2025-01-01' AND epc.tournament_date < '2025-10-01'`;
        }

        query = sql`
          WITH combined_data AS (
            SELECT data_torneo as date, blade, ratchet, bit
            FROM cm_match_results cm
            WHERE 1=1 ${seasonFilter}

            UNION ALL

            SELECT tournament_date as date, blade, ratchet, bit
            FROM external_player_combos epc
            WHERE 1=1 ${externalSeasonFilter}
          )
          SELECT
            to_char(date, 'YYYY-MM-DD') AS month,
            'blade' AS component_type,
            blade AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY date, blade

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-DD') AS month,
            'ratchet' AS component_type,
            ratchet AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY date, ratchet

          UNION ALL

          SELECT
            to_char(date, 'YYYY-MM-DD') AS month,
            'bit' AS component_type,
            bit AS name,
            COUNT(*) AS total_points
          FROM combined_data
          GROUP BY date, bit
        `;
      }

      const trendData = await db.execute(query);
      res.json(trendData.rows);
    } catch (error) {
      console.error("Error fetching trend data:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get('/api/synergy', async (req, res) => {
    try {
      const typeRaw = String(req.query.type || '').toLowerCase();
      const nameRaw = String(req.query.name || '').trim();

      const allowedTypes = ['blade', 'ratchet', 'bit', 'assist-blade', 'lock-chip'];
      if (!allowedTypes.includes(typeRaw)) {
        return res.status(400).json({ error: 'Invalid type. Use blade, ratchet, bit, assist-blade, or lock-chip.' });
      }
      if (!nameRaw) {
        return res.status(400).json({ error: 'Missing name parameter' });
      }

      const typeColumnMap: Record<string, string> = {
        'blade': 'blade',
        'ratchet': 'ratchet',
        'bit': 'bit',
        'assist-blade': 'assist_blade',
        'lock-chip': 'lock_chip',
      };

      const selectedCol = typeColumnMap[typeRaw];
      const limit = 5;

      const runTopQuery = async (groupCol: string, excludeNone: boolean) => {
        const noneFilter = excludeNone ? sql`AND ${sql.raw(groupCol)} <> 'None'` : sql``;
        const query = sql`
          SELECT ${sql.raw(groupCol)} AS name, SUM(punteggio_totale) AS points
          FROM combo_stats
          WHERE ${sql.raw(selectedCol)} = ${nameRaw}
          ${noneFilter}
          GROUP BY ${sql.raw(groupCol)}
          ORDER BY points DESC
          LIMIT ${limit}
        `;
        const result = await db.execute(query);
        return (result.rows as any[]).map(r => ({ name: r.name, points: Number(r.points) }));
      };

      let response: any = {};
      if (typeRaw === 'blade') {
        response.topAssistBlades = await runTopQuery('assist_blade', true);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topBits = await runTopQuery('bit', false);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'ratchet') {
        response.topBlades = await runTopQuery('blade', false);
        response.topBits = await runTopQuery('bit', false);
        response.topAssistBlades = await runTopQuery('assist_blade', true);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'bit') {
        response.topBlades = await runTopQuery('blade', false);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topAssistBlades = await runTopQuery('assist_blade', true);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'assist-blade') {
        response.topBlades = await runTopQuery('blade', false);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topBits = await runTopQuery('bit', false);
        response.topLockChips = await runTopQuery('lock_chip', true);
      } else if (typeRaw === 'lock-chip') {
        response.topBlades = await runTopQuery('blade', false);
        response.topRatchets = await runTopQuery('ratchet', false);
        response.topBits = await runTopQuery('bit', false);
        response.topAssistBlades = await runTopQuery('assist_blade', true);
      }

      res.json(response);
    } catch (error) {
      console.error('Error fetching synergy data:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}
