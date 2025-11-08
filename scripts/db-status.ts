#!/usr/bin/env tsx

/**
 * Database Status Script
 * Shows current database tables and row counts
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function showDatabaseStatus() {
  try {
    console.log("\n📊 Database Status\n");
    console.log("=".repeat(60));

    // Get all tables
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (tables.rows.length === 0) {
      console.log("\n⚠️  No tables found in database!");
      console.log("\nRun: npm run db:push\n");
      process.exit(0);
    }

    console.log("\n📋 Tables and Row Counts:\n");

    for (const table of tables.rows) {
      const tableName = table.table_name as string;
      
      // Get row count for each table
      const result = await db.execute(
        sql.raw(`SELECT COUNT(*) as count FROM "${tableName}"`)
      );
      
      const count = result.rows[0]?.count || 0;
      console.log(`  ${tableName.padEnd(30)} ${count.toString().padStart(10)} rows`);
    }

    console.log("\n" + "=".repeat(60));

    // Get database size
    const sizeResult = await db.execute(sql`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size;
    `);
    
    const dbSize = sizeResult.rows[0]?.size;
    console.log(`\n💾 Database Size: ${dbSize}\n`);

    // Check for admin users
    const adminCheck = await db.execute(sql`
      SELECT COUNT(*) as count FROM users WHERE is_admin = true;
    `);
    
    const adminCount = adminCheck.rows[0]?.count || 0;
    console.log(`👑 Admin Users: ${adminCount}\n`);

    if (adminCount === 0) {
      console.log("⚠️  No admin users found!");
      console.log("Run: npm run create-admin\n");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error checking database status:", error);
    process.exit(1);
  }
}

showDatabaseStatus();
