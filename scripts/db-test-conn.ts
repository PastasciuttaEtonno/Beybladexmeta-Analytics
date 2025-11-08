#!/usr/bin/env tsx
import "dotenv/config";
import { Client } from "pg";

async function testConn() {
  const user = process.env.PGUSER || "admin";
  const host = process.env.PGHOST || "localhost";
  const port = Number(process.env.PGPORT || 5432);
  const password = process.env.PGPASSWORD || "";

  const client = new Client({ host, port, user, password, database: "postgres" });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_user, current_database()");
    console.log("✅ Connected:", rows[0]);
  } catch (e: any) {
    console.error("❌ Connection failed:", e?.message || e);
    if (e?.code) console.error("Error code:", e.code);
  } finally {
    await client.end();
  }
}

testConn();