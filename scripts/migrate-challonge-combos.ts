import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { processExternalCombo } from '../server/scoreExternalCombo';

/**
 * Migration Script: Aggregate Existing Challonge Combos into combo_stats
 * 
 * This script reads all combos from challonge_reported_combos and aggregates them
 * into combo_stats using the same logic as real-time combo registration.
 */

async function migrateChallongeCombos() {
    console.log('🔄 Starting Challonge combo migration...\n');

    try {
        // Fetch all Challonge combos with tournament data
        const combosRes = await db.execute(sql`
      SELECT 
        crc.blade,
        crc.assist_blade as "assistBlade",
        crc.ratchet,
        crc.bit,
        crc.lock_chip as "lockChip",
        crc.season,
        crc.rank,
        crc.rank,
        crc.tournament_id as "tournamentId",
        crc.user_id as "userId"
      FROM challonge_reported_combos crc
      WHERE crc.season IS NOT NULL
      ORDER BY crc.tournament_id, crc.user_id, crc.combo_number
    `);

        const combos = combosRes.rows as any[];
        console.log(`📊 Found ${combos.length} combos to process\n`);

        if (combos.length === 0) {
            console.log('⚠️  No combos found with season data. Make sure combos have been saved with season information.');
            return;
        }

        // Group combos by tournament to fetch participant counts
        const tournamentIds = [...new Set(combos.map(c => c.tournamentId))];
        console.log(`🎮 Processing ${tournamentIds.length} tournaments\n`);

        // Fetch participant counts for all tournaments
        const tournamentData: Record<string, number> = {};
        for (const tid of tournamentIds) {
            const tRes = await db.execute(sql`
        SELECT 
          data->'total_players' as total_players,
          data->'participants_count' as participants_count,
          data->'tournament'->'participants_count' as tournament_participants
        FROM challonge_match_results
        WHERE tournament_id = ${tid}
        LIMIT 1
      `);

            if (tRes.rows.length > 0) {
                const row: any = tRes.rows[0];
                const totalPlayers =
                    row.total_players ||
                    row.participants_count ||
                    row.tournament_participants ||
                    0;
                tournamentData[tid] = Number(totalPlayers);
                console.log(`  ✓ Tournament ${tid}: ${totalPlayers} participants`);
            } else {
                console.warn(`  ⚠️  Tournament ${tid}: No data found, defaulting to 0 participants`);
                tournamentData[tid] = 0;
            }
        }

        console.log('\n📦 Aggregating combos into combo_stats...\n');

        let processed = 0;
        let skipped = 0;

        for (const combo of combos) {
            const totalParticipants = tournamentData[combo.tournamentId] || 0;

            if (!combo.season || totalParticipants === 0) {
                console.log(`  ⏭️  Skipped: ${combo.blade} ${combo.ratchet} ${combo.bit} (missing season or participants)`);
                skipped++;
                continue;
            }

            try {
                await processExternalCombo({
                    blade: combo.blade,
                    assistBlade: combo.assistBlade || 'None',
                    ratchet: combo.ratchet,
                    bit: combo.bit,
                    lockChip: combo.lockChip || 'None',
                    season: combo.season,
                    placement: combo.rank,
                    totalParticipants: totalParticipants,
                    tournamentId: combo.tournamentId,
                    playerId: combo.userId,
                    platform: 'challonge'
                });

                processed++;
                if (processed % 10 === 0) {
                    console.log(`  ✓ Processed ${processed} combos...`);
                }
            } catch (error: any) {
                console.error(`  ❌ Error processing combo: ${combo.blade} ${combo.ratchet} ${combo.bit}`, error.message);
            }
        }

        console.log('\n✅ Migration completed!');
        console.log(`   - Processed: ${processed}`);
        console.log(`   - Skipped: ${skipped}`);
        console.log(`   - Total: ${combos.length}\n`);

        // Verify results
        const verifyRes = await db.execute(sql`
      SELECT season, COUNT(*) as count
      FROM combo_stats
      GROUP BY season
      ORDER BY season DESC
    `);

        console.log('📊 combo_stats by season:');
        for (const row of verifyRes.rows as any[]) {
            console.log(`   - ${row.season}: ${row.count} combos`);
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateChallongeCombos();
