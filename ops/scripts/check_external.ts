
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function checkExternal() {
    try {
        const febExternal = await db.execute(sql`
            SELECT tournament_id, tournament_date, platform
            FROM external_player_combos
            WHERE tournament_date >= '2026-02-01'
            LIMIT 5
        `);
        console.log("External matches >= 2026-02-01:", febExternal.rows.length);
        if (febExternal.rows.length > 0) {
            console.log("Sample:", JSON.stringify(febExternal.rows[0], null, 2));
        }

        const count = await db.execute(sql`SELECT count(*) FROM external_player_combos`);
        console.log("Total external combos:", count.rows[0].count);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkExternal();
