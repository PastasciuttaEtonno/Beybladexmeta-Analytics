# 03 — Il recupero

> **M3.** Tre rami, la fusione, il riconoscimento delle entità, e la parte che
> quasi nessuno implementa: quando è giusto non rispondere.

`backend-py/app/lib/rag/search.py`, 501 righe. È il cuore, ed è dove sono finiti
quasi tutti i difetti interessanti del progetto.

## Perché tre rami e non uno

La ricerca vettoriale da sola fallisce su un'intera categoria di domande, e non
per un difetto del modello: per come funziona.

> *"come si comporta il ratchet 9-60?"*

`9-60` è una **designazione**, non una parola. Il suo embedding è quasi identico
a quello di `9-70`, `1-60`, `3-60`: sono stringhe brevissime che differiscono di
un carattere e vivono nello stesso punto dello spazio semantico. La ricerca densa
restituisce il ratchet sbagliato con grande sicurezza.

Al contrario:

> *"perché quel bit tiene di più a fine partita?"*

Qui non c'è nessuna parola chiave da cercare. La ricerca lessicale non trova
niente, quella densa trova esattamente ciò che serve.

Nessuno dei due modi è sufficiente. Servono entrambi, più un terzo per le
designazioni.

| Ramo | Cosa fa | Dove è indispensabile |
|---|---|---|
| **Denso** | Coseno su `pgvector` | Domande in linguaggio naturale, concetti |
| **Full-text** | `tsvector` italiano | Nomi propri, termini di dominio |
| **Esatto** | Contenimento su `code_tokens` | Designazioni: `9-60`, `BX-34` |

## Il riconoscimento delle entità viene prima

Prima di cercare qualsiasi cosa, `link_entities()` prova a capire **di quali
pezzi parla la domanda**. Tre passaggi, dal più sicuro al meno:

1. espressione regolare per le designazioni (`\b\d{1,2}-\d{2}\b`);
2. confronto esatto sugli alias normalizzati, i 271 di `component_alias`;
3. somiglianza per trigrammi (`pg_trgm`) come ultima risorsa, per i refusi.

Gli slug riconosciuti diventano un **filtro rigido**: se la domanda nomina
WizardRod, i tre rami cercano solo dentro WizardRod. È la differenza fra un
sistema che a *"parlami di WizardRod"* risponde su WizardRod e uno che risponde
su cinque blade che gli somigliano.

### Il nome più corto che un pezzo abbia

Il confronto esatto lavora su quello che `candidate_forms()` gli passa, e la
regola con cui quella funzione decide cosa è un nome è meno ovvia di quanto
sembri. Un bit si scrive `LowRush` ma anche **`LR`**, e il registro ha **42
alias di una o due lettere** che coprono quasi tutto l'alfabeto.

Prendere ogni token corto è impossibile: `a` è Accel, `e` è Elevate, `o` è Orb,
`un` è UnderNeedle. Scartarli tutti — come faceva la prima versione — lascia
senza filtro esatto proprio la domanda che nomina il pezzo nel modo più preciso
disponibile. La via di mezzo è la maiuscola: le sigle si scrivono `LR`, `HN`,
`FB`, le parole no.

La maiuscola però arriva anche per motivi che col nome di un pezzo non c'entrano
niente, e sono due:

- **le parole funzione a inizio frase o in un titolo.** Sette alias coincidono
  con una parola italiana (`a d e l lo o un`) e restano fuori sempre. Una
  domanda scritta tutta in maiuscolo perde le sigle del tutto: se non c'è niente
  di minuscolo, la maiuscola non distingue più niente.
- **l'elisione.** Questa non è un elenco: è l'apostrofo. *"C'e' differenza fra
  Rush e LowRush?"* collegava **Cyclone**, e la scheda di Cyclone finiva davvero
  fra le fonti della risposta; *"V'e' un blade migliore"* tirava dentro Vortex,
  *"S'intende"* Spike. Nessuna delle tre è una parola funzione, quindi nessun
  elenco le avrebbe coperte — mentre il carattere dopo la lettera le copre
  tutte, comprese quelle che nessuno ha ancora provato.

Vale la pena notare da che parte pende lo scambio, perché è il motivo per cui
tutte queste regole tolgono invece di aggiungere. Chi intende Elevate può
scrivere *Elevate*, e funziona. Chi scrive *"un blade da attacco"* non ha modo
di dire al sistema che `un` non era UnderNeedle: il collegamento è un filtro
rigido, quindi la domanda verrebbe ristretta al pezzo sbagliato e la risposta
arriverebbe sicura di sé, senza che niente segnali un errore.

### Una soglia misurata, non scelta

`FUZZY_THRESHOLD = 0.70`. Il numero esce da questa misura sul registro vero:

```
'wizzardrod'    vs 'wizardrod'       0.750   un refuso, va corretto
'optimusprimal' vs 'optimusprime'    0.688   due blade DIVERSE, non vanno unite
'wizardrod'     vs 'wizardarrow'     0.375   due blade diverse
'960'           vs '160'             0.143   due ratchet diversi
```

0,688 è la coppia di pezzi realmente distinti più vicina che esista oggi nel
registro. Qualunque valore sopra è sicuro; qualunque valore sotto fonde due pezzi
veri. 0,70 sta in quel varco — che è largo 0,062, cioè poco.

