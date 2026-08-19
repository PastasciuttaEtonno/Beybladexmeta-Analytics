
import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { calculateChallongePoints } from "../src/scoreExternalCombo";

async function main() {
    const tournamentId = 'dvbwd9sz';
    console.log(`--- Starting Point Correction v2 for tournament: ${tournamentId} ---`);

    // 1. Inspect existing rows in cm_match_results
    const rows = await db.execute(sql`
    SELECT * FROM cm_match_results WHERE tournament_id = ${tournamentId}
  `);

    console.log(`📊 Found ${rows.rows.length} rows in cm_match_results.`);

    if (rows.rows.length === 0) {
        console.log("⚠️ No rows found. This explains why the list might be empty or missing.");
        return;
    }

    // 2. Fetch tournament context to get total participants
    const cmr = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId} LIMIT 1`);
    if (cmr.rows.length === 0) {
        console.log("❌ No Challonge data found for this tournament ID.");
        return;
    }
    const data = cmr.rows[0].data as any;
    const totalParticipants = data.participants_count || data.total_players || 0;
    console.log(`🎯 Tournament context: ${totalParticipants} total participants.`);

    // 3. Update each row with correct logic
    let updatedCount = 0;
    for (const row of rows.rows as any[]) {
        const rank = parseInt(row.piazzamento) || 0;
        const currentPoints = Number(row.punti_guadagnati) || 0;

        const expectedPoints = calculateChallongePoints(rank, totalParticipants);

        if (expectedPoints > 0 && Math.abs(currentPoints - expectedPoints) > 0.1) {
            console.log(`[FIX] Player: ${row.player_id}, Rank: ${rank}`);
            console.log(`      Current: ${currentPoints} -> Expected: ${expectedPoints}`);

            await db.execute(sql`
          UPDATE cm_match_results 
          SET punti_guadagnati = ${expectedPoints},
              numero_partecipanti = ${totalParticipants}
          WHERE tournament_id = ${tournamentId} 
            AND player_id = ${row.player_id} 
            AND combo_number = ${row.combo_number}
       `);
            updatedCount++;
        } else {
            console.log(`[OK] Player: ${row.player_id} already has ${currentPoints} points.`);
        }
    }

    console.log(`\n✅ Done. Updated ${updatedCount} rows.`);
}

main().catch(console.error).finally(() => process.exit());
