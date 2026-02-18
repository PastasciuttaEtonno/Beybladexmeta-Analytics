
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
    try {
        const views = ['player_leaderboard', 'player_platform_stats', 'unified_meta_view'];
        for (const view of views) {
            console.log(`\n--- Definition for ${view} ---`);
            // Check if it's a materialized view
            const matRes = await db.execute(sql`SELECT definition FROM pg_matviews WHERE matviewname = ${view}`);
            if (matRes.rows.length > 0) {
                console.log(matRes.rows[0].definition);
            } else {
                // Check if it's a standard view
                const viewRes = await db.execute(sql`SELECT definition FROM pg_views WHERE viewname = ${view}`);
                if (viewRes.rows.length > 0) {
                    console.log(viewRes.rows[0].definition);
                } else {
                    console.log("Not found in pg_matviews or pg_views");
                }
            }
        }
    } catch (error) {
        console.error("Error fetching view definitions:", error);
    } finally {
        process.exit(0);
    }
}

main();
