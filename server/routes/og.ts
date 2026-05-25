import type { Express } from "express";
import fs from "fs";
import path from "path";
import { db } from "../db";
import { comboStats, playerLeaderboardView } from "@shared/schema";
import { desc, sql } from "drizzle-orm";
import { fetchTournamentsForGame, fetchTournamentDetail } from "../challengermode";
import { generateComboImage } from "../og-image";

export function registerOgRoutes(app: Express): void {
  // SPA OG tag injection for social sharing previews
  app.get('/combo/:id', async (req, res, next) => {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      const publicPath = isProduction
        ? path.resolve(process.cwd(), 'dist', 'public')
        : path.resolve(process.cwd(), 'client');

      const indexPath = path.join(publicPath, 'index.html');
      if (!fs.existsSync(indexPath)) return next();

      let html = await fs.promises.readFile(indexPath, 'utf-8');
      const comboId = req.params.id;
      const ogImageUrl = `https://beybladexmeta.com/api/og/combo/${comboId}`;

      html = html.replace(
        /<meta property="og:image" content="[^"]*"\s*\/?>/g,
        `<meta property="og:image" content="${ogImageUrl}" />`
      );
      html = html.replace(
        /<meta name="twitter:image" content="[^"]*"\s*\/?>/g,
        `<meta name="twitter:image" content="${ogImageUrl}" />`
      );

      res.send(html);
    } catch (error) {
      console.error('Error injecting OG tags:', error);
      next();
    }
  });

  app.get('/api/og/combo/:key', async (req, res) => {
    try {
      const key = req.params.key;
      let target: any = null;
      let rank = 0;

      // Strategy 1: Pipe separator (internal links)
      if (key.includes('|')) {
        const parts = key.split('|');
        if (parts.length === 5) {
          const [blade, assistBlade, ratchet, bit, lockChip] = parts;
          const result = await db.execute(sql`
            WITH ranked AS (
              SELECT blade, assist_blade AS "assistBlade", ratchet, bit, lock_chip AS "lockChip",
                     primi_posti AS "primiPosti", secondi_posti AS "secondiPosti", terzi_posti AS "terziPosti", quarti_posti AS "quartiPosti",
                     punteggio_totale AS "punteggioTotale", data_creazione AS "dataCreazione",
                     ROW_NUMBER() OVER (ORDER BY punteggio_totale DESC, data_creazione DESC) AS rank
              FROM combo_stats
            )
            SELECT * FROM ranked
            WHERE blade = ${blade}
              AND "assistBlade" = ${assistBlade}
              AND ratchet = ${ratchet}
              AND bit = ${bit}
              AND "lockChip" = ${lockChip}
            LIMIT 1
          `);
          if (result.rows.length > 0) {
            const row = (result.rows as any[])[0];
            target = {
              blade: row.blade, assistBlade: row.assistBlade, ratchet: row.ratchet,
              bit: row.bit, lockChip: row.lockChip, punteggioTotale: row.punteggioTotale
            };
            rank = Number(row.rank);
          }
        }
      }

      // Strategy 2: Slug match (sitemap / SEO links)
      if (!target) {
        const allCombos = await db.select().from(comboStats);
        allCombos.sort((a, b) =>
          b.punteggioTotale - a.punteggioTotale ||
          (b.dataCreazione?.getTime() || 0) - (a.dataCreazione?.getTime() || 0)
        );

        const toSlug = (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
        const targetIndex = allCombos.findIndex((c: any) => {
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
          target = allCombos[targetIndex];
          rank = targetIndex + 1;
        }
      }

      if (!target) return res.status(404).send('Combo not found');

      const buffer = await generateComboImage({ ...target, rank });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buffer);
    } catch (err) {
      console.error('Error generating OG image:', err);
      res.status(500).send('Internal Server Error');
    }
  });

  app.get('/sitemap.xml', async (_req, res) => {
    try {
      const base = process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || '5000'}`;
      const today = new Date().toISOString().slice(0, 10);

      const staticPaths = [
        { path: '/', priority: '0.9', changefreq: 'daily', lastmod: today },
        { path: '/analytics', priority: '0.8', changefreq: 'daily', lastmod: today },
        { path: '/favorites', priority: '0.5', changefreq: 'weekly', lastmod: today },
        { path: '/tournaments', priority: '0.7', changefreq: 'daily', lastmod: today },
        { path: '/players', priority: '0.7', changefreq: 'daily', lastmod: today },
        { path: '/leaderboard/blade', priority: '0.6', changefreq: 'weekly', lastmod: today },
        { path: '/leaderboard/ratchet', priority: '0.6', changefreq: 'weekly', lastmod: today },
        { path: '/leaderboard/bit', priority: '0.6', changefreq: 'weekly', lastmod: today },
      ];

      const nodes = await fetchTournamentsForGame('2024-01-01T00:00:00Z');
      const limit = 6;
      const details: Record<string, string | null> = {};
      let i = 0;
      const worker = async () => {
        while (i < (nodes as any[]).length) {
          const idx = i++;
          const id = String((nodes as any[])[idx].id);
          try {
            const det = await fetchTournamentDetail(id);
            details[id] = det?.schedule?.startedAt ? String(det.schedule.startedAt).slice(0, 10) : null;
          } catch {
            details[id] = null;
          }
        }
      };
      await Promise.all(Array.from({ length: limit }, () => worker()));

      const tournamentPaths = (nodes as any[]).map((n: any) => ({
        path: `/tournaments/${String(n.id)}`,
        priority: '0.6',
        changefreq: 'weekly',
        lastmod: details[String(n.id)] || today,
      }));

      const topPlayers = await db
        .select()
        .from(playerLeaderboardView)
        .orderBy(desc(playerLeaderboardView.totalPoints))
        .limit(100);

      const playerIds = topPlayers.map((r: any) => String(r.playerId));
      const playerLastMap = new Map<string, string>();

      if (playerIds.length > 0) {
        const concurrency = 6;
        let j = 0;
        const worker2 = async () => {
          while (j < playerIds.length) {
            const idx = j++;
            const pid = playerIds[idx];
            try {
              const row = await db.execute(sql`SELECT MAX(updated_at) AS last FROM cm_match_results WHERE player_id = ${pid}`);
              const last = (row.rows as any[])[0]?.last ? String((row.rows as any[])[0].last).slice(0, 10) : today;
              playerLastMap.set(pid, last);
            } catch {
              playerLastMap.set(pid, today);
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker2()));
      }

      const playerPaths = topPlayers.map((r: any) => ({
        path: `/players/${String(r.playerId)}`,
        priority: '0.6',
        changefreq: 'weekly',
        lastmod: playerLastMap.get(String(r.playerId)) || today,
      }));

      const combosRows = await db.execute(sql`
        SELECT blade, assist_blade, ratchet, bit, lock_chip, data_creazione
        FROM combo_stats
        ORDER BY punteggio_totale DESC, data_creazione DESC
        LIMIT 300
      `);

      const toSlug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
      const comboPaths = (combosRows.rows as any[]).map((r: any) => {
        const parts = [
          String(r.lock_chip || '') && String(r.lock_chip).toLowerCase() !== 'none' ? String(r.lock_chip) : '',
          String(r.blade),
          String(r.assist_blade || '') && String(r.assist_blade).toLowerCase() !== 'none' ? String(r.assist_blade) : '',
          String(r.ratchet || '') && String(r.ratchet).toLowerCase() !== 'none' ? String(r.ratchet) : '',
          String(r.bit),
        ].filter(Boolean).map(toSlug);
        return {
          path: `/combo/${parts.join('-')}`,
          priority: '0.6',
          changefreq: 'weekly',
          lastmod: r.data_creazione ? String(r.data_creazione).slice(0, 10) : today,
        };
      });

      const entries = [...staticPaths, ...tournamentPaths, ...playerPaths, ...comboPaths];
      const urls = entries.map((e) => {
        const loc = `${base}${e.path}`;
        return `<url><loc>${loc}</loc><lastmod>${e.lastmod}</lastmod><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`;
      }).join('');

      const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
      res.setHeader('Content-Type', 'application/xml');
      res.send(xml);
    } catch {
      res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
  });
}
