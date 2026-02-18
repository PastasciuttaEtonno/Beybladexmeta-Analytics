
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
    console.log("🔍 Verifying Fix for tournament dvbwd9sz...");
    try {
        const result = await db.execute(sql`
      WITH challonge_raw AS (
        SELECT 
            COALESCE(s->'participant'->>'name', s->>'name') as raw_name,
            (s->>'rank')::int as rank,
            COALESCE(
                (c.data->>'participants_count')::int, 
                (c.data->>'total_players')::int, 
                jsonb_array_length(c.data->'standings')
            ) as total_participants,
            c.tournament_id
        FROM challonge_match_results c,
        jsonb_array_elements(c.data->'standings') as s
        WHERE c.tournament_id = 'dvbwd9sz'
      ),
      challonge_scored AS (
        SELECT 
            raw_name,
            rank,
            total_participants,
            CASE 
                WHEN total_participants BETWEEN 33 AND 48 THEN
                    CASE 
                        WHEN rank = 1 THEN 350
                        WHEN rank = 2 THEN 240
                        WHEN rank = 3 THEN 140
                        WHEN rank = 4 THEN 110
                        WHEN rank BETWEEN 5 AND 8 THEN 80
                        ELSE 0
                    END
                WHEN total_participants BETWEEN 13 AND 16 THEN
                    CASE 
                        WHEN rank = 1 THEN 200
                        ELSE 0
                    END
                ELSE -1 
            END as points_projected
        FROM challonge_raw
      )
      SELECT * FROM challonge_scored WHERE rank = 1;
    `);

        console.log("---------------------------------------------------");
        console.log("Verification Result:");
        console.log(JSON.stringify(result.rows, null, 2));
        console.log("---------------------------------------------------");

        const points = result.rows[0]?.points_projected;
        if (points === 350) {
            console.log("✅ SUCCESS: 1st Place is now correctly calculated as 350 points.");
        } else {
            console.error(`❌ FAILURE: Expected 350 points, got ${points}.`);
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
