#!/usr/bin/env tsx
import "dotenv/config";
import { Client } from "pg";

async function ensureDatabase() {
  const targetDb = process.env.PGDATABASE || "beyblade_tracker";
  const host = process.env.PGHOST || "localhost";
  const port = Number(process.env.PGPORT || 5432);
  const user = process.env.PGUSER || "postgres";
  const password = process.env.PGPASSWORD || "";

  // Connect to default 'postgres' database to manage other databases
  const adminClient = new Client({
    host,
    port,
    user,
    password,
    database: "postgres",
  });

  try {
    await adminClient.connect();

    const exists = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb]
    );

    if (exists.rowCount && exists.rowCount > 0) {
      console.log(`✅ Database '${targetDb}' already exists.`);
      return;
    }

    console.log(`🛠️  Creating database '${targetDb}'...`);
    await adminClient.query(`CREATE DATABASE "${targetDb}"`);
    console.log(`✅ Database '${targetDb}' created.`);
  } catch (err) {
    const e = err as any;
    console.error("❌ Failed to ensure database:", e?.message || e);
    if (e?.code) console.error("Error code:", e.code);
    process.exitCode = 1;
  } finally {
    await adminClient.end();
  }
}

ensureDatabase();