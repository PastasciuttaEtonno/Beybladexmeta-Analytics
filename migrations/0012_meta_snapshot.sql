-- meta_snapshot: classifiche meta prese da una fonte esterna, con la data.
--
-- Il foglio Google che alimenta le analisi del meta ha 754 combo con il numero
-- di vittorie, contro i 126 piazzamenti che unified_meta_view ricava dai tornei
-- importati. Su quella base le sinergie coprono 13 pezzi; su questa ne coprono
-- molti di piu'.
--
-- Perche' una tabella a se' e non righe in external_player_combos: il foglio non
-- e' una fonte primaria. E' una classifica GIA' AGGREGATA da qualcun altro, a
-- una certa data, con criteri suoi. Mescolarla ai piazzamenti grezzi
-- significherebbe non poter piu' dire da dove viene un numero, e sommare due
-- volte gli stessi tornei.
--
-- Ogni riga porta quindi la sua provenienza e il momento della cattura. Una
-- risposta costruita su questi dati puo' dire "al 21 agosto 2026, secondo il
-- foglio meta" invece di presentarli come lo stato corrente.

BEGIN;

CREATE TABLE IF NOT EXISTS meta_snapshot (
    id              bigserial PRIMARY KEY,

    -- Da dove viene e di quando e'. Insieme identificano una cattura.
    source          text NOT NULL,
    source_ref      text,
    captured_at     date NOT NULL,

    -- Le posizioni della combo, con i nomi canonici del registry dove
    -- corrispondono. over_blade e' registrato ma non fa parte dell'identita'
    -- di una combo: vedi knowledge/regole/identita-combo.md.
    lock_chip       text,
    over_blade      text,
    blade           text,
    assist_blade    text,
    ratchet         text,
    bit             text,

    -- Le due colonne che contano: il punteggio della fonte e la numerosita'
    -- su cui poggia. Senza la seconda il primo non e' interpretabile.
    points          numeric,
    win_count       integer,

    combo_rank      integer,
    rank_change     text,

    imported_at     timestamptz NOT NULL DEFAULT now()
);

-- Una cattura sostituisce interamente la precedente della stessa fonte: le
-- righe non si aggiornano una per una, si ricarica il foglio. L'indice serve a
-- trovare in fretta la cattura piu' recente.
CREATE INDEX IF NOT EXISTS meta_snapshot_source_idx
    ON meta_snapshot (source, captured_at DESC);

CREATE INDEX IF NOT EXISTS meta_snapshot_blade_idx ON meta_snapshot (blade);
CREATE INDEX IF NOT EXISTS meta_snapshot_ratchet_idx ON meta_snapshot (ratchet);
CREATE INDEX IF NOT EXISTS meta_snapshot_bit_idx ON meta_snapshot ("bit");

COMMIT;
