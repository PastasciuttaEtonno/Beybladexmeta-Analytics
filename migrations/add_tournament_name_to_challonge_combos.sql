-- Add tournament_name column to challonge_reported_combos table
ALTER TABLE challonge_reported_combos 
ADD COLUMN IF NOT EXISTS tournament_name TEXT;

-- Add index for faster tournament name lookups
CREATE INDEX IF NOT EXISTS idx_challonge_combos_tournament_name 
ON challonge_reported_combos(tournament_name);
