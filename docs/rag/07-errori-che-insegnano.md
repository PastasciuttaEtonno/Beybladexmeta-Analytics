# 07 — Gli errori che insegnano

Questo è il capitolo utile.

Le architetture RAG si somigliano tutte e si trovano ovunque. Ciò che non si
trova quasi mai è l'elenco di cosa si rompe davvero mentre le costruisci — e
soprattutto **quali guasti non danno nessun sintomo**.

Ogni voce ha la stessa forma: cosa succedeva, perché, e la regola generale.

---

## A. I difetti che non danno sintomi

Sono i peggiori. Il sistema risponde, non solleva errori, e sbaglia.

### A1 — Il re-ranker che diceva di aver funzionato

`NullReranker`, il sostituto usato senza chiave, restituiva `(risultati, True)`.
Sembra innocuo. Non lo era: quel secondo valore significa **«esistono punteggi
confrontabili»**, non «la chiamata non è esplosa».

Con `True`, la soglia di astensione (0,60) veniva confrontata con **punteggi
RRF**, che valgono circa 0,016. Ogni risposta finiva sotto soglia. **Il sistema
si asteneva su ogni domanda.**

La valutazione del recupero è crollata da 15 casi superati su 15 a **2 su 15**, e
i due superstiti erano i casi in cui astenersi era la risposta giusta.

> **Regola.** Quando una funzione restituisce un flag, il nome e il commento
> devono dire cosa significa **il valore**, non se la chiamata è riuscita.
> «Riuscito» e «utilizzabile» sono cose diverse, e confonderle propaga un valore
> corretto in un posto dove è privo di senso.

### A2 — L'espressione regolare che incollava le parole

Il riconoscimento delle entità spezzava `"il WizardRod"` in `"il Wizard"` e
`"Rod"`.

Conseguenza: **nessun nome composto è mai stato riconosciuto.** Il filtro rigido
— la cosa che fa sì che una domanda su un pezzo cerchi dentro quel pezzo — non si
è mai attivato. Il sistema rispondeva lo stesso, un po' peggio, senza dirlo.

> **Regola.** Un'ottimizzazione che si attiva «quando riesce» ha bisogno di un
> test che verifichi **che si attivi**, non solo che il risultato sia
> accettabile. Altrimenti la sua assenza è indistinguibile dalla sua presenza.

### A3 — La ricerca lessicale che non si accendeva mai, poi sempre

`plainto_tsquery` mette in **AND** tutti i termini. Una domanda naturale di dieci
parole non trova mai un frammento che le contenga tutte: il ramo full-text era
morto, e gli altri due coprivano l'assenza.

Passando a **OR** il ramo ha smesso di non accendersi mai e ha cominciato ad
accendersi sempre: «che tempo fa domani a Milano» produce i lessemi
`doman|fa|mil|temp`, e uno solo bastava a far tornare 140 frammenti.

La cura non è né AND né OR ma una **soglia di copertura**: contare quanti lessemi
combaciano davvero, e chiedere `min(2, lessemi della domanda)`.

> **Regola.** Un ramo che risponde a qualunque domanda non aggiunge informazione,
> né alla fusione né alla decisione di astenersi. Vale quanto un ramo morto, e si
> nota molto meno.

### A4 — Le risposte vuote dichiarate non-astensioni

Quando il filtro rigido restringeva a un pezzo la cui scheda non era ancora
scritta, tutti i rami tornavano vuoti e la funzione restituiva «lista vuota, non
mi astengo».

È la cosa peggiore da dire al modello: «ho cercato e non mi astengo» con un
contesto vuoto è un invito a rispondere a memoria — esattamente ciò che tutta la
pipeline esiste per impedire.

> **Regola.** «Non ho trovato niente» e «non mi astengo» sono affermazioni
> diverse. Restituirle insieme è una contraddizione che qualcuno più a valle
> risolverà nel modo sbagliato.

### A5 — Il segnaposto in classifica

`/api/analytics/meta` contava `None` come se fosse un ratchet, con 56 punti, e il
segnaposto compariva **nella classifica pubblica del sito**. Le tabelle usano
`None` e `-` per «nessun componente in questa posizione», e un altro endpoint li
filtrava già.

Emerso confrontando quell'endpoint con gli strumenti quantitativi: 13 ratchet da
una parte, 12 dall'altra.

