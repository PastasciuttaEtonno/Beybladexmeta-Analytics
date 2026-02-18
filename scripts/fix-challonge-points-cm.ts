import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { calculateChallongePoints } from '../server/scoreExternalCombo';

// Helper to determine if a tournament ID looks like a Challonge ID 
// (assuming CM IDs are UUIDs or different format, and Challonge are slugs/strings)
const isChallongeId = (id: string) => {
    // Basic heuristic: specific known IDs or simple strings without UUID dashes?
    // User examples: "dvbwd9sz", "otply5yd" -> 8 chars, alphanumeric
    // CM examples: often UUIDs? Let's check length or format.
    // For now, let's assume anything with current points != expected Challonge points might be a candidate
    return !id.includes('-');
};

async function main() {
    console.log('--- Starting Point Correction for Challonge Data in cm_match_results ---');

    // Fetch all results
    const results = await db.execute(sql`SELECT * FROM cm_match_results`);

    let updatedCount = 0;

    for (const row of results.rows as any[]) {
        // Skip if not likely Challonge (adjust heuristic as needed)
        // Or better: Just check if current points match Challonge logic? 
        // No, because existing CM points might coincidentally match.
        // Let's rely on the ID format for now: Challonge IDs seen so far are short alphanumeric strings (8 chars).
        if (row.tournament_id.length > 15) continue; // Skip likely UUIDs/CM IDs

        const count = parseInt(row.numero_partecipanti) || 0;
        const rank = parseInt(row.piazzamento) || 999;
        const currentPoints = parseFloat(row.punti_guadagnati) || 0;

        // Calculate expected points using NEW Challonge logic
        const expectedPoints = calculateChallongePoints(rank, count);

        if (expectedPoints > 0 && Math.abs(currentPoints - expectedPoints) > 0.1) {
            console.log(`[FIX] Tournament: ${row.tournament_id}, Player: ${row.player_id}`);
            console.log(`      Rank: ${rank}, Participants: ${count}`);
            console.log(`      Current Points: ${currentPoints} -> Expected: ${expectedPoints}`);

            await db.execute(sql`
                UPDATE cm_match_results 
                SET punti_guadagnati = ${expectedPoints} 
                WHERE tournament_id = ${row.tournament_id} 
                  AND player_id = ${row.player_id} 
                  AND combo_number = ${row.combo_number}
            `);
            updatedCount++;
        }
    }

    console.log(`--- Completed. Updated ${updatedCount} rows. ---`);
    process.exit(0);
}

main().catch(console.error);
