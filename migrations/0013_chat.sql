-- Le conversazioni: cronologia, e materiale per capire cosa sta sbagliando.
--
-- Non si conservano per nostalgia. Servono a tre cose che senza di loro non si
-- possono fare:
--
--   * capire perche' una risposta e' venuta male. Con le fonti recuperate e i
--     tool chiamati registrati accanto al testo, si distingue "il recupero ha
--     dato i chunk sbagliati" da "il recupero era giusto e il modello ha
--     risposto male" - due problemi con soluzioni opposte;
--   * far crescere il golden set con domande vere. Le domande che immagino io
--     non sono quelle che fara' la gente, e le seconde valgono di piu';
--   * accorgersi di un abuso, e sapere quanto e' costato.
--
-- `sources` e `tool_calls` sono jsonb e non tabelle a se': non ci si interroga
-- sopra con join, si leggono insieme al messaggio che descrivono.

BEGIN;

CREATE TABLE IF NOT EXISTS chat_session (
    id              bigserial PRIMARY KEY,
    -- Nullable: una sessione anonima resta possibile. Il rate limit e il
    -- budget si applicano comunque, per sessione.
    --
    -- text e non integer: users.id e' varchar in questo schema. Un tipo diverso
    -- non fallirebbe piu' avanti in modo sottile - la chiave esterna lo rifiuta
    -- subito - ma vale la pena dirlo, perche' e' l'unica tabella che non usa un
    -- intero come chiave.
    user_id         text REFERENCES users(id) ON DELETE SET NULL,
    title           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_session_user_idx
    ON chat_session (user_id, last_message_at DESC);


CREATE TABLE IF NOT EXISTS chat_message (
    id              bigserial PRIMARY KEY,
    session_id      bigint NOT NULL REFERENCES chat_session(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,

    -- Cosa ha visto il modello quando ha scritto questa risposta. Senza,
    -- rileggere una risposta sbagliata non dice niente: il corpus nel
    -- frattempo e' cambiato.
    sources         jsonb NOT NULL DEFAULT '[]'::jsonb,
    tool_calls      jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Vero quando il sistema ha risposto "non lo so". Va misurato: astenersi
    -- troppo e' inutile quanto non astenersi mai, e senza contarlo non si sa
    -- da che parte si sta sbagliando.
    abstained       boolean NOT NULL DEFAULT false,

    -- Citazioni che il modello ha scritto ma che non corrispondono a nessuna
    -- fonte iniettata. Dovrebbero essere sempre zero; se non lo sono, questa
    -- colonna e' come lo si scopre.
    phantom_citations jsonb NOT NULL DEFAULT '[]'::jsonb,

    model           text,
    input_tokens    integer,
    output_tokens   integer,
    latency_ms      integer,

    -- Pollice su/giu' dell'utente: -1, 0, 1. E' il canale piu' economico per
    -- scoprire quali domande vanno male davvero.
    feedback        smallint NOT NULL DEFAULT 0 CHECK (feedback BETWEEN -1 AND 1),

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_message_session_idx
    ON chat_message (session_id, created_at);

-- Le due query di diagnosi che si faranno davvero: "quali risposte hanno preso
-- pollice giu'" e "quali hanno citato fonti inesistenti".
CREATE INDEX IF NOT EXISTS chat_message_feedback_idx
    ON chat_message (feedback) WHERE feedback <> 0;

CREATE INDEX IF NOT EXISTS chat_message_phantom_idx
    ON chat_message (created_at) WHERE phantom_citations <> '[]'::jsonb;

COMMIT;
