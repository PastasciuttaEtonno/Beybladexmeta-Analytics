#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

/**
 * Clear data from all public tables except for session and users.
 * Uses TRUNCATE ... RESTART IDENTITY CASCADE for speed and consistency.
 */
async function clearData() {
  const EXCLUDE = new Set(["session", "users", "cm_players"]);
  try {
    console.log("\n🧹 Clearing database tables (excluding session, users)\n");

    const tablesRes = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tables = (tablesRes.rows as any[]).map(r => String(r.table_name));
    const targets = tables.filter(t => !EXCLUDE.has(t));

    if (targets.length === 0) {
      console.log("No tables to clear.");
      process.exit(0);
    }

    console.log("Tables to clear:", targets.join(", "));

    // Run as a single transaction to ensure atomicity
    await db.transaction(async (tx) => {
      for (const tbl of targets) {
        console.log(`  → Truncating ${tbl}`);
        await tx.execute(sql.raw(`TRUNCATE TABLE "${tbl}" RESTART IDENTITY CASCADE;`));
      }
    });

    console.log("\n✅ Data cleared successfully\n");
    process.exit(0);
  } catch (error: any) {
    console.error("❌ Failed to clear data:", error?.message || error);
    process.exit(1);
  }
}

clearData();