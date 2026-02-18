
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { playerRegionalStats } from "../shared/schema";

async function main() {
    try {
        process.stdout.write("start\n");
        console.log("Checking player_regional_stats for Challonge data...");

        // Test basic query first
        const count = await db.execute(sql`SELECT count(*) as c FROM player_regional_stats`);
        console.log(`Total rows in player_regional_stats: ${count.rows[0].c}`);

        const stats = await db.execute(sql`
        SELECT * FROM player_regional_stats 
        WHERE platform = 'challonge' 
        LIMIT 5
    `);

        console.error(`Found ${stats.rows.length} rows for Challonge.`);
        if (stats.rows.length > 0) {
            console.error("Sample Data:", JSON.stringify(stats.rows[0]));
        } else {
            console.error("No data found for platform 'challonge'.");

            // Check if raw data exists
            const raw = await db.execute(sql`SELECT count(*) as count FROM challonge_match_results`);
            console.error(`Raw challonge_match_results count: ${raw.rows[0].count}`);
        }

    } catch (error) {
        console.error("Error:", error);
    }
}

main().then(() => {
    setTimeout(() => {
        process.exit(0);
    }, 2000);
});
