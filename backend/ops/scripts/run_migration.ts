import { db } from '../../src/db';
import { sql } from 'drizzle-orm';

async function main() {
    try {
        console.log('Adding platform column to external_player_combos...');
        await db.execute(sql`
      ALTER TABLE external_player_combos 
      ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'challengermode'
    `);
        console.log('Column added.');

        console.log('Updating unified_meta_view...');
        const query = `
      CREATE OR REPLACE VIEW unified_meta_view AS 
      SELECT 
        (((((external_player_combos.tournament_id)::text || '_'::text) || (external_player_combos.player_id)::text) || '_'::text) || external_player_combos.combo_number) AS unique_id, 
        external_player_combos.blade, 
        external_player_combos.assist_blade, 
        external_player_combos.ratchet, 
        external_player_combos."bit", 
        external_player_combos.lock_chip, 
        external_player_combos.placement AS rank, 
        (external_player_combos.tournament_date)::timestamp without time zone AS date, 
        external_player_combos.total_participants AS participant_count, 
        external_player_combos.platform, 
        external_player_combos.season 
      FROM external_player_combos 
      WHERE (external_player_combos.placement <= 3) 
      UNION ALL 
      SELECT 
        ('ch_'::text || r.id) AS unique_id, 
        r.blade, 
        r.assist_blade, 
        r.ratchet, 
        r."bit", 
        r.lock_chip, 
        r.rank, 
        ((m.data ->> 'start_date'::text))::timestamp without time zone AS date, 
        COALESCE(((m.data ->> 'total_players'::text))::integer, 0) AS participant_count, 
        'challonge'::text AS platform, 
        r.season 
      FROM (challonge_reported_combos r 
      JOIN challonge_match_results m ON ((r.tournament_id = m.tournament_id))) 
      WHERE (r.rank <= 3);
    `;
        await db.execute(sql.raw(query));
        console.log('View updated.');

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        process.exit(0);
    }
}

main();
