import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function debugChallongeRanks() {
    console.log('🔍 Debugging Challonge Reported Combos Ranks...\n');

    try {
        // 1. Total count
        const total = await db.execute(sql`SELECT count(*) as count FROM challonge_reported_combos`);
        console.log(`Total rows in challonge_reported_combos: ${total.rows[0].count}`);

        // 2. Group by rank
        const ranks = await db.execute(sql`
      SELECT rank, count(*) as count 
      FROM challonge_reported_combos 
      GROUP BY rank 
      ORDER BY rank
    `);
        console.log('\n📊 Counts by Rank:');
        console.table(ranks.rows);

        // 3. Inspect a few entries where rank might be near 4 or null
        const samples = await db.execute(sql`
      SELECT * FROM challonge_reported_combos 
      LIMIT 5
    `);
        console.log('\n👀 Sample entries:');
        console.log(samples.rows);

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugChallongeRanks();
