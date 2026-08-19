
import { db } from "../src/db";
import { sql } from "drizzle-orm";

async function main() {
    console.log("🔍 Simulating Scoring Logic CTE for tournament dvbwd9sz...");
    try {
        const result = await db.execute(sql`
      WITH challonge_raw AS (
        SELECT 
            COALESCE(s->'participant'->>'name', s->>'name') as raw_name,
            COALESCE(s->'participant'->>'id', s->>'id', s->>'name') as challonge_player_id,
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
                WHEN total_participants >= 33 AND total_participants <= 48 THEN
                CASE 
                    WHEN rank = 1 THEN 350
                    WHEN rank = 2 THEN 240
                    WHEN rank BETWEEN 33 AND 48 THEN 10
                    ELSE 0
                END
                WHEN total_participants >= 13 AND total_participants <= 16 THEN
                CASE 
                    WHEN rank = 1 THEN 200
                    ELSE 0
                END
                ELSE -1 -- Debug value for other tiers
            END as points_debug
        FROM challonge_raw
      )
      SELECT * FROM challonge_scored ORDER BY rank ASC LIMIT 5;
    `);

        console.log(JSON.stringify(result.rows, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
