-- One blade, two names, the second time: 'T.Rex' and 'TyrannoBeat'.
--
-- Same signature as 0017 and confirmed by the owner of the data. Both schede
-- come from the SAME wiki page (Blade_-_TyrannoBeat), both say 37,0 g, both
-- 65/30/5, both BX-31 (Takara Tomy) / G1542 (Hasbro), and both already carry
-- 'Beat Tyranno' as a localized alias — which is what made the alias point at
-- two registry rows at once.
--
-- TyrannoBeat survives, and again the data chose: 2 first places and 2 thirds
-- in blade_stats, 18 combos and 22 wins in meta_snapshot, 5 rows in
-- combo_stats, 4 in cm_match_results. T.Rex has an all-zero blade_stats row and
-- nothing else anywhere — the row that put it in the registry, since the seeder
-- derives the registry from the stats tables.
--
-- NOT merged here, deliberately: 'Spinosaurus' and 'TyrannoRoar' look like the
-- same pair from the wiki, but the person who keeps the data says they are two
-- parts. tools/check_kb_registry.py therefore still reports that couple; if
-- they really are distinct, the fix is the opposite of this file — remove the
-- localized alias that the wiki import put on Spinosaurus, because that alias
-- is then simply wrong.

BEGIN;

-- Counters first, per season, so this is correct against a database that has
-- recorded placements under the losing name.
INSERT INTO blade_stats (blade, season, primi_posti, secondi_posti, terzi_posti,
                         quarti_posti, punteggio_totale)
SELECT 'TyrannoBeat', season, primi_posti, secondi_posti, terzi_posti,
       quarti_posti, punteggio_totale
FROM blade_stats
WHERE blade = 'T.Rex'
ON CONFLICT (blade, season) DO UPDATE SET
    primi_posti      = blade_stats.primi_posti      + EXCLUDED.primi_posti,
    secondi_posti    = blade_stats.secondi_posti    + EXCLUDED.secondi_posti,
    terzi_posti      = blade_stats.terzi_posti      + EXCLUDED.terzi_posti,
    quarti_posti     = blade_stats.quarti_posti     + EXCLUDED.quarti_posti,
    punteggio_totale = blade_stats.punteggio_totale + EXCLUDED.punteggio_totale;

DELETE FROM blade_stats WHERE blade = 'T.Rex';

INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season,
                         primi_posti, secondi_posti, terzi_posti, quarti_posti,
                         punteggio_totale)
SELECT 'TyrannoBeat', assist_blade, ratchet, bit, lock_chip, season,
       primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale
FROM combo_stats
WHERE blade = 'T.Rex'
ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip, season) DO UPDATE SET
    primi_posti      = combo_stats.primi_posti      + EXCLUDED.primi_posti,
    secondi_posti    = combo_stats.secondi_posti    + EXCLUDED.secondi_posti,
    terzi_posti      = combo_stats.terzi_posti      + EXCLUDED.terzi_posti,
    quarti_posti     = combo_stats.quarti_posti     + EXCLUDED.quarti_posti,
    punteggio_totale = combo_stats.punteggio_totale + EXCLUDED.punteggio_totale;

DELETE FROM combo_stats WHERE blade = 'T.Rex';

-- One result per row, no primary key containing the blade: a rename is enough.
UPDATE meta_snapshot             SET blade = 'TyrannoBeat' WHERE blade = 'T.Rex';
UPDATE cm_match_results          SET blade = 'TyrannoBeat' WHERE blade = 'T.Rex';
UPDATE challonge_reported_combos SET blade = 'TyrannoBeat' WHERE blade = 'T.Rex';
UPDATE external_player_combos    SET blade = 'TyrannoBeat' WHERE blade = 'T.Rex';
UPDATE favorite_combos           SET blade = 'TyrannoBeat' WHERE blade = 'T.Rex';
UPDATE favorite_deck_combos      SET blade = 'TyrannoBeat' WHERE blade = 'T.Rex';

-- The duplicate scheda is superseded, not deleted: a citation already written
-- still resolves, while retrieval (which joins ON superseded_at IS NULL) cannot
-- reach it. The slug moves because kb_document.slug is ON DELETE RESTRICT.
UPDATE kb_document
SET slug = 'tyranno-beat',
    superseded_at = COALESCE(superseded_at, now())
WHERE slug = 't-rex';

-- The name survives as an alias. 'trex' is what kb_norm() makes of 'T.Rex', the
-- dot being punctuation like any other.
INSERT INTO component_alias (alias_norm, alias, slug, kind)
VALUES ('trex', 'T.Rex', 'tyranno-beat', 'localized')
ON CONFLICT DO NOTHING;

-- Cascades to component_alias, which is what removes the second 'Beat Tyranno'
-- row and with it the collision.
DELETE FROM component_registry WHERE slug = 't-rex';

REFRESH MATERIALIZED VIEW top_component_snapshot;

COMMIT;
