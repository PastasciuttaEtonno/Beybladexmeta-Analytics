-- Add scoring fields to external_player_combos and helpful index

BEGIN;
--> statement-breakpoint

ALTER TABLE external_player_combos
  ADD COLUMN IF NOT EXISTS placement integer,
  ADD COLUMN IF NOT EXISTS total_participants integer,
  ADD COLUMN IF NOT EXISTS tournament_date date;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS external_player_combos_combo_idx
  ON external_player_combos(blade, ratchet, bit);
--> statement-breakpoint

COMMIT;
--> statement-breakpoint