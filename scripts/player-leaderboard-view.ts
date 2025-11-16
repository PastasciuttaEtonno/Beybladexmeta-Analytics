#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as readline from "readline";

async function createMaterializedView() {
  try {
    console.log("\n🛠️ Creazione vista materializzata player_leaderboard...");
    await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS public.player_leaderboard`);
    await db.execute(sql`
      CREATE MATERIALIZED VIEW public.player_leaderboard AS
      SELECT
        p.id AS player_id,
        p.nickname,
        p.avatar,
        SUM(
          CASE
            WHEN r.placement = 1 THEN 10 * r.total_participants
            WHEN r.placement = 2 THEN 7 * r.total_participants
            WHEN r.placement = 3 THEN 5 * r.total_participants
            ELSE 0
          END
        )::float AS total_points
      FROM public.external_player_combos r
      LEFT JOIN public.cm_players p ON r.player_id = p.id
      GROUP BY p.id, p.nickname, p.avatar
      ORDER BY total_points DESC
      WITH DATA
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX player_leaderboard_player_id_idx
      ON public.player_leaderboard (player_id)
    `);
    console.log("✅ Vista materializzata creata e indicizzata");
  } catch (error) {
    console.error("❌ Errore creazione vista:", (error as any)?.message || error);
    process.exitCode = 1;
  }
}

async function refreshMaterializedView() {
  try {
    console.log("\n🔄 Refresh CONCURRENTLY di player_leaderboard...");
    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_leaderboard`);
      console.log("✅ Refresh CONCURRENTLY riuscito");
    } catch (e) {
      console.warn("⚠️ Refresh CONCURRENTLY fallito, provo refresh normale:", (e as any)?.message || e);
      await db.execute(sql`REFRESH MATERIALIZED VIEW public.player_leaderboard`);
      console.log("✅ Refresh normale riuscito");
    }
  } catch (error) {
    console.error("❌ Errore refresh vista:", (error as any)?.message || error);
    process.exitCode = 1;
  }
}

async function run() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n=== Player Leaderboard View ===");
  console.log("1) Crea/ricrea la materialized view");
  console.log("2) Esegui REFRESH CONCURRENTLY della view");
  console.log("3) Esci\n");
  rl.question("Seleziona un'opzione (1/2/3): ", async (answer) => {
    rl.close();
    const opt = String(answer || "").trim();
    if (opt === "1") {
      await createMaterializedView();
    } else if (opt === "2") {
      await refreshMaterializedView();
    } else {
      console.log("Uscita.");
    }
    process.exit(0);
  });
}

run();