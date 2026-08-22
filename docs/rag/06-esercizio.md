# 06 — L'esercizio

> **M7.** Quote, telemetria, errori, valutazioni. La differenza fra una
> dimostrazione e qualcosa che si può lasciare acceso.

Una pipeline che funziona sulla propria macchina e una esposta al pubblico sono
due sistemi diversi. Questo capitolo è la distanza fra le due.

## Le quote: un tetto di spesa, non una difesa

`app/lib/rag/quota.py`. Va distinto da `app/lib/rate_limit.py`, che difende un
login dalla forza bruta: qui **ogni domanda costa denaro vero** — embedding della
domanda, re-rank, token del modello — e un ciclo lasciato girare consuma la
dotazione in pochi minuti.

Due limiti, perché i modi di spendere troppo sono due:

**20 domande all'ora per indirizzo IP.** Per IP e non per sessione: contare per
sessione sarebbe inutile, basterebbe aprirne una nuova.

**300.000 token per conversazione.** La cronologia rientra nel prompt a ogni
turno, quindi il costo per domanda **cresce** col procedere della conversazione;
senza tetto, la centesima domanda costa molte volte la prima.

### Falliscono chiusi, ed è l'opposto dell'altro limitatore

Se il controllo stesso si rompe, si nega. Il limitatore dei login fa il
contrario, e ha ragione: bloccare tutti gli accessi per un guasto del limitatore
sarebbe peggio del rischio che previene. Qui il guasto costa denaro, e negare una
risposta è meno grave che lasciare aperto il rubinetto proprio mentre il database
è in difficoltà.

Il messaggio di guasto lo dice apertamente («controllo dei limiti non
disponibile»), così un guasto non si traveste da limite raggiunto mandando a
cercare un abuso che non c'è.

## Gli errori: due pubblici, due contenuti

Il difetto, visto in esercizio. Un utente ha chiesto quale combo si usa di più e
si è visto rispondere:

```
OpenRouter ha rifiutato la richiesta (HTTP 429): {"error":{"message":
"Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000
free model requests per day","code":429,...
```

Sbagliato tre volte: non gli dice niente di utile, rivela quale fornitore c'è
dietro e su che piano, e sembra un guasto del sito invece che un limite
temporaneo.

### Il principio

> **Il messaggio all'utente è una costante scritta a mano, mai una stringa
> derivata dall'eccezione.**

Non c'è filtro o troncamento che tenga: se il testo passa attraverso, prima o poi
passa qualcosa che non doveva. `errors.py` definisce quattro tipi, ciascuno con
il suo `user_message` fisso:

| Tipo | Cosa legge l'utente |
|---|---|
| `ProviderRateLimited` | «ha raggiunto il limite di richieste, riprova fra qualche minuto» |
| `ProviderUnavailable` | «non è raggiungibile in questo momento» |
| `ProviderMisconfigured` | **identico al caso generico** |
| `EmptyAnswer` | «non sono riuscito a formulare una risposta, prova a riformulare» |

Che una chiave manchi dica all'utente la stessa cosa di un guasto qualsiasi è
deliberato: saperlo non lo aiuta a fare niente, e indica a chiunque passi di lì
dove il sito è fragile.

Anche il **nome della classe** è stato tolto dalla risposta: già solo
`ProviderRateLimited` racconta che c'è un fornitore esterno e in che stato si
trova.

I tipi esistono perché la classificazione **non deve dipendere dal testo del
messaggio**: un testo si riformula per sbaglio, un tipo no.

### Dove finisce il dettaglio

Un codice di 8 caratteri esadecimali compare all'utente e accompagna il guasto in
due destinazioni:

- **il registro dell'applicazione**, con traceback, per chi ha accesso alla
  macchina;
- **la tabella `chat_error`**, per chi amministra il sito, interrogabile da
  `GET /api/admin/chat-errors?reference=…` (protetto da `require_admin`).

Due e non una: `docker logs` si perde a ogni ricreazione del container, la
tabella no.

La scrittura sul database **non può mai far fallire la richiesta**: se il guasto
originale è che il database non risponde, insistere trasformerebbe un errore
gestito in un 500. Il registro resta comunque.

Il codice trasforma «non funziona» in una riga precisa senza dover chiedere
altro.

## I limiti veri di OpenRouter

Dalla documentazione, perché è il difetto che ha rivelato tutto il resto:

| | |
|---|---|
| Richieste al minuto | 20, sempre |
| Al giorno, sotto 10 $ di credito storico | **50** |
| Al giorno, da 10 $ in su | 1.000 |
| Azzeramento | Mezzanotte UTC |

Il numero da tenere a mente: **ogni giro di strumenti conta come una richiesta**.
Una conversazione con due interrogazioni ne consuma tre o quattro. Cinquanta al
giorno finiscono molto prima di quanto suggerisca il numero.

## La telemetria

Ogni risposta salva in `chat_message`: fonti recuperate, strumenti chiamati,
astensione, citazioni fantasma, modello, token, latenza e — da M7 — il rapporto
di recupero completo (`retrieval`).

Serve a distinguere le due diagnosi che si confondono sempre: **il recupero ha
portato i frammenti sbagliati** contro **erano giusti e il modello ha scritto
male**. Cure opposte, indistinguibili guardando solo il testo.

Il **prompt caching** è misurato, non presunto: `cache_write` e `cache_read`
viaggiano fino al campo `usage`. Una cache che smette di funzionare — per un
blocco spostato, per un prompt che varia a ogni avvio — non cambia le risposte,
cambia solo il conto. Senza quei numeri non lascia nessuna traccia.

C'è anche un allarme sul **re-ranker degradato**: quando non produce punteggi
utilizzabili si registra un errore, perché è il caso in cui la soglia di
astensione perde significato e il sistema gira con una rete in meno.

## Il golden set cresce con domande vere

`tools/harvest_questions.py` estrae da `chat_message` le domande **andate male**,
in tre categorie, dalla più preziosa alla meno:

1. pollice giù — qualcuno ha detto che la risposta è sbagliata;
2. citazioni fantasma — ha citato fonti inesistenti;
3. astensioni — o manca la scheda, o il recupero è troppo severo.

Non scrive nel golden set: stampa i casi da incollare, con `expected_docs` da
riempire a mano. **Cosa doveva trovare è un giudizio umano**, e generarlo dal
recupero stesso significherebbe misurare il sistema col suo stesso metro.

Il golden set l'ho scritto immaginando cosa avrebbe chiesto la gente. Sono
domande ragionevoli e non sono quelle vere: chi usa il sito scrive diversamente
da chi ha costruito lo schema, e le domande che falliscono sono quasi sempre di
forme non previste. Alla prima esecuzione lo strumento ha trovato subito un caso
reale di citazione fantasma.

---

Prossimo: [07 — Gli errori che insegnano](07-errori-che-insegnano.md)
