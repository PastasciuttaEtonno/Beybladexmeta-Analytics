#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function run() {
  try {
    console.log("\n🧹 Zeroing stats and clearing player combos/results\n");
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE combo_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ combo_stats reset");

      await tx.execute(sql`
        UPDATE blade_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ blade_stats reset");

      await tx.execute(sql`
        UPDATE assist_blade_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ assist_blade_stats reset");

      await tx.execute(sql`
        UPDATE ratchet_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ ratchet_stats reset");

      await tx.execute(sql`
        UPDATE bit_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ bit_stats reset");

      await tx.execute(sql`
        UPDATE lock_chip_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ lock_chip_stats reset");

      await tx.execute(sql`DELETE FROM external_player_combos`);
      console.log("🗑️ external_player_combos cleared");

      await tx.execute(sql`DELETE FROM cm_match_results`);
      console.log("🗑️ cm_match_results cleared");
    });

    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      console.log("🔄 top_component_snapshot refreshed (concurrent)");
    } catch {
      await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
      console.log("🔄 top_component_snapshot refreshed (regular)");
    }

    console.log("\n✅ Completed\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed:", (error as any)?.message || error);
    process.exit(1);
  }
}

run();