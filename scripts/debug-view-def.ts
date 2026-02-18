
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
    try {
        console.log("Fetching view definitions...");

        const views = ['player_leaderboard', 'player_platform_stats'];

        for (const viewName of views) {
            console.log(`\n--- View: ${viewName} ---`);

            // Check materialized views
            const matRes = await db.execute(sql`
        SELECT definition FROM pg_matviews WHERE matviewname = ${viewName}
      `);

            if (matRes.rows.length > 0) {
                console.log("Type: Materialized View");
                console.log(matRes.rows[0].definition);
                continue;
            }

            // Check standard views
            const viewRes = await db.execute(sql`
        SELECT definition FROM pg_views WHERE viewname = ${viewName}
      `);
            if (viewRes.rows.length > 0) {
                console.log("Type: Standard View");
                console.log(viewRes.rows[0].definition);
                continue;
            }

            console.log("Not found.");
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        process.exit(0);
    }
}

main();
