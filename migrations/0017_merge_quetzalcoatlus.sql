-- One blade, two names: 'Quetzalcoatlus' and 'PteraSwing' are the same part.
--
-- Not a judgement call — the two schede say it themselves. Both were generated
-- from the SAME wiki page (Blade_-_Talon_Ptera), and every fact on them is
-- identical: 34,3 g, stats 27/23/50, right spin, product codes G0195 (Hasbro) /
-- UX-10 (Takara Tomy) / BX-ORG02. Two rows in component_registry, one blade.
--
-- The visible symptom was tools/check_kb_registry.py refusing to pass: the
-- alias 'PteraSwing' pointed at BOTH slugs, so the trigram fallback scored two
-- registry entries at 1.000 against each other. The invisible one is the same
-- as 0011's — a placement recorded under one name counts towards a different
-- row than the same part under the other, and neither half is right.
--
-- PteraSwing is the name that stays, and the data chose it, not taste: the meta
-- sheet writes PteraSwing (three combos in meta_snapshot), while Quetzalcoatlus
-- appears in no data table at all except one all-zero row in blade_stats — and
-- that row is the whole reason it is in the registry, because
-- tools/seed_component_registry.py derives the registry from the stats tables.
--
-- Written as a merge rather than a delete, for the reason 0011 gives: this
-- database is not production, and production may have recorded placements under
-- the other name. Summing first is correct in both.

BEGIN;

-- Fold the counters into the surviving name, per season.
INSERT INTO blade_stats (blade, season, primi_posti, secondi_posti, terzi_posti,
                         quarti_posti, punteggio_totale)
SELECT 'PteraSwing', season, primi_posti, secondi_posti, terzi_posti,
       quarti_posti, punteggio_totale
FROM blade_stats
WHERE blade = 'Quetzalcoatlus'
ON CONFLICT (blade, season) DO UPDATE SET
    primi_posti      = blade_stats.primi_posti      + EXCLUDED.primi_posti,
    secondi_posti    = blade_stats.secondi_posti    + EXCLUDED.secondi_posti,
    terzi_posti      = blade_stats.terzi_posti      + EXCLUDED.terzi_posti,
    quarti_posti     = blade_stats.quarti_posti     + EXCLUDED.quarti_posti,
    punteggio_totale = blade_stats.punteggio_totale + EXCLUDED.punteggio_totale;

DELETE FROM blade_stats WHERE blade = 'Quetzalcoatlus';

-- Same shape for the per-combo counters. The primary key is six columns here,
-- so two combos identical except for the blade's name collapse into one.
INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season,
                         primi_posti, secondi_posti, terzi_posti, quarti_posti,
                         punteggio_totale)
SELECT 'PteraSwing', assist_blade, ratchet, bit, lock_chip, season,
       primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale
FROM combo_stats
WHERE blade = 'Quetzalcoatlus'
ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip, season) DO UPDATE SET
    primi_posti      = combo_stats.primi_posti      + EXCLUDED.primi_posti,
    secondi_posti    = combo_stats.secondi_posti    + EXCLUDED.secondi_posti,
    terzi_posti      = combo_stats.terzi_posti      + EXCLUDED.terzi_posti,
    quarti_posti     = combo_stats.quarti_posti     + EXCLUDED.quarti_posti,
    punteggio_totale = combo_stats.punteggio_totale + EXCLUDED.punteggio_totale;

DELETE FROM combo_stats WHERE blade = 'Quetzalcoatlus';

-- The tables that record one result each: nothing to sum, and none of their
-- primary keys contains the blade, so a rename cannot collide.
UPDATE meta_snapshot             SET blade = 'PteraSwing' WHERE blade = 'Quetzalcoatlus';
UPDATE cm_match_results          SET blade = 'PteraSwing' WHERE blade = 'Quetzalcoatlus';
UPDATE challonge_reported_combos SET blade = 'PteraSwing' WHERE blade = 'Quetzalcoatlus';
UPDATE external_player_combos    SET blade = 'PteraSwing' WHERE blade = 'Quetzalcoatlus';
UPDATE favorite_combos           SET blade = 'PteraSwing' WHERE blade = 'Quetzalcoatlus';
UPDATE favorite_deck_combos      SET blade = 'PteraSwing' WHERE blade = 'Quetzalcoatlus';
-- Not the assist_blade columns: this is a blade, and a blade cannot sit in the
-- assist slot. A rename there would be renaming a different part.

-- The knowledge base. The duplicate scheda is superseded rather than deleted,
-- which is the rule the corpus already follows: an answer that cited
-- knowledge/blades/quetzalcoatlus.md last month still resolves to the text it
-- actually showed. Superseded rows are invisible to retrieval — search.py joins
-- ON superseded_at IS NULL — so nothing can come back from them.
--
-- The slug has to move too, because kb_document.slug is ON DELETE RESTRICT and
-- the registry row is about to go.
UPDATE kb_document
SET slug = 'ptera-swing',
    superseded_at = COALESCE(superseded_at, now())
WHERE slug = 'quetzalcoatlus';

-- The name itself survives, as an alias. Someone who knows the blade as
-- Quetzalcoatlus asks about Quetzalcoatlus, and entity linking has to keep
-- resolving it — to one part now instead of two.
INSERT INTO component_alias (alias_norm, alias, slug, kind)
VALUES ('quetzalcoatlus', 'Quetzalcoatlus', 'ptera-swing', 'localized')
ON CONFLICT DO NOTHING;

-- component_alias cascades from here, which is what removes the duplicated
-- 'PteraSwing' row that made check_kb_registry fail.
DELETE FROM component_registry WHERE slug = 'quetzalcoatlus';

-- Reads blade_stats, so it still holds the old name until rebuilt. Not
-- CONCURRENTLY: that needs a unique index this view does not have, and this is
-- inside the migration's transaction anyway.
REFRESH MATERIALIZED VIEW top_component_snapshot;

COMMIT;
