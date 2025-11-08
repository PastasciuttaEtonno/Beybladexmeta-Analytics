#!/usr/bin/env tsx
import "dotenv/config";
import { Client } from "pg";

async function testTargetConn() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const { rows } = await client.query("SELECT current_user, current_database()");
    console.log("✅ Connected to target database:", rows[0]);
    
    // Test if tables exist
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log("📊 Tables found:", tables.rows.map(r => r.table_name));
    
  } catch (e: any) {
    console.error("❌ Connection failed:", e?.message || e);
    if (e?.code) console.error("Error code:", e.code);
  } finally {
    await client.end();
  }
}

testTargetConn();