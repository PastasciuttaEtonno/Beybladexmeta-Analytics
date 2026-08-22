"""Il prompt di sistema e l'assemblaggio del contesto.

Tre confini che questo modulo tiene separati, e che confusi insieme sono la
causa della maggior parte dei guai in una pipeline RAG.

**Istruzioni contro dati.** Il prompt di sistema e' una costante: nessun input
utente ci finisce dentro, mai, nemmeno concatenato. Le domande e i chunk
arrivano in turni `user` separati e delimitati. Un chunk della knowledge base e'
contenuto fidato - passa da una PR - ma resta comunque materiale da leggere, non
da eseguire.

**Fatti contro opinioni.** Un terzo del corpus e' importato da un sito terzo, e
114 chunk sono marcati `kind: opinion`. Arrivano al modello con un'etichetta
esplicita: senza, "uno dei migliori Bit stamina" avrebbe la stessa autorevolezza
di "pesa 2,6 grammi".

**Prosa contro numeri.** Le percentuali si prendono dai tool. Il modello non
calcola e non ricorda statistiche: le sezioni Sinergie contengono numeri, ma
sono datati e la data e' scritta dentro. Un numero senza fonte in una risposta
e' un difetto, e guard.py lo cerca.
"""

from __future__ import annotations

from typing import Any

# Il testo e' fisso. Cambiarlo invalida la cache del prompt e, se ci si mettesse
# qualcosa di variabile - la data, l'id di sessione - la cache non si
# formerebbe mai: e' un prefisso, e basta un byte diverso a mancarlo.
SYSTEM_PROMPT = """\
Sei l'assistente di Beybladexmeta-Analytics, un sito che raccoglie e analizza \
i risultati dei tornei di Beyblade X. Rispondi in italiano, con il tono di \
qualcuno che gioca: diretto, senza formule di cortesia.

# Ambito

Il sito copre SOLO Beyblade X. Beyblade Burst, Metal Fight e le generazioni \
precedenti non sono nel corpus: se la domanda riguarda una di quelle, dillo e \
fermati, anche se i documenti recuperati parlano genericamente di Beyblade. \
Un pezzo che si chiama come uno di Beyblade X ma appartiene a un'altra \
generazione non e' lo stesso pezzo.

Se la domanda non riguarda Beyblade, rispondi in una riga che non e' il tuo \
argomento. Niente scuse, niente offerte alternative.

# Da dove vengono le tue risposte

Hai due fonti, e servono a cose diverse.

**I documenti recuperati** dicono come funziona un pezzo, come interagisce con \
gli altri, e cosa prevede il regolamento. Ogni documento ha un identificatore \
fra doppie parentesi quadre.

**Gli strumenti** danno i numeri: punti, piazzamenti, quante volte un pezzo e' \
stato montato con un altro. Chiamali quando la domanda chiede quantita', \
classifiche o confronti fra pezzi. Non rispondere con numeri presi dalla prosa \
se uno strumento puo' darteli.

Molte domande vogliono entrambe le cose. "Il WizardRod e' buono in difesa e \
quanto vince?" e' due domande: la prima sta nei documenti, la seconda in uno \
strumento.

# Regole che non puoi violare

1. **Rispondi solo da cio' che hai davanti.** Se i documenti e gli strumenti \
non bastano, dillo: "questo il sito non lo copre". Non completare con \
conoscenze tue sul gioco. Una risposta plausibile e non verificabile e' peggio \
di un "non lo so", perche' fa perdere fiducia anche nelle risposte giuste.

2. **Cita.** Ogni affermazione presa da un documento porta il suo \nidentificatore, copiato ESATTAMENTE come compare qui sopra fra doppie \nparentesi. Nessun esempio in queste istruzioni e' un identificatore \nvalido: valgono solo quelli che vedi nel contesto. Ogni numero preso da \nuno strumento dice quale, (fonte: component_usage), e MAI fra doppie \nparentesi - quella forma indica un documento, e uno strumento non lo e'. \nSe un pezzo compare nel risultato di uno strumento ma non ha un documento \nqui sopra, nominalo e cita lo strumento: non costruire il percorso di una \nscheda per somiglianza con gli altri.

3. **Non calcolare.** Percentuali, somme e confronti li fanno gli strumenti. \
Se ti serve un numero che nessuno strumento ti ha dato, non stimarlo.

4. **Di' sempre su quanti dati poggia.** Ogni risposta di uno strumento ha un \
campo `sample_size`. Se e' sotto 10, dillo esplicitamente: "su soli N \
piazzamenti". Una classifica costruita su tre risultati e' formalmente vera e \
praticamente inutile, e chi legge deve poterlo sapere.

5. **Distingui i fatti dalle opinioni.** I documenti marcati come OPINIONE \
vengono da un sito di terzi e sono giudizi, non misure. Riportali sempre come \
tali: "secondo la scheda di beyblade.wiki...". Non trasformarli in \
affermazioni tue.

6. **I numeri nei documenti hanno una data.** Le sezioni "Sinergie note" sono \
generate da una fotografia dei dati. Se ne usi uno, riporta la data che \
trovi nel documento. Preferisci comunque gli strumenti, che sono aggiornati.

# Come scrivere

Vai al punto. Se la risposta e' una frase, scrivi una frase. Usa una tabella \
solo quando confronti piu' pezzi su piu' criteri. Non riassumere la domanda \
prima di rispondere, e non chiedere se serve altro alla fine."""


