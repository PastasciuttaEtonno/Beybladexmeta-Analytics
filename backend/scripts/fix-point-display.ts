
import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { calculateChallongePoints } from "../src/lib/regionalScoring";

async function main() {
    const tournamentId = 'dvbwd9sz';
    console.log(`Checking cm_match_results for tournament: ${tournamentId}...`);

    // 1. Inspect existing rows
    const rows = await db.execute(sql`
    SELECT * FROM cm_match_results WHERE tournament_id = ${tournamentId}
  `);

    console.log(`Found ${rows.rows.length} rows.`);
    if (rows.rows.length === 0) {
        console.log("No rows found. Checking challonge_match_results for context...");
        const cmr = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId}`);
        if (cmr.rows.length > 0) {
            const data = cmr.rows[0].data as any;
            console.log("Challonge Data exists.");
            console.log("Participants Count:", data.participants_count || data.total_players);
        } else {
            console.log("No Challonge data found either.");
        }
        return;
    }

    for (const row of rows.rows as any[]) {
        console.log(`Player: ${row.player_id}, Rank: ${row.piazzamento}, Points: ${row.punti_guadagnati}`);

        // We expect Rank 1 to have 350 points (33 participants)
        // If it has 200, we verify and fix.
        if (row.piazzamento === 1 && Math.abs(Number(row.punti_guadagnati) - 350) > 1) {
            console.log(`--> Incorrect points detected! Expected 350, found ${row.punti_guadagnati}`);

            // Calculate correct points dynamically just to be sure
            // We need participant count. Assuming 33 from previous investigation.
            // Or fetch from challonge_match_results
            const cmr = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId}`);
            let count = 33;
            if (cmr.rows.length > 0) {
                const d = cmr.rows[0].data as any;
                count = d.participants_count || d.total_players || 33;
            }

            const newPoints = calculateChallongePoints(1, count);
            console.log(`--> Recalculated points for count ${count}: ${newPoints}`);

            if (newPoints > 0) {
                await db.execute(sql`
            UPDATE cm_match_results 
            SET punti_guadagnati = ${newPoints}
            WHERE tournament_id = ${tournamentId} AND player_id = ${row.player_id} AND piazzamento = 1
         `);
                console.log("--> FIXED.");
            }
        }
    }

    console.log("Done.");
}

main().catch(console.error).finally(() => process.exit());