> **Regola.** Due implementazioni della stessa classifica che non concordano
> sono un regalo: una delle due è sbagliata e te l'hanno appena detto. Vale la
> pena costruire il secondo percorso anche solo per avere il confronto.

---

## B. I difetti che sembrano guasti di qualcun altro

### B1 — L'esempio del prompt copiato come citazione

Trovata una citazione fantasma in esercizio:
`[[knowledge/blades/wizard-rod.md]]`, per un pezzo di cui il modello aveva letto
il nome nel risultato di uno strumento, non in un documento.

Quel percorso era **letteralmente l'esempio della regola 2** del prompt di
sistema, che diceva «non inventare identificatori» mostrandone uno pronto da
usare due parole prima.

> **Regola.** Nessun esempio dentro un prompt deve essere copiabile come dato
> valido. Un esempio che si può copiare, viene copiato — e la regola che lo
> circonda non lo impedisce, perché l'esempio è più concreto della regola.

### B2 — Gli accenti che spegnevano metà del recupero

«Qual è la combo più usata adesso?» → zero risultati dal ramo lessicale.
«qual e la combo piu usata adesso?» → venti.

La causa: l'elenco delle **parole vuote italiane** di Postgres contiene «più»
**accentato**. Dalla domanda accentata quel termine sparisce, restano quattro
lessemi, e nessun frammento ne combacia due — la soglia di copertura. Il corpus,
invece, è scritto senza accenti (le schede generate usano `piu'`, `puo'`, `e'`),
quindi lì «piu» sopravvive come parola piena.

Le due metà del confronto non si incontravano mai. E la domanda **accentata** è
quella che scrive una persona vera.

Cura: una configurazione di ricerca testuale `italian_unaccent` che applica
`unaccent` prima dello stemmer, **su entrambi i lati**.

> **Regola.** Quando indicizzi e interroghi, le due parti devono usare la
> **stessa identica normalizzazione**. E vanno provate con input scritti come li
> scriverebbe un utente della lingua, non come li digita chi sviluppa.

### B3 — L'errore del fornitore mostrato all'utente

Il corpo JSON di OpenRouter — nome del fornitore, piano tariffario, invito a
comprare crediti — consegnato a chi aveva chiesto quale combo si usa di più.
Dettaglio in [06](06-esercizio.md).

> **Regola.** Il messaggio d'errore all'utente è una costante scritta a mano, mai
> una stringa derivata dall'eccezione. Filtri e troncamenti falliscono: prima o
> poi passa qualcosa che non doveva.

### B4 — La guardia che gridava sui numeri giusti

Il controllo dei numeri non fondati segnalava `14, 18, 36, 39, 261` su una
risposta **corretta**. Erano percentuali arrotondate (14,3 → 14) e un separatore
delle migliaia italiano (`4.261` per 4261).

> **Regola.** Un allarme che grida sui casi buoni viene disattivato, e allora non
> protegge più da niente. Un'euristica va tarata sui suoi falsi positivi prima di
> essere accesa.

---

## C. I difetti di contratto fra due parti

### C1 — La collisione di nomi che svuotava ogni risposta

In `chat.py` convivevano `import json as _json` e `def _json(value)`. La
funzione, definita più in basso, vinceva. Quindi `_json.dumps` cadeva su un
oggetto funzione e **ogni evento SSE falliva**.

Il sintomo: **HTTP 200 con corpo vuoto**. Il modo peggiore di rompersi — lo stato
dice che è andato bene, il client non riceve niente, e l'eccezione compare nei
log dentro lo stream invece che come risposta d'errore.

### C2 — Gli errori dentro un HTTP 200

OpenRouter restituisce i guasti nel corpo di una risposta 200. Il percorso
sincrono lo controllava; quello in streaming no: leggeva gli eventi, non trovava
`choices`, e finiva con testo vuoto — un `done` pulito con risposta vuota,
indistinguibile da «il modello non aveva niente da dire».

### C3 — Esaurire i giri di strumenti scambiato per una risposta

Quattro giri consumati chiamando strumenti, nessun testo scritto, e il ciclo che
consegnava il vuoto come risposta valida. Vedi [04](04-generazione.md).

### C4 — Gli header scartati dal gestore di eccezioni

