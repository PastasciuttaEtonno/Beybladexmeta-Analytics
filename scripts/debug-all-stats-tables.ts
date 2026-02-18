import { db } from '../server/db';
import { sql } from 'drizzle-orm';

/**
 * Debug: Verify ALL stats tables structure
 */

async function debugAllStatsStructure() {
    console.log('🔍 Debugging ALL stats tables structure\n');

    const tables = [
        'combo_stats',
        'blade_stats',
        'assist_blade_stats',
        'ratchet_stats',
        'bit_stats',
        'lock_chip_stats'
    ];

    try {
        for (const table of tables) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📋 Table: ${table}`);
            console.log('='.repeat(60));

            // Check primary key columns
            const pkRes = await db.execute(sql.raw(`
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = '${table}'::regclass AND i.indisprimary
        ORDER BY array_position(i.indkey, a.attnum)
      `));

            if (pkRes.rows.length === 0) {
                console.log('   ⚠️  No primary key found!');
            } else {
                console.log('   Primary key columns:');
                for (const pk of pkRes.rows as any[]) {
                    console.log(`     - ${pk.column_name}`);
                }
            }

            // Check if season column exists
            const seasonCheck = await db.execute(sql.raw(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = '${table}' AND column_name = 'season'
      `));

            console.log(`   Has 'season' column: ${seasonCheck.rows.length > 0 ? '✅ YES' : '❌ NO'}`);
        }

        console.log(`\n${'='.repeat(60)}\n`);
        console.log('✅ Debug complete!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Debug failed:', error);
        process.exit(1);
    }
}

debugAllStatsStructure();
