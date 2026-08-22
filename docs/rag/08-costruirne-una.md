# 08 — Costruirne una

La lista ordinata, se dovessi rifare questo lavoro su un altro dominio. È il
percorso effettivamente seguito, con le correzioni che col senno di poi avrei
fatto prima.

## Prima di scrivere codice

**1. Separa le domande a risposta unica da quelle a risposte parziali.**
Le prime si interrogano, le seconde si recuperano. Sbagliare qui non si recupera
più: un indice vettoriale che contiene numeri produce risposte plausibili e
sbagliate, e nessuno se ne accorge. Vedi [01](01-la-decisione-centrale.md).

**2. Scrivi il golden set adesso, non dopo.**
Venti-trenta domande vere, con i documenti che *dovrebbero* essere trovati. Deve
includere casi in cui **la risposta giusta è astenersi** — senza, misuri metà del
comportamento e non ti accorgi mai di un sistema che risponde sempre.

Farlo prima ha un effetto collaterale utile: ti costringe a dire cosa il sistema
dovrebbe sapere, e quasi sempre scopri che il corpus previsto non basta.

**3. Decidi dove vive l'indice in base a dove vivono i dati con cui va incrociato.**
Se le statistiche sono in Postgres, l'indice va in Postgres. Un servizio
vettoriale separato è più elegante e ti regala un problema di sincronizzazione
che non dà sintomi finché una risposta non cita qualcosa cancellato tre settimane
prima.

**4. Scrivi che formato avranno i messaggi d'errore.**
Sembra prematuro. Non lo è: se non decidi adesso che l'utente vede una costante,
finirai per rilanciare `str(exc)` e scoprire mesi dopo che mostri il piano
tariffario del tuo fornitore.

## Le fondamenta

**5. Il registro dei nomi viene prima del testo.**
Anagrafe delle entità del dominio più gli alias con cui la gente le scrive
davvero. Ogni pezzo di testo si aggancia a un'entità che esiste già.

**6. Uno script che verifica il registro, da eseguire sempre.**
Deve **rimisurare** ciò che le soglie assumono. Se una soglia dice «sopra 0,70
sono la stessa cosa», lo script deve fallire quando due entità diverse si
avvicinano a 0,70.

**7. HNSW, non IVFFlat, se il corpus cresce a poco a poco.**
IVFFlat va ricostruito e chi se ne dimentica ottiene un recupero che peggiora
senza spiegazione.

**8. Una funzione unica per la normalizzazione del testo, usata da entrambi i lati.**
Indicizzazione e interrogazione devono normalizzare **identicamente**. È il
difetto B2 del capitolo [07](07-errori-che-insegnano.md), ed è costato metà del
recupero per settimane.

## Il corpus

**9. Taglia sulla struttura del documento, non a finestra fissa.**
Se i documenti hanno intestazioni, quelle sono già i confini semantici. Ripeti
l'intestazione dentro il testo indicizzato: un frammento che non dice di cosa
parla è inutile sia per l'embedding sia per chi legge la citazione.

**10. Marca la provenienza, e fai sopravvivere il marcatore fino al prompt.**
Fatto, opinione, fonte terza. È una riga di metadato che cambia il senso di una
risposta.

**11. Calcola l'hash del testo normalizzato e reindicizza solo ciò che cambia.**
Un reingest a corpus fermo deve costare zero chiamate.

## Il recupero

**12. Almeno due rami, quasi sempre tre.**
Denso per i concetti, lessicale per i nomi propri, esatto se il dominio ha
codici o designazioni. Un ramo solo fallisce su una categoria intera di domande,
e la categoria che perdi non è visibile finché non la provi.

**13. Riconosci le entità prima di cercare, e usale come filtro rigido.**
E **testa che il riconoscimento si attivi**, non solo che il risultato finale sia
accettabile (difetto A2).

**14. Fondi con RRF, non con pesi.**
I punteggi dei rami non sono confrontabili e normalizzarli richiede di conoscere
distribuzioni che cambiano con la domanda. RRF usa solo le posizioni e non ha
niente da tarare. `k = 60`.

