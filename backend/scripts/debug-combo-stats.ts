import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { calculatePoints } from '../src/scoreExternalCombo';

async function debugComboStats() {
    console.log('🔍 Debugging Combo Stats for 4th Place...\n');

    try {
        // 1. Check if ANY combo has quarti_posti > 0
        const quartiStats = await db.execute(sql`
      SELECT count(*) as count, sum(quarti_posti) as total_quarti
      FROM combo_stats
      WHERE quarti_posti > 0
    `);
        console.log('📊 Stats for quarti_posti > 0:');
        console.log(quartiStats.rows[0]);

        // 2. Check a specific combo known to be 4th (if any)
        // We'll search for combos with rank 4 in challonge_reported_combos
        const challonge4th = await db.execute(sql`
      SELECT * FROM challonge_reported_combos
      WHERE rank = 4
      LIMIT 1
    `);

        if (challonge4th.rows.length > 0) {
            const c = challonge4th.rows[0] as any;
            console.log('\n🔎 Found a 4th place combo in Challonge reported:', {
                blade: c.blade,
                ratchet: c.ratchet,
                bit: c.bit,
                tournamentId: c.tournamentId,
                userId: c.userId
            });

            // Check if this combo exists in combo_stats and what its values are
            const stats = await db.execute(sql`
        SELECT * FROM combo_stats
        WHERE blade = ${c.blade}
          AND ratchet = ${c.ratchet}
          AND bit = ${c.bit}
      `);
            console.log('   Corresponding combo_stats entry:', stats.rows[0] || 'Not found');
        } else {
            console.log('\n⚠️ No 4th place combos found in challonge_reported_combos.');
        }

        // 3. Test calculatePoints with 4th place
        console.log('\n🧪 Testing calculatePoints(4, 10)...');
        const points = calculatePoints(4, 10);
        console.log(`   Result: ${points} (Expected: 30)`);

        if (points === 0) {
            console.error('   ❌ calculatePoints returned 0 for 4th place!');
        } else {
            console.log('   ✅ calculatePoints seems correct.');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugComboStats();
