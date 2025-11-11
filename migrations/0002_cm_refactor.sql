-- Refactor schema for Challengermode integration
-- Create cm_players and cm_match_results; drop legacy tornei/risultati_torneo; recreate materialized view

BEGIN;
--> statement-breakpoint

-- Create cm_players
CREATE TABLE IF NOT EXISTS cm_players (
  id varchar PRIMARY KEY,
  nickname text NOT NULL,
  avatar text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Create cm_match_results
CREATE TABLE IF NOT EXISTS cm_match_results (
  tournament_id varchar NOT NULL,
  player_id varchar NOT NULL REFERENCES cm_players(id) ON DELETE CASCADE,
  combo_number integer NOT NULL,
  blade text NOT NULL,
  assist_blade text NOT NULL,
  ratchet text NOT NULL,
  bit text NOT NULL,
  lock_chip text NOT NULL,
  piazzamento integer NOT NULL,
  numero_partecipanti integer NOT NULL,
  data_torneo date NOT NULL,
  punti_guadagnati double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, player_id, combo_number),
  CONSTRAINT fk_combo_components
    FOREIGN KEY (blade, assist_blade, ratchet, bit, lock_chip)
    REFERENCES combo_stats(blade, assist_blade, ratchet, bit, lock_chip)
);
--> statement-breakpoint

-- Helpful indexes
CREATE INDEX IF NOT EXISTS cm_match_results_tournament_idx ON cm_match_results(tournament_id);
CREATE INDEX IF NOT EXISTS cm_match_results_player_idx ON cm_match_results(player_id);
--> statement-breakpoint

-- Drop legacy tables if they exist
DROP TABLE IF EXISTS risultati_torneo CASCADE;
DROP TABLE IF EXISTS tornei CASCADE;
--> statement-breakpoint

-- Recreate materialized view for top components to ensure concurrent refresh
DROP MATERIALIZED VIEW IF EXISTS top_component_snapshot;
--> statement-breakpoint

CREATE MATERIALIZED VIEW top_component_snapshot AS
SELECT 'blade' AS component_type, blade AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale FROM blade_stats
UNION ALL
SELECT 'assist-blade' AS component_type, assist_blade AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale FROM assist_blade_stats
UNION ALL
SELECT 'ratchet' AS component_type, ratchet AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale FROM ratchet_stats
UNION ALL
SELECT 'bit' AS component_type, bit AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale FROM bit_stats
UNION ALL
SELECT 'lock-chip' AS component_type, lock_chip AS name, primi_posti, secondi_posti, terzi_posti, punteggio_totale FROM lock_chip_stats;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS top_component_snapshot_uidx ON top_component_snapshot(component_type, name);
--> statement-breakpoint

COMMIT;
--> statement-breakpoint