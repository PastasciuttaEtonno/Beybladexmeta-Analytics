# 02 — Il corpus

> **M1 e M2.** Lo schema, il registro dei nomi, da dove viene il testo, come si
> taglia e come si tiene traccia di chi l'ha scritto.

Il recupero non può essere migliore del corpus su cui gira. È la parte meno
affascinante del lavoro e quella che decide l'esito.

## Lo schema

Migrazione `0010_rag_foundations.sql`. Quattro tabelle, e ognuna esiste per una
ragione precisa.

**`component_registry`** — l'anagrafe dei pezzi: 171 componenti, ciascuno con
slug, nome canonico e slot (blade, ratchet, bit, lock chip, assist blade). È la
verità sui nomi. Senza, ogni parte del sistema inventerebbe la propria idea di
come si chiama un pezzo.

**`component_alias`** — 271 modi diversi di scrivere quei 171 pezzi.
`WizardRod`, `Wizard Rod`, `wizard-rod`, `WizzardRod`. Serve perché le persone
scrivono come capita, e il recupero deve funzionare comunque.

**`kb_document`** — un documento per scheda: percorso, slug, tipo. 682 righe.

**`kb_chunk`** — i frammenti indicizzati: 1.940 righe, ciascuna con testo,
intestazione di contesto, `embedding vector(1024)`, `tsv` per la ricerca
lessicale, `code_tokens` per le designazioni esatte, e `meta` in jsonb.

### Due dettagli che sembrano minori e non lo sono

**`vector(1024)` e non `halfvec`.** A 1024 dimensioni si sta sotto il tetto di
2000 dimensioni che HNSW impone su `vector`. Il risparmio di `halfvec` sarebbe di
pochi megabyte sull'intero corpus. Servirebbe solo con un modello da 3072
dimensioni.

**HNSW e non IVFFlat.** IVFFlat va addestrato su dati già presenti e va
ricostruito quando il corpus cresce; HNSW no. Con un corpus che si riempie a
poco a poco — che è la situazione normale all'inizio — IVFFlat costringe a
ricordarsi di ricostruire l'indice, e chi se ne dimentica ottiene un recupero che
peggiora senza spiegazione. Parametri: `m = 16, ef_construction = 64`.

## Il registro viene prima di tutto

Ordine non negoziabile: **prima i nomi, poi il testo.** Il registro si popola con
`tools/seed_component_registry.py` leggendo i componenti che compaiono davvero
nei dati dei tornei. Il testo arriva dopo, e ogni scheda si aggancia a uno slug
che esiste già.

`tools/check_kb_registry.py` fa cinque controlli e va eseguito a ogni modifica.
Il più interessante rimisura, ogni volta, **la coppia di nomi più vicina del
registro** e fallisce se un pezzo nuovo la avvicina troppo. Il motivo sta nel
capitolo [03](03-recupero.md): una soglia misurata su dati che cambiano deve
accorgersi quando i dati cambiano.

## Da dove viene il testo

Tre origini, con tre livelli di fiducia diversi, e la differenza sopravvive fino
al prompt.

| Origine | Cosa dà | Come è trattata |
|---|---|---|
| Beyblade Wiki (Fandom) | Profili, specifiche, dati di formato | Fatto |
| beyblade.wiki | Descrizioni e valutazioni d'uso | **Opinione di terzi** |
| Statistiche del sito | Sinergie ricorrenti, generate da `tools/generate_synergies.py` | Fatto misurato |
| Joan, a mano | La sezione **Interazioni** | Fatto, la parte che vale di più |

### La provenienza non si perde per strada

Ogni blocco importato da una fonte esterna porta un marcatore nel Markdown:

```markdown
<!-- provenance: third-party | source: beyblade.wiki | kind: opinion -->
```

`chunking.py` lo legge e lo salva in `kb_chunk.meta`, e `prompt.py` lo rende
visibile al modello nel contesto. Il risultato è che una valutazione soggettiva
presa da un sito di terzi arriva alla risposta come *«secondo la scheda di
beyblade.wiki...»* e non come un fatto misurato.

È una riga di metadato che cambia il senso di una risposta. Senza, *"uno dei
migliori bit da stamina"* avrebbe la stessa autorevolezza di *"4.261 punti"*.

## Il chunking

Regola: **un frammento per sezione**, tagliando sulle intestazioni `##`, con
l'intestazione ripetuta dentro il testo indicizzato.

Perché per sezione e non a finestra fissa di N token: le schede hanno già una
struttura semantica — Profilo, Note di formato, Sinergie, Interazioni — e
tagliare a 512 token spezzerebbe una sinergia a metà frase. La struttura del
documento è informazione, e buttarla via per poi cercare di ricostruirla con
l'overlap è lavoro sprecato.

L'intestazione entra nel testo indicizzato (`context_header`) perché un
frammento che dice *"si abbina bene con i bit da attacco"* senza dire di quale
pezzo parla è inutile sia per l'embedding sia per chi legge la citazione.

L'hash del frammento si calcola sul testo **normalizzato**, così un ritocco di
spaziatura non fa ricalcolare l'embedding.

## L'ingest

`python -m app.lib.rag.cli ingest` fa quattro cose: legge i file, li taglia,
confronta gli hash, e calcola gli embedding **solo dei frammenti nuovi o
cambiati**. Un reingest a corpus fermo costa zero chiamate.

Embedding con `voyage-4`, a lotti di 64 con una pausa di 1,5 secondi. I 200
milioni di token gratuiti per allowance coprono circa 2.469 reindicizzazioni
complete di questo corpus: il costo degli embedding, qui, è di fatto zero.

## Cosa manca, e perché è il vero collo di bottiglia

Delle 173 schede, **170 hanno la sezione "Interazioni" vuota.** È la parte che
nessuno script può generare: cosa succede davvero quando quel pezzo incontra
quell'altro. Il codice è completo, il corpus no, e le risposte qualitative
resteranno povere finché quelle sezioni non si riempiono.

`tools/knowledge_priority.py` esiste per questo: ordina le schede da scrivere per
quanto compaiono nei dati dei tornei, così le prime ore di scrittura vanno sui
pezzi che la gente incontra davvero.

**La lezione:** in una pipeline RAG il lavoro di ingegneria finisce molto prima
del lavoro di contenuto, e il secondo non si può parallelizzare comprando
hardware. Se stai valutando quanto tempo serve, conta le schede da scrivere, non
i moduli da programmare.

---

Prossimo: [03 — Il recupero](03-recupero.md)