Il gestore di `HTTPException` dell'applicazione ricostruiva la `JSONResponse` per
adattare la forma del corpo, e **scartava `exc.headers`**. Qualunque header
passato a un'eccezione, ovunque nel progetto, spariva in silenzio.

L'ha rivelato `Retry-After` su un 429 — ma valeva anche per `WWW-Authenticate`.

> **Regola comune a C1–C4.** Ogni volta che due parti si scambiano qualcosa
> (nomi in uno spazio, stati HTTP, un `tool_result` per ogni `call_id`, header
> attraverso un gestore), il difetto tipico è il **successo apparente**: 200 con
> corpo vuoto, `done` senza testo, header assenti. Vale la pena chiedersi, per
> ogni percorso: *come si presenterebbe qui un guasto?* Se la risposta è «come un
> successo», serve un controllo esplicito.

---

## D. I difetti d'ambiente

### D1 — La variabile d'ambiente vuota che batteva il default

`os.environ.get("OPENROUTER_MODEL", DEFAULT)` restituisce la stringa vuota quando
la variabile **esiste ed è vuota** — e docker compose scrive
`OPENROUTER_MODEL: ${OPENROUTER_MODEL:-}`, che la **definisce sempre**, vuota se
manca nel `.env`.

Il container costruito a mano non la definiva affatto, quindi il default
funzionava. Passando a compose è sparito, e OpenRouter ha risposto «No models
provided» a una richiesta partita senza modello: un errore del fornitore causato
da una variabile di configurazione, cioè il punto più lontano possibile dalla
causa.

Peggio con i numeri: `int("")` solleva `ValueError` **durante l'import del
modulo**, e l'applicazione non parte affatto, con un traceback che non nomina la
variabile responsabile.

> **Regola.** «Assente» e «vuota» non sono la stessa cosa, e i sistemi di
> orchestrazione producono quasi sempre la seconda. Leggi le variabili con una
> funzione che tratta il vuoto come assente.

### D2 — Il container stantio che sembra un bug del codice

Durante M4–M6 l'immagine del backend è stata ricostruita cinque volte, e **tre di
quelle un container stantio ha prodotto un sintomo che sembrava un difetto del
codice**: un 404 su una rotta che esisteva, un fornitore che non cambiava, uno
stream vuoto.

Cura: mettere il servizio nel compose di sviluppo con il codice montato e
`--reload`. Su Windows serve `WATCHFILES_FORCE_POLLING=true`, perché gli eventi
del filesystem non attraversano un bind mount e `--reload` sarebbe una promessa
non mantenuta.

> **Regola.** Se hai perso più di un'ora a diagnosticare qualcosa che era «il
> container vecchio», il problema non è la disattenzione: è che l'ambiente
> permette quello stato. Toglilo, non ricordartelo.

### D3 — Il caricamento differito annullato da un import

`Chat.tsx` importava `ChatPanel` staticamente, quindi l'import dinamico nel
lanciatore non divideva niente. Nessun sintomo: funzionava tutto, semplicemente
il bundle era uno solo.

### D4 — Il posizionamento perso per specificità CSS

`.hover-elevate` dichiara `position: relative` e batte `.fixed`. Dettaglio in
[05](05-consegna.md).

---

## Il filo comune

Rileggendo l'elenco, quasi tutti i difetti gravi condividono una proprietà:

> **Il sistema continuava a rispondere.**

Nessuno di essi produceva un errore. Il re-ranker degradato faceva astenere su
tutto; le entità non riconosciute peggioravano il recupero in silenzio; gli
accenti spegnevano metà della ricerca; una variabile vuota mandava una richiesta
senza modello.

Da qui discendono le tre pratiche che hanno pagato di più:

1. **Una valutazione automatica con un golden set**, eseguita a ogni modifica di
   recupero o prompt. È l'unica cosa che ha reso visibile A1 — un guasto che
   nessun test unitario avrebbe intercettato, perché ogni pezzo funzionava.

2. **Telemetria che dica quale ramo ha trovato cosa.** Un ramo a zero è un ramo
   rotto; senza il conteggio, gli altri coprono l'assenza.

3. **Confrontare due percorsi che dovrebbero concordare** — sincrono contro
   streaming, endpoint contro strumenti. Quando divergono, uno dei due è
   sbagliato e te l'hanno appena detto gratis.

---

Prossimo: [08 — Costruirne una](08-costruirne-una.md)
