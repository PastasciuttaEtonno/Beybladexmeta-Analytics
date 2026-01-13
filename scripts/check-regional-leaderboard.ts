#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function run() {
  const season = "Off Season";
  const regions = await db.execute(sql`
    SELECT DISTINCT region
    FROM tournaments_view
    WHERE region IS NOT NULL
    ORDER BY region
    LIMIT 1
  `);
  const anyRegion = String((regions.rows[0]?.region ?? "") || "");
  const globalRows = await db.execute(sql`
    SELECT player_id, MAX(player_name) AS player_name, 'Global' AS region, season,
           SUM(points) AS points,
           SUM(tournaments_played) AS tournaments_played,
           SUM(wins) AS wins,
           SUM(top4) AS top4
    FROM player_regional_stats
    WHERE season = ${season}
    GROUP BY player_id, season
    ORDER BY points DESC, wins DESC, top4 DESC
    LIMIT 10
  `);
  let regionalRows: any = [];
  if (anyRegion) {
    const r = await db.execute(sql`
      SELECT player_id, player_name, region, season, points, tournaments_played, wins, top4
      FROM player_regional_stats
      WHERE season = ${season} AND region = ${anyRegion}
      ORDER BY points DESC, wins DESC, top4 DESC
      LIMIT 10
    `);
    regionalRows = r.rows;
  }
  console.log(JSON.stringify({ season, sampleRegion: anyRegion || null, globalTop10: globalRows.rows, regionalTop10: regionalRows }, null, 2));
  process.exit(0);
}

run();
