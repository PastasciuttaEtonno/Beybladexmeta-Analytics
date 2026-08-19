import { db } from '../../src/db';
import { externalPlayerCombos, unifiedMetaView } from '../../src/shared/schema';
import { eq, and } from 'drizzle-orm';

async function verify() {
    console.log('--- Verification Start ---');

    const testTournamentId = 'test-challonge-tournament';
    const testPlayerId = 'GhostPlayer123';

    try {
        // 1. Check if column exists (redundant but safe)
        const columns = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'external_player_combos' AND column_name = 'platform'
    `);
        console.log('Platform column exists:', columns.rows.length > 0);

        // 2. Query the view to check if it has the platform column now
        const viewCols = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'unified_meta_view' AND column_name = 'platform'
    `);
        console.log('View platform column exists:', viewCols.rows.length > 0);

        // 3. Test data check (if any exist)
        const samples = await db.select().from(externalPlayerCombos).limit(5);
        console.log('Sample external combos platforms:', samples.map(s => (s as any).platform));

        console.log('--- Verification End ---');
    } catch (e) {
        console.error('Verification failed:', e);
    } finally {
        process.exit(0);
    }
}

// Helper to use sql in the script
import { sql } from 'drizzle-orm';

verify();
