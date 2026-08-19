
import { db } from "../src/db";
import { sql } from "drizzle-orm";
import { processExternalCombo, ExternalComboResult } from "../src/scoreExternalCombo";
import { comboStats } from "@shared/schema";

async function verify4thPlacePoints() {
    console.log("Starting 4th place verification...");

    // 1. Define a dummy 4th place result
    const testCombo: ExternalComboResult = {
        blade: "TestBlade4th",
        assistBlade: "None",
        ratchet: "3-60",
        bit: "F",
        lockChip: "None",
        season: "Season 2026",
        placement: 4,
        totalParticipants: 10, // 4th place should get 3 points * 10 = 30 points
    };

    try {
        // 2. Clear previous test data
        await db.execute(sql`DELETE FROM combo_stats WHERE blade = ${testCombo.blade}`);
        console.log("Cleaned up previous test data.");

        // 3. Process the combo
        console.log("Processing 4th place combo...");
        await processExternalCombo(testCombo);

        // 4. Verify DB
        const rows = await db.execute(sql`
      SELECT * FROM combo_stats WHERE blade = ${testCombo.blade}
    `);

        if (rows.rows.length === 0) {
            console.error("❌ Stats not found for test combo!");
        } else {
            const stat = rows.rows[0] as any;
            console.log("Stats found:", stat);

            // Expected points: 3 * 10 = 30
            // Expected quarti_posti: 1
            const points = Number(stat.punteggio_totale);
            const quarti = Number(stat.quarti_posti);

            if (points === 30 && quarti === 1) {
                console.log("✅ SUCCESS: 4th place points (30) and count (1) are correct!");
            } else {
                console.error(`❌ FAILURE: Expected 30 points and 1 4th place, got ${points} points and ${quarti} 4th place.`);
            }
        }

        // 5. Cleanup
        await db.execute(sql`DELETE FROM combo_stats WHERE blade = ${testCombo.blade}`);
        // Also clean up component stats if needed, but for verification this is enough
        await db.execute(sql`DELETE FROM blade_stats WHERE blade = ${testCombo.blade}`);
        console.log("Cleanup complete.");

    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        process.exit(0);
    }
}

verify4thPlacePoints();
