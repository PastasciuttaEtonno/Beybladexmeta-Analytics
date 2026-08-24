-- Five aliases that are not names but raw wikitext: '|ProductCode=CX-08' and
-- four like it.
--
-- The wiki importer read the infobox one parameter per line. Five pages put two
-- on the same line — |AKA=Flame|ProductCode=CX-08 — so the AKA value swallowed
-- the parameter after it and the fragment was inserted as a localized alias.
--
-- Nobody will ever type that string, so the alias could not help; it could only
-- hurt, and did. tools/check_kb_registry.py failed on it: 'productcodecx08' and
-- 'productcodecx09' score 0.778 against each other, above the 0.70 typo
-- threshold, which means the fuzzy fallback could resolve one part into another
-- through two strings that are not names of anything.
--
-- The same bug also LOST data, which is the half that was invisible: with
-- ProductCode eaten by AKA, Flame, Eclipse, Might, YellKong and GeneralGrievous
-- have no product_code in their attributes at all. The parser is fixed in
-- tools/import_wiki_facts.py in the same commit; re-running it against those
-- five pages will fill the codes in. That needs the network, so it is not part
-- of this migration.

BEGIN;

DELETE FROM component_alias WHERE alias LIKE '|%=%';

COMMIT;
