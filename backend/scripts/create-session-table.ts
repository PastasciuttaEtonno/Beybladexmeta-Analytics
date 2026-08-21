#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function run() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS session (
        sid varchar NOT NULL PRIMARY KEY,
        sess json NOT NULL,
        expire timestamp(6) NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS session_expire_idx ON session(expire)`);
    console.log("✅ session table ensured");
    process.exit(0);
  } catch (e) {
    console.error("❌ Failed to create session table:", (e as any)?.message || e);
    process.exit(1);
  }
}

run();