
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";

async function main() {
    try {
        let output = "";
        const views = ['player_leaderboard', 'player_platform_stats', 'unified_meta_view'];
        for (const view of views) {
            output += `\n--- Definition for ${view} ---\n`;
            const matRes = await db.execute(sql`SELECT definition FROM pg_matviews WHERE matviewname = ${view}`);
            if (matRes.rows.length > 0) {
                output += matRes.rows[0].definition;
            } else {
                const viewRes = await db.execute(sql`SELECT definition FROM pg_views WHERE viewname = ${view}`);
                if (viewRes.rows.length > 0) {
                    output += viewRes.rows[0].definition;
                } else {
                    output += "Not found in pg_matviews or pg_views";
                }
            }
            output += "\n";
        }
        fs.writeFileSync("view_defs.txt", output);
        console.log("View definitions saved to view_defs.txt");
    } catch (error) {
        console.error("Error fetching view definitions:", error);
    } finally {
        process.exit(0);
    }
}

main();