**15. Costruisci l'astensione. È la funzionalità, non un accessorio.**
Un sistema che risponde sempre non è utile: è pericoloso, perché le sue risposte
sbagliate hanno lo stesso aspetto di quelle giuste. Servono due difese: una
regola di corroborazione (nessuna entità, nessun riscontro lessicale → astieniti)
e una soglia sul punteggio del re-rank.

**16. Misura le soglie e scrivi la misura accanto al numero.**
Un numero magico senza la sua misura diventa sbagliato in silenzio quando i dati
cambiano. E se le popolazioni si sovrappongono — succede — **dillo**, invece di
far credere che la soglia risolva.

**17. Fai restituire al recupero un rapporto, non una lista.**
Conteggi per ramo, se il re-rank era utilizzabile, perché ci si è astenuti. È ciò
che distingue «ha cercato male» da «ha scritto male».

## La generazione

**18. I numeri passano da strumenti tipizzati, mai dall'indice.**

**19. Ogni risultato di uno strumento porta numerosità, data e fonte.**
E se il campione è piccolo, lo strumento stesso aggiunge la nota — non fidarti che
il modello ci pensi.

**20. Gli strumenti restituiscono errori, non li sollevano.**
Il modello sa correggersi da solo se gli dici cos'ha sbagliato.

**21. Deduplica le chiamate identiche, ma rispondi a tutte.**
Il protocollo esige un risultato per ogni chiamata: quello che si evita è il
lavoro, non la risposta.

**22. Nel prompt, nessun esempio copiabile come dato valido** (difetto B1).

**23. Un tetto ai giri di strumenti — e un piano per quando lo tocchi.**
Esaurire i giri non è una risposta: chiedi la conclusione, e se non arriva
dichiara l'errore invece di consegnare il vuoto.

**24. Verifica meccanicamente le citazioni.**
Ogni riferimento scritto dal modello deve corrispondere a una fonte davvero
iniettata. È una verifica completa, non un'euristica, e va fatta sempre.

**25. Non bloccare la risposta per un verdetto negativo.**
È già scritta. Registrala col difetto segnalato: è così che scopri quanto spesso
accade.

## La consegna

**26. Se la latenza supera i cinque secondi, servi in streaming.**
E manda le fonti **prima** del testo: l'utente sa su cosa si baserà la risposta
mentre viene scritta.

**27. Chiediti, per ogni percorso: come si presenterebbe qui un guasto?**
Se la risposta è «come un successo» — 200 con corpo vuoto, `done` senza testo,
header assenti — serve un controllo esplicito. È l'intera sezione C del capitolo
[07](07-errori-che-insegnano.md).

## L'esercizio

**28. Quote prima di esporre, non dopo.**
Ogni domanda costa denaro. Falle fallire chiuse: negare una risposta è meno grave
che lasciare aperto il rubinetto.

**29. Errori a due pubblici.**
Costante fissa più codice per l'utente; dettaglio completo nel registro **e** in
una tabella, perché i log si perdono a ogni ricreazione del container.

**30. Misura il prompt caching invece di presumerlo.**
Una cache che smette di funzionare non cambia le risposte, cambia solo il conto.

**31. Fai crescere il golden set dalle domande vere andate male.**
Quelle che immagini tu non sono quelle che fa la gente. Ma **cosa doveva trovare
resta un giudizio umano**: generarlo dal recupero significa misurare il sistema
col suo stesso metro.

## Il consiglio che vale più di tutti

Costruisci **prima** la valutazione automatica e la telemetria per ramo, anche se
sembrano lavoro rimandabile.

Quasi tutti i difetti gravi di questo progetto non producevano errori: il sistema
continuava a rispondere. Senza una misura ripetibile, l'unico modo di accorgersi
di un guasto è che qualcuno noti una risposta strana — e per allora hai
costruito tre cose sopra la parte rotta.

---

Torna all'[indice](README.md).