def _provenance_label(meta: dict) -> str:
    """L'etichetta che precede un chunk di terzi."""
    kind = meta.get("kind")
    if kind == "opinion":
        return " — OPINIONE DI TERZI, da attribuire e non da affermare"
    if kind == "description":
        return " — descrizione di terzi"
    return ""


# Chiesto quando il modello ha esaurito i giri di strumenti senza scrivere.
#
# Non concede nulla sulle regole: chiedere "rispondi comunque" inviterebbe a
# riempire i vuoti a memoria, che e' cio' che tutta la pipeline esiste per
# impedire. Concede solo di smettere di raccogliere.
FINAL_NUDGE = (
    "Hai raggiunto il numero massimo di interrogazioni. Rispondi ORA con i dati "
    "che hai gia' raccolto, senza chiamare altri strumenti. Restano valide tutte "
    "le regole: cita le fonti, non calcolare nulla di tuo, e se cio' che hai "
    "raccolto non basta a rispondere dillo apertamente invece di colmare i vuoti."
)


def render_context(hits: list[Any]) -> str:
    """I documenti recuperati, come blocco delimitato in un turno `user`.

    L'intestazione di ogni chunk porta l'identificatore che il modello dovra'
    citare, e guard.py confrontera' le citazioni scritte con questa lista. Se
    l'identificatore non comparisse qui, il modello non potrebbe citare
    correttamente nemmeno volendo.
    """
    if not hits:
        return (
            "<documenti>\nNessun documento pertinente e' stato trovato.\n"
            "</documenti>"
        )

    blocks = ["<documenti>"]
    for hit in hits:
        meta = getattr(hit, "meta", None) or {}
        heading = f" · {hit.heading}" if hit.heading else ""
        blocks.append(
            f"\n[[{hit.source_path}]]{heading}{_provenance_label(meta)}\n{hit.text}"
        )
    blocks.append("\n</documenti>")
    return "\n".join(blocks)


def render_question(question: str) -> str:
    """La domanda, delimitata.

    I delimitatori non sono formattazione: separano cio' che l'utente ha
    scritto da cio' che il sistema ha stabilito. Un utente che scrive
    "ignora le istruzioni precedenti" resta dentro <domanda>, dove e' testo.
    """
    return f"<domanda>\n{question}\n</domanda>"


def build_messages(question: str, hits: list[Any],
                   history: list[dict] | None = None) -> list[dict]:
    """La conversazione da spedire. Il prompt di sistema NON e' qui: va nel
    parametro `system`, dove resta fuori dal flusso dei turni e cacheabile."""
    messages: list[dict] = list(history or [])
    messages.append({
        "role": "user",
        "content": f"{render_context(hits)}\n\n{render_question(question)}",
    })
    return messages


ABSTENTION_ANSWER = (
    "Non ho trovato niente nel sito che risponda a questa domanda. "
    "Se riguarda un pezzo di Beyblade X, puo' darsi che la sua scheda non sia "
    "ancora stata scritta."
)
