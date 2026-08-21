#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function resetStats() {
  try {
    console.log("\n🧹 Zeroing aggregate stats (without deleting rows)\n");
    await db.transaction(async (tx) => {
      // combo_stats
      await tx.execute(sql`
        UPDATE combo_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ combo_stats reset");

      // blade_stats
      await tx.execute(sql`
        UPDATE blade_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ blade_stats reset");

      // ratchet_stats
      await tx.execute(sql`
        UPDATE ratchet_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ ratchet_stats reset");

      // assist_blade_stats
      await tx.execute(sql`
        UPDATE assist_blade_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ assist_blade_stats reset");

      // bit_stats
      await tx.execute(sql`
        UPDATE bit_stats
        SET primi_posti = 0,
            secondi_posti = 0,
            terzi_posti = 0,
            punteggio_totale = 0
      `);
      console.log("✅ bit_stats reset");
    });

    // Optional: refresh materialized view to reflect zeros
    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      console.log("🔄 top_component_snapshot refreshed (concurrent)");
    } catch (e) {
      await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
      console.log("🔄 top_component_snapshot refreshed (regular)");
    }

    console.log("\n✅ Stats reset completed\n");
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to reset stats:", (error as any)?.message || error);
    process.exit(1);
  }
}

resetStats();