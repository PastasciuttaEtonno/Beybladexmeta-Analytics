-- Spinosaurus and TyrannoRoar are two different Blades. The wiki import had
-- decided otherwise, and got it wrong.
--
-- 0017 and 0018 merged two pairs that really were one part each. This is the
-- third couple the same import produced and the opposite case: here the alias
-- is the defect, not the second registry row. The person who keeps the data
-- says they are distinct parts, so 'TyrannoRoar' has no business pointing at
-- Spinosaurus, and tools/check_kb_registry.py was right to keep failing.
--
-- The alias is not the whole damage. The Spinosaurus scheda was GENERATED from
-- TyrannoRoar's page (Blade_-_Roar_Tyranno) — 36,0 g, 60/28/12, G0284 /
-- BX-ORG03, the release dates, and the same numbers in the registry's
-- attributes. Every fact on it belongs to another Blade, and the corpus was
-- serving them under the name Spinosaurus.
--
-- So the facts go too. The scheda goes back to a scaffold in the repo, its
-- borrowed attributes are cleared here, and the document is superseded so
-- retrieval stops answering with them. An empty scheda is a gap someone can
-- see; a scheda full of another part's numbers reads exactly like knowledge.
-- Regenerating it needs the right wiki page, which nobody has yet.
--
-- After this, no two registry rows share a wiki_page:
--   SELECT attributes->>'wiki_page', count(*) FROM component_registry
--   WHERE attributes ? 'wiki_page' GROUP BY 1 HAVING count(*) > 1;   -- 0 rows

BEGIN;

DELETE FROM component_alias
WHERE alias_norm = 'tyrannoroar' AND slug = 'spinosaurus';

-- The part stays in the registry — it is real, and it is in the stats tables.
-- What goes is what was copied from the wrong page.
UPDATE component_registry
SET system = NULL,
    attributes = '{}'::jsonb,
    updated_at = now()
WHERE slug = 'spinosaurus';

-- Superseded rather than deleted, like the merged schede: a citation already
-- written still resolves to the text it showed, and retrieval, which joins ON
-- superseded_at IS NULL, stops reaching it. The ingest cannot do this itself —
-- a scheda that becomes a scaffold is skipped, not superseded, so its old
-- version would have stayed live and searchable.
UPDATE kb_document
SET superseded_at = now()
WHERE slug = 'spinosaurus' AND superseded_at IS NULL;

COMMIT;
