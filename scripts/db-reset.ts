#!/usr/bin/env tsx

/**
 * Database Reset Script
 * WARNING: This will drop ALL tables and recreate them from scratch
 * Use only in development!
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function resetDatabase() {
  console.log("\n⚠️  DATABASE RESET SCRIPT ⚠️\n");
  console.log("This will DROP ALL TABLES and recreate them from scratch.");
  console.log("All data will be PERMANENTLY DELETED!\n");

  const confirm = await question(
    'Type "RESET" to confirm (or anything else to cancel): '
  );

  if (confirm.trim() !== "RESET") {
    console.log("\n❌ Reset cancelled.\n");
    rl.close();
    process.exit(0);
  }

  try {
    console.log("\n🗑️  Dropping all tables...\n");

    // Drop tables in correct order (respecting foreign key constraints)
    await db.execute(sql`DROP TABLE IF EXISTS favorite_deck_combos CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS favorite_decks CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS favorite_combos CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS login_rate_limits CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS combo_stats CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS blade_stats CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS assist_blade_stats CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS ratchet_stats CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS bit_stats CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS lock_chip_stats CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS users CASCADE;`);
    await db.execute(sql`DROP TABLE IF EXISTS session CASCADE;`);

    console.log("✅ All tables dropped successfully.\n");

    console.log("📝 Now run: npm run db:push\n");
    console.log("This will recreate all tables from your Drizzle schema.\n");

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    rl.close();
    process.exit(1);
  }
}

resetDatabase();
