-- I guasti della chat, dove puo' vederli chi deve ripararli.
--
-- All'utente arriva un messaggio fisso e un codice breve; qui c'e' tutto il
-- resto. La separazione e' il punto: un utente che chiede una combo si e' visto
-- rispondere col corpo JSON di OpenRouter, compresi il nome del fornitore e il
-- piano tariffario scelto.
--
-- Perche' una tabella e non solo il registro: `docker logs` lo legge chi ha
-- accesso alla macchina, e si perde a ogni ricreazione del container. Questa
-- tabella la interroga anche l'amministratore del sito, sopravvive ai riavvii,
-- e si puo' correlare con la sessione in cui il guasto e' avvenuto.

BEGIN;

CREATE TABLE IF NOT EXISTS chat_error (
    id          bigserial PRIMARY KEY,

    -- Il codice mostrato all'utente. Non e' un segreto e non apre niente: e'
    -- l'indice che trasforma "non funziona" in una riga precisa.
    reference   text NOT NULL UNIQUE,

    -- Il tipo dell'eccezione, non il testo: e' cosi' che si contano i guasti
    -- per categoria senza raggruppare per stringhe che cambiano.
    kind        text NOT NULL,

    -- Il dettaglio completo, quello che NON esce mai verso il client.
    detail      text NOT NULL DEFAULT '',
    traceback   text,

    -- Dove e' successo. La sessione e' nullable: un guasto puo' precedere la
    -- sua creazione.
    endpoint    text,
    session_id  bigint REFERENCES chat_session(id) ON DELETE SET NULL,
    client_ip   inet,

    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Le due interrogazioni che si faranno davvero: "cos'e' successo ultimamente"
-- e "trovami questo codice che mi ha dato un utente".
CREATE INDEX IF NOT EXISTS chat_error_recent_idx ON chat_error (created_at DESC);
CREATE INDEX IF NOT EXISTS chat_error_kind_idx ON chat_error (kind, created_at DESC);

COMMIT;
