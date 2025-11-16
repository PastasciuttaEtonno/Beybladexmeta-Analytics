#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function run() {
  try {
    await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS top_component_snapshot`);
    await db.execute(sql`
      CREATE MATERIALIZED VIEW top_component_snapshot AS
      SELECT 'blade' AS component_type, blade AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
      FROM blade_stats
      UNION ALL
      SELECT 'assist-blade' AS component_type, assist_blade AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
      FROM assist_blade_stats
      UNION ALL
      SELECT 'ratchet' AS component_type, ratchet AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
      FROM ratchet_stats
      UNION ALL
      SELECT 'bit' AS component_type, bit AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
      FROM bit_stats
      UNION ALL
      SELECT 'lock-chip' AS component_type, lock_chip AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale
      FROM lock_chip_stats
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS top_component_snapshot_ct_idx ON top_component_snapshot(component_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS top_component_snapshot_score_idx ON top_component_snapshot(punteggio_totale DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS top_component_snapshot_name_idx ON top_component_snapshot(name)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS top_component_snapshot_unique ON top_component_snapshot(component_type, name)`);
    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
    } catch {
      await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
    }
    console.log("Created top_component_snapshot");
    process.exit(0);
  } catch (e) {
    console.error("Failed to create view:", (e as any)?.message || e);
    process.exit(1);
  }
}

run();