Ed è per questo che `tools/check_kb_registry.py` **rimisura la coppia più vicina
a ogni esecuzione e fallisce se un pezzo nuovo chiude il varco**. Una soglia
tarata su dati che cambiano deve accorgersi quando i dati cambiano; altrimenti è
un numero magico che diventa sbagliato in silenzio.

## La fusione: RRF

I tre rami producono punteggi che **non sono confrontabili**: un coseno di 0,82,
un `ts_rank_cd` di 0,0031 e un contenimento booleano non stanno sulla stessa
scala, e normalizzarli richiede di conoscere la distribuzione di ciascuno — che
cambia con la domanda.

Reciprocal Rank Fusion aggira il problema ignorando i punteggi e usando solo le
**posizioni**:

```
punteggio(documento) = Σ  1 / (k + posizione nel ramo i)
                       i
```

con `k = 60`, il valore del lavoro originale. Un documento che compare terzo in
due rami diversi batte uno che compare primo in un ramo solo — che è esattamente
il comportamento desiderato: la corroborazione fra metodi indipendenti vale più
dell'eccellenza in uno solo.

Il pregio pratico: **non c'è niente da tarare.** Nessun peso per ramo da
indovinare, nessuna normalizzazione da rifare quando cambia l'embedder.

## Il re-rank

I 20 candidati fusi passano a `rerank-2.5` di Voyage, che li riordina leggendo
davvero domanda e frammento insieme, invece di confrontare due vettori calcolati
separatamente.

Un dettaglio del contratto che è costato caro: `rerank()` restituisce
`(risultati, ok)`, dove **`ok` significa "esistono punteggi confrontabili"**, non
"la chiamata non è esplosa". La distinzione è il capitolo [07](07-errori-che-insegnano.md),
difetto n. 3.

## Astenersi

È la parte che quasi nessuna pipeline implementa, ed è quella che decide se il
sistema è credibile.

**Il problema:** il ramo denso restituisce *sempre* k risultati. Non ha una
soglia, e non può averne una onesta finché non conosci la distribuzione dei
coseni del tuo embedder sul tuo corpus. Quindi a *"che tempo fa domani a
Milano?"* restituisce i cinque frammenti meno lontani del corpus — che è vero e
privo di significato.

Due difese, in ordine.

**Prima: la corroborazione.** Se non è stata riconosciuta nessuna entità, nessuna
designazione combacia e il full-text non trova nulla, allora l'unico segnale è la
vicinanza semantica, e da sola non basta. Astensione.

**Seconda: la soglia sul re-rank.** `RERANK_FLOOR = 0.60`, misurata con
`tools/calibrate_abstention.py`:

```
pertinenti   0.633 – 0.914   (13 casi)
fuori tema   0.000 – 0.645   ( 7 casi)
```

**Le due popolazioni si sovrappongono**, ed è la cosa importante da sapere. Il
caso fuori tema più alto — *"qual è il miglior driver di Beyblade Burst"*, 0,645
— supera il pertinente più basso, 0,633. **Nessuna soglia li separa entrambi.**

Non è un difetto del re-ranker: una domanda su Beyblade Burst usa lo stesso
vocabolario di una su Beyblade X, e la somiglianza c'è davvero. 0,60 è un
compromesso **dichiarato**, non una soluzione: lascia passare quel caso e
scommette che la regola di ambito nel prompt lo intercetti dopo.

Il valore di scriverlo così invece di limitarsi a mettere `0.60` nel codice: fra
sei mesi, quando quel caso fallirà nella valutazione, chi guarda saprà che è
noto e perché, invece di passare un pomeriggio a spostare la soglia avanti e
indietro scoprendo da capo che non esiste un valore che funzioni.

## Il rapporto di recupero

`hybrid()` non restituisce una tupla ma un oggetto `Retrieval`, che oltre ai
risultati porta: quanti candidati ha prodotto ogni ramo, quanti sono
sopravvissuti alla fusione, se il re-rank era utilizzabile, il punteggio migliore,
e **perché** ci si è astenuti quando è successo.

Finisce in `chat_message.retrieval`. Serve a rispondere alla domanda che ci si
pone sempre davanti a una risposta sbagliata:

> Ha cercato male, o ha cercato bene e ha scritto male?

Sono due problemi con cure opposte, e senza questi dati non si distinguono
guardando solo il testo finale. Un ramo che resta a zero è un ramo rotto — e
senza il conteggio gli altri due coprono l'assenza e il sistema sembra
funzionare.

## La sequenza completa

```
 domanda
    │
    ├─> link_entities()        slug e designazioni riconosciuti
    │        │
    │        └─> filtro rigido su tutti i rami
    │
    ├─> denso  ─┐
    ├─> full-text ├─> should_abstain()? ─── sì ──> «non lo copro»
    └─> esatto ─┘         │ no
                          ├─> rrf_fuse(k=60)  ── vuoto ──> «non lo copro»
                          │
                          ├─> rerank-2.5 (finestra 20)
                          │
                          └─> punteggio < 0.60? ── sì ──> «non lo copro»
                                    │ no
                                    └─> i primi 8 al modello
```

---

Prossimo: [04 — La generazione](04-generazione.md)
