
import { db } from "../src/db";
import { comboStats } from "../src/shared/schema";
import { sql } from "drizzle-orm";

async function checkCombos() {
    console.log("Fetching top 20 combos from combo_stats...");
    try {
        const results = await db.execute(sql`
        SELECT 
          blade, assist_blade, ratchet, bit, lock_chip, season,
          primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale
        FROM combo_stats
        ORDER BY punteggio_totale DESC
        LIMIT 20
      `);
        console.table(results.rows);
    } catch (e) {
        console.error("Error fetching combos:", e);
    }
}

checkCombos().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
