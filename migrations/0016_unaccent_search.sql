-- Il ramo lessicale smette di dipendere dagli accenti.
--
-- Il difetto, misurato: "Qual è la combo più usata adesso?" tornava ZERO
-- risultati, mentre "qual e la combo piu usata adesso?" ne tornava venti.
-- Stessa domanda, un accento di differenza, due esiti opposti - e la domanda
-- accentata e' quella che scrive una persona vera.
--
-- La causa non e' un caso limite. L'elenco delle parole vuote italiane di
-- Postgres contiene "più" ACCENTATO: dalla domanda accentata quel termine
-- sparisce, restano quattro lessemi, e nessun frammento del corpus ne combacia
-- due - che e' la soglia di copertura del ramo. Il corpus invece e' scritto
-- senza accenti (le schede generate usano "piu'", "puo'", "e'"), quindi li'
-- "piu" sopravvive come parola piena. Le due meta' del confronto non si
-- incontravano mai.
--
-- La cura e' normalizzare ENTRAMBE le parti allo stesso modo, prima dello
-- stemmer. Cosi' "più" e "piu" diventano lo stesso termine e vengono trattati
-- allo stesso modo su tutti e due i lati.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Una configurazione derivata da 'italian', con unaccent inserito prima dello
-- stemmer. Non si tocca 'italian': e' condivisa e cambiarla avrebbe effetti
-- fuori da qui.
DROP TEXT SEARCH CONFIGURATION IF EXISTS italian_unaccent CASCADE;
CREATE TEXT SEARCH CONFIGURATION italian_unaccent (COPY = italian);

ALTER TEXT SEARCH CONFIGURATION italian_unaccent
    ALTER MAPPING FOR hword, hword_part, word
    WITH unaccent, italian_stem;

-- La colonna generata va ricostruita: l'espressione fa parte della sua
-- definizione e non si puo' cambiare sul posto.
--
-- to_tsvector(regconfig, text) e' IMMUTABLE quando la configurazione e' una
-- costante, che e' cio' che rende possibile usarla in una colonna generata -
-- unaccent() da sola non lo e', e non basterebbe.
ALTER TABLE kb_chunk DROP COLUMN IF EXISTS tsv;
ALTER TABLE kb_chunk ADD COLUMN tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('italian_unaccent'::regconfig,
                coalesce(context_header, '') || ' ' || text)
) STORED;

CREATE INDEX IF NOT EXISTS kb_chunk_tsv_idx ON kb_chunk USING gin (tsv);

COMMIT;
