import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Migration: Add missing primary keys to ratchet_stats and bit_stats
 */

async function runMigration() {
    console.log('🔄 Running migration: Add missing primary keys\n');

    try {
        const migrationSQL = readFileSync(
            join(__dirname, '../migrations/0006_add_missing_stats_pks.sql'),
            'utf-8'
        );

        console.log('📝 Migration SQL:');
        console.log(migrationSQL);
        console.log();

        console.log('⚙️  Executing migration...\n');

        await db.execute(sql.raw(migrationSQL));

        console.log('✅ Migration completed successfully!\n');

        // Verify
        const tables = ['ratchet_stats', 'bit_stats'];

        for (const table of tables) {
            const pkRes = await db.execute(sql.raw(`
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = '${table}'::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
      `));

            console.log(`🔍 ${table} primary key:`);
            if (pkRes.rows.length === 0) {
                console.log('   ❌ Still no primary key!');
            } else {
                for (const row of pkRes.rows as any[]) {
                    console.log(`   ✅ ${row.column_name}`);
                }
            }
        }

        console.log('\n✅ Migration verified successfully!\n');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    }
}

runMigration();
