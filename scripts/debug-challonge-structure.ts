
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
    try {
        console.log("Checking structure of first Challonge tournament...");

        const res = await db.execute(sql`SELECT data FROM challonge_match_results LIMIT 1`);

        if (res.rows.length === 0) {
            console.log("No challonge tournaments found.");
            return;
        }

        const data = res.rows[0].data as any;
        const keys = Object.keys(data);
        console.log("Top level keys:", keys);

        if (data.standings) {
            console.log("Has 'standings' array. Length:", data.standings.length);
            if (data.standings.length > 0) console.log("Sample standing:", JSON.stringify(data.standings[0], null, 2));
        } else {
            console.log("No 'standings' key.");
        }

        if (data.participants) {
            console.log("Has 'participants' array. Length:", data.participants.length);
            if (data.participants.length > 0) console.log("Sample participant:", JSON.stringify(data.participants[0], null, 2));
        } else {
            console.log("No 'participants' key.");
        }

        if (data.tournament) {
            console.log("Has 'tournament' object.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();
