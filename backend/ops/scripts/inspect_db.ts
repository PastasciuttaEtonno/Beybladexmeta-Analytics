
import { db } from "../../src/db";
import { challongeMatchResults } from "../../src/shared/schema";
import { sql } from "drizzle-orm";

async function inspect() {
    try {
        const result = await db.execute(sql`SELECT tournament_id, data FROM challonge_match_results LIMIT 1`);
        console.log("Found", result.rows.length, "rows");
        if (result.rows.length > 0) {
            const row = result.rows[0];
            console.log("Tournament ID:", row.tournament_id);
            const data = row.data as any;
            console.log("Data keys:", Object.keys(data));
            if (data.standings) {
                console.log("Standings count:", data.standings.length);
                console.log("First standing example:", JSON.stringify(data.standings[0], null, 2));
            } else if (data.participants) {
                console.log("Participants count:", data.participants.length);
                console.log("First participant example:", JSON.stringify(data.participants[0], null, 2));
            } else if (data.tournament && data.tournament.standings) {
                console.log("Tournament.standings count:", data.tournament.standings.length);
            } else {
                console.log("Neither standings nor participants found at root.");
                if (data.tournament) {
                    console.log("Tournament keys:", Object.keys(data.tournament));
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspect();
