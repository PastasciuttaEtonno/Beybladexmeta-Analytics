#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function refresh() {
  try {
    console.log("🔄 Refreshing materialized view: top_component_snapshot (CONCURRENTLY)");
    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY top_component_snapshot`);
      console.log("✅ Concurrent refresh succeeded");
    } catch (e) {
      console.warn("⚠️ Concurrent refresh failed; trying regular refresh:", (e as any)?.message || e);
      await db.execute(sql`REFRESH MATERIALIZED VIEW top_component_snapshot`);
      console.log("✅ Regular refresh succeeded");
    }
    process.exit(0);
  } catch (error) {
    console.error("❌ Failed to refresh view:", (error as any)?.message || error);
    process.exit(1);
  }
}

refresh();