import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migration: Add season to combo_stats primary key
 * 
 * This migration updates the primary key constraint on combo_stats to include the season column.
 * This is required for the ON CONFLICT clause in processExternalCombo to work correctly.
 */

async function runMigration() {
    console.log('🔄 Running migration: Add season to combo_stats primary key\n');

    try {
        // Read the SQL file
        const migrationSQL = readFileSync(
            join(__dirname, '../migrations/0005_add_season_to_combo_stats_pk.sql'),
            'utf-8'
        );

        console.log('📝 Migration SQL:');
        console.log(migrationSQL);
        console.log();

        // Execute the migration
        console.log('⚙️  Executing migration...\n');

        await db.execute(sql.raw(migrationSQL));

        console.log('✅ Migration completed successfully!\n');

        // Verify the new constraint
        const verifyRes = await db.execute(sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'combo_stats' AND constraint_type = 'PRIMARY KEY'
    `);

        console.log('🔍 Verification:');
        console.log('Current primary key constraint:', verifyRes.rows);
        console.log();

        // Show columns in the primary key
        const pkColumnsRes = await db.execute(sql`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'combo_stats'::regclass AND i.indisprimary
      ORDER BY a.attnum
    `);

        console.log('Primary key columns:');
        for (const row of pkColumnsRes.rows as any[]) {
            console.log(`  - ${row.column_name}`);
        }
        console.log();

        console.log('✅ Migration verified successfully!\n');
        console.log('You can now use the Challonge claim endpoint without errors.\n');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    }
}

// Run migration
runMigration();
