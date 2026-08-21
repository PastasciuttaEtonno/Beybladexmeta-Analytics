-- Update FK on external_player_combos to reference cm_players instead of players

BEGIN;
--> statement-breakpoint

-- Drop old foreign key constraint (if exists) pointing to players.id
ALTER TABLE external_player_combos
  DROP CONSTRAINT IF EXISTS external_player_combos_player_id_players_id_fk;
--> statement-breakpoint

-- Add new foreign key constraint pointing to cm_players.id
ALTER TABLE external_player_combos
  ADD CONSTRAINT external_player_combos_player_id_cm_players_id_fk
  FOREIGN KEY (player_id) REFERENCES cm_players(id) ON DELETE CASCADE;
--> statement-breakpoint

COMMIT;
--> statement-breakpoint