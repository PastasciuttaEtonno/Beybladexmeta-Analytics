
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkDates() {
    try {
        // Check for matches in Feb 2026 or later
        const febMatches = await db.execute(sql`
            SELECT tournament_id, data_torneo
            FROM cm_match_results
            WHERE data_torneo >= '2026-02-01'
            LIMIT 5
        `);
        console.log("Matches >= 2026-02-01:", febMatches.rows.length);
        if (febMatches.rows.length > 0) {
            console.log("Sample:", JSON.stringify(febMatches.rows[0], null, 2));
        }

        // Check for matches in Jan 2026
        const janMatches = await db.execute(sql`
            SELECT tournament_id, data_torneo
            FROM cm_match_results
            WHERE data_torneo >= '2026-01-01' AND data_torneo < '2026-02-01'
            LIMIT 5
        `);
        console.log("Matches in Jan 2026:", janMatches.rows.length);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkDates();
