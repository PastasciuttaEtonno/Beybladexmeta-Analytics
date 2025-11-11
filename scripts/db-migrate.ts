#!/usr/bin/env tsx
import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  // Run FK update for external_player_combos -> cm_players
  const migrationFile = join(__dirname, "..", "migrations", "0004_update_external_player_combos_fk.sql");
  
  try {
    const sql = readFileSync(migrationFile, "utf8");
    
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      await client.connect();
      console.log("✅ Connected to database");
      
      // Split SQL by statement breakpoints
      const statements = sql.split("--> statement-breakpoint\n").filter(s => s.trim());
      
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i].trim();
        if (statement) {
          console.log(`🛠️  Executing statement ${i + 1}/${statements.length}...`);
          await client.query(statement);
        }
      }
      
      console.log("✅ Migration completed successfully!");
      
    } catch (err) {
      const e = err as any;
      console.error("❌ Migration failed:", e?.message || e);
      if (e?.code) console.error("Error code:", e.code);
      if (e?.position) console.error("Position:", e.position);
      process.exitCode = 1;
    } finally {
      await client.end();
    }
    
  } catch (err) {
    console.error("❌ Failed to read migration file:", err);
    process.exitCode = 1;
  }
}

runMigration();