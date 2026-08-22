# 01 — La decisione centrale

> **M0.** Prima di scrivere una riga: cosa si indicizza, cosa no, e perché.

Ogni pipeline RAG comincia con la stessa domanda, e quasi tutte se la pongono
male: *quali dati diamo in pasto al retrieval?* La risposta istintiva è "tutti",
ed è quella che rovina il progetto.

## Il problema, posto bene

Questo dominio ha due tipi di dato, e sono profondamente diversi.

**Qualitativo.** Come si comporta un ratchet 9-60, perché un bit da stamina si
sposa male con una blade da attacco, cosa dice il regolamento su un
deck. È testo, è sfumato, e a una domanda del genere corrispondono molte risposte
parziali sparse in punti diversi.

**Quantitativo.** WizardRod ha 383 vittorie nello snapshot del 21 agosto; il
ratchet 1-60 ha 4.935 punti; la combo più usata compare 218 volte su 2.008. È
numerico, esatto, e a una domanda del genere corrisponde **una** risposta —
quella giusta.

## Perché non si indicizzano i numeri

La tentazione è forte: trasformare ogni riga di statistica in una frase
("WizardRod ha 383 vittorie"), calcolarne l'embedding, e lasciare che il
retrieval faccia il resto. Non funziona, e vale la pena capire esattamente
perché, perché è un errore che si ripresenta in ogni dominio con dei numeri.

**Un indice vettoriale non sa ordinare, sommare o confrontare.** Sa solo dire
"questi frammenti somigliano alla domanda". Alla domanda *"quali sono le prime
dieci blade?"* restituirebbe dieci frasi che somigliano a una classifica — non
le prime dieci. Alla domanda *"quante vittorie in totale?"* restituirebbe frasi
che parlano di totali, non il totale.

**I numeri cambiano, gli embedding no.** Ogni import di un torneo
invaliderebbe migliaia di frammenti, che andrebbero ricalcolati. Il costo non è
solo economico: è una finestra di tempo in cui l'indice mente.

**La precisione si perde due volte.** Una volta nel trasformare la riga in
prosa, un'altra nel farla tornare indietro. E un numero sbagliato in una
risposta che cita le fonti è peggio di nessuna risposta, perché è credibile.

## La forma scelta

    domanda
       │
       ├── qualitativa ──> recupero ibrido su 1.940 frammenti ──┐
       │                   (le meccaniche, le regole)           │
       │                                                        ├──> il modello
       └── quantitativa ─> strumenti tipizzati su SQL ──────────┘     scrive
                           (le classifiche, i conteggi)

**Il corpus si indicizza. I numeri si interrogano.** Il modello riceve i
frammenti come contesto e ha a disposizione sei strumenti che eseguono SQL vero;
decide lui quali chiamare, ma non può inventare i risultati perché non li
produce.

Il vantaggio non è solo la correttezza. È che i numeri sono **sempre
aggiornati**: nessun reindex, nessuna finestra di menzogna. Un torneo importato
cinque minuti fa compare nella risposta successiva.

## Le alternative scartate, e cosa costavano

**Text-to-SQL.** Lasciare che il modello scriva le query. Espressivo quanto si
vuole, ma apre la superficie d'attacco a tutto il database e rende ogni risposta
dipendente dalla capacità del modello di scrivere SQL corretto su uno schema che
non ha mai visto per intero. Deciso: **solo strumenti tipizzati**, con la
possibilità di riaprire SQL più avanti se gli strumenti si riveleranno troppo
rigidi. A oggi non è servito.

**Un solo indice per tutto.** Semplice da costruire, impossibile da correggere:
quando una risposta è sbagliata non sai se ha sbagliato la ricerca o il calcolo,
perché sono la stessa cosa.

**Solo strumenti, niente corpus.** Risponde benissimo alle classifiche e non ha
niente da dire su *perché* un pezzo è forte — che è metà delle domande vere.

**Un database vettoriale dedicato** (Pinecone, Qdrant, Weaviate). Scartato per
una ragione poco elegante e molto pratica: i dati quantitativi sono già in
Postgres, e serve **la stessa transazione** per ragionare su entrambi. Con
`pgvector` un frammento e una statistica si interrogano nello stesso `SELECT`.
Con un servizio separato servono due sistemi da tenere allineati, e la
sincronizzazione fallita è il classico difetto che non dà sintomi finché
qualcuno non nota che una risposta cita un pezzo cancellato tre settimane fa.

## Le quattro decisioni prese prima del codice

M0 si è chiusa con quattro domande poste esplicitamente e quattro risposte
registrate. Vale la pena notare che **tre su quattro riguardano cosa NON fare**.

| Decisione | Scelta | Perché |
|---|---|---|
| Dove vive l'indice | pgvector, nello stesso Postgres | Una transazione sola sui due tipi di dato |
| Chi calcola gli embedding | Servizio ospitato (Voyage), non modello locale | Qualità sull'italiano, e nessuna GPU da gestire |
| Accesso ai numeri | Solo strumenti tipizzati; SQL libero rimandato | Superficie ridotta, risultati verificabili |
| Consegna della risposta | SSE, non WebSocket | Flusso a senso unico: la bidirezionalità non serve e costa configurazione |

## La lezione trasferibile

Quando affronti un dominio nuovo, la prima domanda non è "quale database
vettoriale" né "quale modello". È:

> **Quali domande hanno UNA risposta esatta, e quali ne hanno molte parziali?**

Le prime vanno interrogate. Le seconde vanno recuperate. Se metti le prime
nell'indice, il sistema darà risposte plausibili e sbagliate — la peggiore
combinazione possibile, perché nessuno se ne accorge.

---

Prossimo: [02 — Il corpus](02-corpus.md)
