
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
    console.log("Starting debug query...");
    try {
        const result = await db.execute(sql`
            SELECT 
                tournament_id,
                data->>'name' as nome_torneo,
                data->>'total_players' as total_players_json,
                data->>'participants_count' as participants_count_json,
                data->>'signups_count' as signups_count_json,
                jsonb_array_length(data->'standings') as array_length_standings
            FROM challonge_match_results
            WHERE tournament_id = 'dvbwd9sz';
        `);

        console.log("Query executed successfully.");
        console.log("---------------------------------------------------");
        console.log(JSON.stringify(result.rows, null, 2));
        console.log("---------------------------------------------------");
    } catch (e) {
        console.error("Error executing query:");
        console.error(e);
    }
    console.log("Exiting process...");
    process.exit(0);
}

main();
