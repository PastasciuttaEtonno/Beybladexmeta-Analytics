import { db } from '../server/db';
import { sql } from 'drizzle-orm';

/**
 * Debug Script: Check Challonge Data Status
 * 
 * This script verifies the current state of Challonge combo data in the database.
 */

async function debugChallongeData() {
    console.log('🔍 Debugging Challonge Data...\n');

    try {
        // 1. Check challonge_reported_combos
        console.log('📋 1. Checking challonge_reported_combos table:\n');

        const reportedCombosRes = await db.execute(sql`
      SELECT 
        season,
        COUNT(*) as count,
        COUNT(DISTINCT tournament_id) as tournaments,
        COUNT(DISTINCT user_id) as users
      FROM challonge_reported_combos
      GROUP BY season
      ORDER BY season DESC NULLS LAST
    `);

        if (reportedCombosRes.rows.length === 0) {
            console.log('   ⚠️  No combos found in challonge_reported_combos\n');
        } else {
            console.log('   Combos by season:');
            for (const row of reportedCombosRes.rows as any[]) {
                console.log(`   - ${row.season || '(NULL)'}: ${row.count} combos, ${row.tournaments} tournaments, ${row.users} users`);
            }
            console.log();
        }

        // 2. Check combo_stats
        console.log('📊 2. Checking combo_stats table:\n');

        const comboStatsRes = await db.execute(sql`
      SELECT 
        season,
        COUNT(*) as count,
        SUM(primi_posti) as wins,
        SUM(secondi_posti) as second_places,
        SUM(terzi_posti) as third_places,
        SUM(punteggio_totale) as total_points
      FROM combo_stats
      GROUP BY season
      ORDER BY season DESC
    `);

        if (comboStatsRes.rows.length === 0) {
            console.log('   ⚠️  No combos found in combo_stats\n');
        } else {
            console.log('   Combos by season:');
            for (const row of comboStatsRes.rows as any[]) {
                console.log(`   - ${row.season}: ${row.count} unique combos, ${row.wins} wins, ${row.second_places} 2nd, ${row.third_places} 3rd, ${row.total_points} pts`);
            }
            console.log();
        }

        // 3. Check for Season 2026 specifically
        console.log('🎯 3. Checking Season 2026 data:\n');

        const season2026ReportedRes = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM challonge_reported_combos
      WHERE season = 'Season 2026'
    `);

        const season2026StatsRes = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM combo_stats
      WHERE season = 'Season 2026'
    `);

        const reportedCount = (season2026ReportedRes.rows[0] as any)?.count || 0;
        const statsCount = (season2026StatsRes.rows[0] as any)?.count || 0;

        console.log(`   - challonge_reported_combos: ${reportedCount} combos`);
        console.log(`   - combo_stats: ${statsCount} unique combos`);

        if (reportedCount > 0 && statsCount === 0) {
            console.log('\n   ⚠️  WARNING: Season 2026 combos exist in challonge_reported_combos but NOT in combo_stats!');
            console.log('   💡 Run the migration script to fix this: npm run migrate:challonge-combos\n');
        } else if (reportedCount === 0) {
            console.log('\n   ℹ️  No Season 2026 combos found. Make sure combos are being saved with correct season.\n');
        } else {
            console.log('\n   ✅ Season 2026 data looks good!\n');
        }

        // 4. Sample combos from challonge_reported_combos
        console.log('🔬 4. Sample combos from challonge_reported_combos:\n');

        const sampleRes = await db.execute(sql`
      SELECT 
        tournament_id,
        blade,
        ratchet,
        bit,
        rank,
        season
      FROM challonge_reported_combos
      WHERE season IS NOT NULL
      LIMIT 5
    `);

        if (sampleRes.rows.length === 0) {
            console.log('   ⚠️  No combos with season data found\n');
        } else {
            console.log('   Sample combos:');
            for (const row of sampleRes.rows as any[]) {
                console.log(`   - ${row.blade} ${row.ratchet} ${row.bit} | Rank: ${row.rank} | Season: ${row.season} | Tournament: ${row.tournament_id}`);
            }
            console.log();
        }

        console.log('✅ Debug complete!\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Debug failed:', error);
        process.exit(1);
    }
}

// Run debug
debugChallongeData();
