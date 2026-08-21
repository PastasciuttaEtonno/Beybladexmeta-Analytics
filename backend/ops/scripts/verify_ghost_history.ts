
import { db } from "../../src/db";
import { sql } from "drizzle-orm";

async function verify() {
    const nickname = "_Zein"; // Known ghost player from previous sync test
    console.log(`Verifying tournament history for ghost player: ${nickname}`);

    try {
        // We'll simulate the route logic here since it's hard to call the express app directly in this env without more setup
        const ghostToursQuery = await db.execute(sql`
      SELECT 
        c.tournament_id,
        c.data->>'tournament_name' as tournament_name,
        c.data->>'start_date' as date,
        (s->>'rank')::int as rank,
        COALESCE(
          (c.data->>'participants_count')::int, 
          (c.data->>'total_players')::int, 
          jsonb_array_length(c.data->'standings')
        ) as total_participants
      FROM challonge_match_results c,
      jsonb_array_elements(c.data->'standings') as s
      WHERE COALESCE(s->'participant'->>'name', s->>'name') = ${nickname}
      ORDER BY c.data->>'start_date' DESC
      LIMIT 50;
    `);

        console.log(`Found ${ghostToursQuery.rows.length} tournaments for ${nickname}`);
        if (ghostToursQuery.rows.length > 0) {
            ghostToursQuery.rows.forEach(r => {
                console.log(`- Tournament: ${r.tournament_name}, Rank: ${r.rank}, ID: ${r.tournament_id}`);
            });
            console.log("SUCCESS: Ghost player tournament history is accessible.");
        } else {
            console.log("FAILURE: No tournaments found for ghost player.");
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();
