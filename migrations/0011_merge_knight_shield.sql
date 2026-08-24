-- One blade, two spellings: 'KnightShield' and 'Knight Shield' both exist in
-- blade_stats. Every other blade in the table is CamelCase with no space
-- (KnightLance, KnightMail, AeroPegasus), so the spaced form is the typo.
--
-- The visible symptom is small: /api/components does GROUP BY blade, so the
-- blade filter lists the part twice, one entry right under the other. The
-- invisible one matters more — any placement recorded against the spaced form
-- counts towards a different row than the same part under its real name, so
-- its statistics are split in two and neither half is right.
--
-- Found while seeding component_registry: the registry keys on the canonical
-- name, so two spellings produced two parts and tools/check_kb_registry.py
-- refused to pass.
--
-- Written as a merge rather than a delete on purpose. In the development
-- database both rows are all zeros and nothing would be lost either way, but
-- production is not this database and may have recorded placements against the
-- typo. Summing first means this is correct in both, and correct if it is ever
-- re-run against a third.

BEGIN;

-- Fold the counters of the misspelled row into the real one, per season.
-- (blade, season) is the primary key, so the conflict target is the pair.
INSERT INTO blade_stats (blade, season, primi_posti, secondi_posti, terzi_posti,
                         quarti_posti, punteggio_totale)
SELECT 'KnightShield', season, primi_posti, secondi_posti, terzi_posti,
       quarti_posti, punteggio_totale
FROM blade_stats
WHERE blade = 'Knight Shield'
ON CONFLICT (blade, season) DO UPDATE SET
    primi_posti      = blade_stats.primi_posti      + EXCLUDED.primi_posti,
    secondi_posti    = blade_stats.secondi_posti    + EXCLUDED.secondi_posti,
    terzi_posti      = blade_stats.terzi_posti      + EXCLUDED.terzi_posti,
    quarti_posti     = blade_stats.quarti_posti     + EXCLUDED.quarti_posti,
    punteggio_totale = blade_stats.punteggio_totale + EXCLUDED.punteggio_totale;

DELETE FROM blade_stats WHERE blade = 'Knight Shield';

-- The registry is derived from blade_stats, so it carries the same duplicate
-- wherever the seed has already run. Harmless where it has not.
DELETE FROM component_alias
WHERE slug IN (SELECT slug FROM component_registry
               WHERE slot = 'blade' AND canonical_name = 'Knight Shield');

DELETE FROM component_registry
WHERE slot = 'blade' AND canonical_name = 'Knight Shield';

-- top_component_snapshot reads blade_stats, so it still holds both spellings
-- until it is rebuilt. Not CONCURRENTLY: that needs a unique index the view
-- does not have, and this runs inside the migration's transaction anyway.
REFRESH MATERIALIZED VIEW top_component_snapshot;

COMMIT;
