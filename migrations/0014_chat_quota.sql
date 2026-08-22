-- Quote e diagnosi: le due cose che mancavano per lasciare la chat esposta.
--
-- Ogni domanda costa denaro vero - embedding della query, re-rank, token del
-- modello - e finora nulla impediva a un ciclo di consumare l'intera dotazione
-- in pochi minuti. Il rate limit non e' una difesa dagli abusi in senso
-- classico: e' un tetto di spesa.
--
-- L'IP sta su chat_session e non su chat_message perche' e' proprieta' di chi
-- apre la conversazione, non del singolo messaggio; e sta qui, invece che in
-- una tabella a se', perche' il limite si calcola con la stessa query che gia'
-- serve a trovare la sessione.

BEGIN;

-- inet e non text: e' il tipo giusto, rifiuta i valori che non sono indirizzi,
-- e rende possibile ragionare per sottorete se un giorno servira'.
ALTER TABLE chat_session ADD COLUMN IF NOT EXISTS client_ip inet;

-- L'indice che serve al rate limit e a nient'altro: "quante sessioni ha aperto
-- questo IP nell'ultima ora". Parziale, perche' le righe senza IP non possono
-- rispondere alla domanda e occuperebbero l'indice per niente.
CREATE INDEX IF NOT EXISTS chat_session_ip_idx
    ON chat_session (client_ip, created_at DESC)
    WHERE client_ip IS NOT NULL;

-- La telemetria del recupero, accanto alla risposta che ha prodotto.
--
-- Senza, una risposta sbagliata non si diagnostica: `sources` dice QUALI
-- frammenti sono arrivati, non da quale ramo ne' con che punteggio ne' perche'
-- gli altri candidati sono stati scartati. La differenza fra "ha cercato male"
-- e "ha scritto male" e' l'unica che conta, e sono due problemi con soluzioni
-- opposte.
ALTER TABLE chat_message ADD COLUMN IF NOT EXISTS retrieval jsonb NOT NULL
    DEFAULT '{}'::jsonb;

-- Le astensioni sono la cosa da guardare per prima: astenersi troppo e'
-- inutile quanto non astenersi mai, e questo indice rende leggibile da che
-- parte si sta sbagliando.
CREATE INDEX IF NOT EXISTS chat_message_abstained_idx
    ON chat_message (created_at DESC) WHERE abstained;

COMMIT;
