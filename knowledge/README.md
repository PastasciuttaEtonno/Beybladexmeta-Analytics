# Knowledge base

La parte qualitativa del sistema RAG: come funziona un pezzo, come interagisce
con gli altri, cosa dice il regolamento. **Le statistiche non stanno qui.** I
numeri si leggono da `unified_meta_view` e dalle tabelle `*_stats` con query
parametriche, perché un indice vettoriale non sa ordinare, sommare né
confrontare — e una risposta che inventa una percentuale fa più danno di una che
dice "non lo so".

## Struttura

```
knowledge/
  blades/          <slug>.md      una scheda per Blade
  assist-blades/   <slug>.md
  ratchets/        <slug>.md
  bits/            <slug>.md
  lock-chips/      <slug>.md
```

Lo slug è quello di `component_registry`. I file sono stati generati da
`tools/scaffold_knowledge.py`, che li riscrive solo se mancano: rilanciarlo
dopo l'uscita di pezzi nuovi aggiunge i file mancanti e non tocca il lavoro
già fatto.

## Formato

```markdown
---
id: blade.wizard-rod
slug: wizard-rod          # deve esistere in component_registry
type: component           # component | rule | guide | meta_snapshot
slot: blade               # blade | assist_blade | ratchet | bit | lock_chip
canonical_name: "WizardRod"   # identico byte-per-byte al valore in blade_stats
aliases: ["WizardRod"]
system: UX                # BX | UX | CX
lang: it
status: draft             # draft | review | ok
doc_version: 1
sources: []               # da dove viene l'informazione
---

# WizardRod

Una riga di riassunto, prima di qualunque `##`. Viene indicizzata.

## Profilo
## Interazioni
## Sinergie note
## Note di formato
```

Due campi meritano attenzione più degli altri:

- **`canonical_name`** deve coincidere carattere per carattere con il valore
  nelle tabelle stats. Se diverge, il join restituisce zero righe, il modello
  risponde lo stesso basandosi solo sulla prosa, e nessun altro controllo se ne
  accorge. `tools/check_kb_registry.py` esiste per questo e fallisce con exit 1.
- **`sources`** è il campo che permette a qualcun altro di verificare. Una
  scheda senza fonti è un'opinione con una formattazione autorevole.

## Come vengono spezzate le schede

Un chunk per heading `##`. Le sezioni sono scritte in modo che una risposta a
una domanda stia dentro una sezione sola: è il motivo per cui i titoli sono gli
stessi in tutte le schede.

Conseguenze pratiche di come funziona l'ingest:

- una sezione che contiene ancora solo `<!-- da scrivere -->` viene **saltata**.
  Una scheda intera non scritta non produce nulla e non costa nulla;
- il titolo `# Nome` non diventa un chunk: ripete `canonical_name`, che è già
  nell'intestazione di contesto di ogni chunk;
- l'hash è calcolato sul testo normalizzato, quindi riformattare un paragrafo o
  cambiare i fine-riga non invalida niente. Modificare **una** sezione di una
  scheda da otto rigenera un embedding, non otto;
- designazioni come `9-60` e nomi di pezzi vengono estratti come `code_tokens`
  ed è così che la ricerca li tratta: match esatto, non vicinanza semantica.
  Per un embedder `9-60` e `1-60` sono quasi la stessa cosa; per chi gioca sono
  due pezzi con statistiche opposte.

## Comandi

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/beyblade_tracker

python tools/scaffold_knowledge.py --url "$DATABASE_URL" --apply   # stub mancanti
python tools/check_kb_registry.py  --url "$DATABASE_URL"           # nomi allineati?

