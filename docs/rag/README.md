# Una pipeline RAG, dall'inizio alla fine

Questa cartella racconta come è stato costruito l'assistente di
Beybladexmeta Analytics: cosa fa, perché è fatto così, e — soprattutto — quali
decisioni si sono rivelate giuste e quali sbagliate solo dopo averle misurate.

È scritta per essere **studiata**, non consultata. Le sezioni non elencano
funzioni: raccontano un problema, le soluzioni possibili, quella scelta e cosa
è costata. Dove c'è un numero, quel numero è stato misurato su questo corpus e
il documento dice come; dove non c'è, il documento dice che è una scelta
arbitraria in attesa di dati.

> **Le doc sono in italiano** come i commenti del codice che descrivono. Il
> resto di `docs/` è in inglese e descrive parti più vecchie del progetto.

## Come leggerla

| | |
|---|---|
| [01 — La decisione centrale](01-la-decisione-centrale.md) | Cosa si indicizza e cosa no. È l'unica scelta che, se sbagliata, non si recupera più. |
| [02 — Il corpus](02-corpus.md) | Da dove viene il testo, come si taglia, come si tiene traccia di chi l'ha scritto. |
| [03 — Il recupero](03-recupero.md) | Tre rami, la fusione, il riconoscimento delle entità, e quando è giusto non rispondere. |
| [04 — La generazione](04-generazione.md) | Gli strumenti quantitativi, il prompt, l'astrazione del fornitore, il controllo delle citazioni. |
| [05 — La consegna](05-consegna.md) | Streaming SSE e interfaccia: perché l'attesa va riempita di informazione vera. |
| [06 — L'esercizio](06-esercizio.md) | Quote, telemetria, errori, valutazioni. Ciò che serve per lasciarlo acceso. |
| [07 — Gli errori che insegnano](07-errori-che-insegnano.md) | **Il capitolo più utile.** Ogni difetto trovato, la sua causa, e la regola generale che se ne ricava. |
| [08 — Costruirne una](08-costruirne-una.md) | La lista ordinata, se dovessi rifarlo da zero su un altro dominio. |

Chi ha fretta legga **01** e **07**: la prima decisione e gli errori. Il resto è
esecuzione.

## Cosa fa, in una riga

Risponde a domande su Beyblade X mescolando due cose che stanno in posti diversi:
le **meccaniche** dei pezzi, che sono testo, e i **numeri** dei tornei, che sono
righe di database. Cita sempre da dove viene ogni affermazione, e quando non sa
lo dice invece di inventare.

## Lo stato, in numeri veri

Misurati sul database di sviluppo il 2026-08-22.

| | |
|---|---|
| Documenti nella base di conoscenza | 682 (679 componenti, 3 regole) |
| Frammenti indicizzati | 1.940, tutti con embedding |
| Componenti nel registro | 171, con 271 alias |
| Righe dello snapshot meta | 755 |
| Casi nel golden set | 25 (19/20 valutabili passano, 5 in attesa di schede) |
| Test automatici | 158 |
| Moduli della pipeline | 15 file in `backend-py/app/lib/rag/` |

E un numero meno lusinghiero: delle 173 schede, **170 hanno la sezione
"Interazioni" ancora vuota**. Quella la scrive una persona, non uno script, ed è
il vero collo di bottiglia del progetto. Il codice è finito; il corpus no.

## Le tappe, da M0 a M7

Il lavoro è stato diviso in otto tappe. La divisione non è decorativa: ognuna
produce qualcosa di verificabile prima che inizi la successiva, e più di una
volta la verifica ha fatto tornare indietro.

| Tappa | Cosa produce | Dove leggerne |
|---|---|---|
| **M0** | Il piano e le scelte critiche decise *prima* di scrivere codice | [01](01-la-decisione-centrale.md) |
| **M1** | Schema, estensioni, registro dei componenti, migrazioni | [02](02-corpus.md) |
| **M2** | Il corpus: import dalle wiki, chunking, embedding | [02](02-corpus.md) |
| **M3** | Il recupero ibrido e l'astensione | [03](03-recupero.md) |
| **M4** | Strumenti quantitativi, prompt, generazione, guardia | [04](04-generazione.md) |
| **M5** | Streaming SSE | [05](05-consegna.md) |
| **M6** | Interfaccia | [05](05-consegna.md) |
| **M7** | Quote, telemetria, errori, valutazioni | [06](06-esercizio.md) |

## Provarla

Il sito di sviluppo gira in Docker. Dalla radice della repo:

```bash
docker compose -f docker-compose.dev.yml up -d
# frontend  http://localhost:8080
# chat      http://localhost:8080/chat
```

Servono due chiavi in `.env` alla radice: `VOYAGE_API_KEY` (embedding e re-rank)
e `OPENROUTER_API_KEY` **oppure** `ANTHROPIC_API_KEY`, con `CHAT_PROVIDER` a
`openrouter` o `claude`.

Le due valutazioni, da eseguire dopo ogni modifica che tocchi recupero o prompt:

```bash
python tools/eval_retrieval.py  --url "$DATABASE_URL" --provider voyage
python tools/eval_generation.py --url "$DATABASE_URL"
```

## Una nota sull'onestà dei numeri

Molti documenti su RAG mostrano architetture pulite senza dire cosa è costato
farle funzionare. Qui è il contrario: ogni soglia riporta la misura da cui esce,
ogni compromesso è dichiarato tale, e il capitolo 07 elenca per intero i difetti
trovati — compresi quelli che hanno reso il sistema inutile per un po' senza che
niente sembrasse rotto. Sono la parte che insegna di più.
