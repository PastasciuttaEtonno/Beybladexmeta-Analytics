import { db } from '../server/db';
import { sql } from 'drizzle-orm';

/**
 * Debug: Verify combo_stats table structure
 */

async function debugComboStatsStructure() {
    console.log('🔍 Debugging combo_stats table structure\n');

    try {
        // 1. Check table columns
        console.log('📋 1. Table columns:');
        const columnsRes = await db.execute(sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'combo_stats'
      ORDER BY ordinal_position
    `);

        for (const col of columnsRes.rows as any[]) {
            console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
        }
        console.log();

        // 2. Check constraints
        console.log('🔐 2. Table constraints:');
        const constraintsRes = await db.execute(sql`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'combo_stats'
    `);

        for (const c of constraintsRes.rows as any[]) {
            console.log(`   - ${c.constraint_name} (${c.constraint_type})`);
        }
        console.log();

        // 3. Check primary key details
        console.log('🔑 3. Primary key columns:');
        const pkRes = await db.execute(sql`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = 'combo_stats'::regclass AND i.indisprimary
      ORDER BY array_position(i.indkey, a.attnum)
    `);

        if (pkRes.rows.length === 0) {
            console.log('   ⚠️  No primary key found!');
        } else {
            for (const pk of pkRes.rows as any[]) {
                console.log(`   - ${pk.column_name}`);
            }
        }
        console.log();

        // 4. Try a simple INSERT (should fail if no PK)
        console.log('🧪 4. Testing simple INSERT:');
        try {
            await db.execute(sql`
        INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season, primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione)
        VALUES ('TestBlade', 'None', 'TestRatchet', 'TestBit', 'None', 'Season 2026', 0, 0, 0, 0, NOW())
      `);
            console.log('   ✅ Simple INSERT successful');

            // Clean up test data
            await db.execute(sql`DELETE FROM combo_stats WHERE blade = 'TestBlade'`);
            console.log('   🧹 Test data cleaned up');
        } catch (err: any) {
            console.log('   ❌ Simple INSERT failed:', err.message);
        }
        console.log();

        // 5. Try INSERT with ON CONFLICT
        console.log('🧪 5. Testing INSERT with ON CONFLICT:');
        try {
            await db.execute(sql`
        INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season, primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione)
        VALUES ('TestBlade2', 'None', 'TestRatchet2', 'TestBit2', 'None', 'Season 2026', 1, 0, 0, 100, NOW())
        ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip, season)
        DO UPDATE SET primi_posti = combo_stats.primi_posti + 1
      `);
            console.log('   ✅ INSERT with ON CONFLICT successful');

            // Clean up test data
            await db.execute(sql`DELETE FROM combo_stats WHERE blade = 'TestBlade2'`);
            console.log('   🧹 Test data cleaned up');
        } catch (err: any) {
            console.log('   ❌ INSERT with ON CONFLICT failed:', err.message);
            console.log('   Error code:', err.code);
        }
        console.log();

        console.log('✅ Debug complete!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Debug failed:', error);
        process.exit(1);
    }
}

debugComboStatsStructure();