cd backend-py
python -m app.lib.rag.cli ingest --provider voyage
python -m app.lib.rag.cli search "come si comporta il 9-60"
python -m app.lib.rag.cli stats
```

`--provider deterministic` è il default e non richiede chiave API: produce
vettori da un hash, quindi la pipeline gira per intero ma la similarità non
significa nulla. Serve a verificare che l'ingest, la deduplica e le query
funzionino, non a giudicare la qualità di una risposta. Per quello serve
`--provider voyage` e `VOYAGE_API_KEY`.

## Scrivere una scheda

Il collo di bottiglia del progetto è questo, non il codice.

**I file esistono già.** Non se ne creano di nuovi: si aprono quelli in
`knowledge/<slot>/<slug>.md`, si sostituisce `<!-- da scrivere -->` con il
testo, si salva. Il frontmatter è già compilato e non va toccato, tranne
`system:` (BX/UX/CX) che lo scaffold non poteva sapere e `status:` quando la
scheda è stata riletta.

**Non serve riempire tutte le sezioni.** Una scheda con il solo `Profilo`
scritto viene già indicizzata ed è già utile; le sezioni rimaste segnaposto
vengono semplicemente saltate. Meglio dieci schede con una sezione buona che una
scheda completa e nove vuote.

### Cosa va in ogni sezione

Ogni titolo è una domanda. Rispondere a quella, e fermarsi.

| Sezione | La domanda a cui risponde |
|---|---|
| **Profilo** | Cos'è questo pezzo e cosa fa? Forma, peso relativo, altezza, verso di rotazione, a quale stile di gioco serve. Chi legge non sa nulla del pezzo. |
| **Interazioni** | Come si comporta *contro* gli altri? Contro l'attacco, contro la resistenza, contro la difesa. È qui che sta il valore: sono le cose che non si leggono da una statistica. |
| **Sinergie note** | Con cosa si monta bene, e **perché**. Il perché è la parte che conta: "va bene con 9-60" senza motivo è un dato, non conoscenza. |
| **Note di formato** | Legalità, disponibilità, differenze fra sistemi, cambi di regolamento che lo riguardano. |

### Quattro regole

1. **Una sezione, una domanda.** Se ne risponde a due, sono due sezioni: il
   chunking è per titolo, quindi una sezione che parla di due cose viene
   recuperata per una domanda e ne risponde a un'altra.
2. **Nominare i pezzi per esteso**, mai "questo pezzo" o "l'altro". I nomi
   diventano `code_tokens` ed è ciò che rende la scheda trovabile. Scrivere
   `WizardRod`, non "il blade di cui sopra".
3. **Niente numeri di torneo nella prosa.** Percentuali, vittorie e piazzamenti
   invecchiano a ogni import; li fornisce il ramo statistico, con la numerosità
   campionaria accanto. Una scheda che dice "vince il 60% delle volte" sarà
   falsa entro un mese e nessuno se ne accorgerà.
4. **Compilare `sources`.** Una scheda senza fonti è un'opinione con una
   formattazione autorevole. Manuale ufficiale, thread WBO, esperienza diretta:
   basta dire quale.

### Il ciclo di lavoro

```bash
python tools/knowledge_priority.py --url "$DATABASE_URL"   # cosa conviene scrivere ora
# ... si scrive ...
python tools/check_kb_registry.py --url "$DATABASE_URL"    # i nomi tornano?
cd backend-py && python -m app.lib.rag.cli ingest          # indicizza il nuovo
python -m app.lib.rag.cli search "una domanda vera"        # si trova?
python ../tools/eval_retrieval.py --url "$DATABASE_URL"    # il punteggio e' salito?
```

`knowledge_priority.py` ordina le schede non scritte per il punteggio che il
pezzo ha davvero accumulato nelle tabelle stats, e dice quanta parte del peso di
ogni slot è già coperta. Sei Blade su 86 valgono l'80% del peso: non è una
questione di gusto quali scrivere per prime.

### Un esempio già scritto

`knowledge/regole/identita-combo.md` è una scheda completa e vera, di tipo
`rule`. Vale come modello di formato, di lunghezza delle sezioni e di tono —
e risponde a una domanda che verrà fatta davvero: perché le Over Blade non
compaiono da nessuna parte.
