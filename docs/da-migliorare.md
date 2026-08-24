# Cosa manca

Quello che si sa già essere debole, misurato dove si poteva misurare. Non è una
lista di desideri: ogni voce dice cosa c'è oggi, perché conta, e come si
verifica che sia ancora vera.

**Fuori da questa pagina resta il lavoro principale** — le sezioni *Interazioni*
delle schede, che sono vuote su tutte e 170 e che nessuna modifica al codice può
riempire. Quello è il percorso critico del progetto e vive altrove: vedi
[`rag/02-corpus.md`](rag/02-corpus.md).

Aggiornata il 2026-08-24.

---

## 1. L'assistente è lento

Misurato in produzione sulle prime dodici risposte vere:

```
mediana 23,1 s   massimo 104,2 s   ~5.100 token in ingresso
```

Il gate in sviluppo dava 9,5 s di mediana. La differenza non è la pipeline: è la
coda del modello gratuito su OpenRouter.

Tre strade, in ordine di costo: passare a Claude (l'adattatore è già scritto e
testato, servono `ANTHROPIC_API_KEY` e `CHAT_PROVIDER=claude`), mettere 10 $ di
credito su OpenRouter per uscire dalla coda gratuita, o non fare niente. Prima
di scegliere:

```bash
python tools/eval_generation.py --url "$DATABASE_URL" --provider claude
```

e si mettono le colonne accanto a quelle di OpenRouter. La decisione si legge
dai numeri: è il motivo per cui quello strumento esiste.

**Cosa non misuriamo e conta di più:** il tempo al primo carattere. Con lo
streaming chi legge comincia prima, quindi 23 s totali si sopportano se il primo
token arriva in tre. Se arriva in venti, no. `chat_message.latency_ms` registra
solo il totale.

## 2. I guasti non svegliano nessuno

`chat_error` è una tabella che qualcuno deve ricordarsi di aprire, e
`/admin/chat-logs` una pagina che qualcuno deve ricordarsi di visitare. Finché
è così, un guasto si scopre quando qualcuno si lamenta.

Il caso concreto: quando finisce la quota giornaliera di OpenRouter (50
richieste sul piano gratuito) l'assistente smette di rispondere e nessuno lo
sa. Basterebbe un riepilogo giornaliero, o una soglia — più di N guasti in
un'ora.

## 3. I backup vivono solo sul VPS

Il backup automatico gira ogni notte alle 03:00, tiene sette copie, ed è stato
verificato con un restore vero. Ma `s3_storages` in Coolify è vuoto: le copie
stanno sulla stessa macchina del database. **Se muore il VPS muoiono anche
loro.** Garage non conta come offsite — gira lì accanto.

Serve una risorsa S3 esterna configurata in Coolify.

## 4. La vecchia risorsa Postgres è ancora accesa

Dopo il passaggio a `pgvector/pgvector:pg18` la risorsa precedente
(`fhpa4w6i0hdeqf03y8fgtv9m`) è rimasta in piedi apposta: è il rollback, e
rimettendo la vecchia `DATABASE_URL` si torna indietro in un redeploy.

Occupa RAM su una macchina piccola. Quando la fiducia nel database nuovo è
sufficiente si spegne — il dump `beyblade_pre_rag_20260824-110638.dump` resta
sia sul VPS sia in `Desktop/oracle/backup_db_beyblade/`.

## 5. Il dominio vero non punta qui

`beybladexmeta.com` risponde da un altro nginx con una pagina di luglio. La
produzione è il dominio Coolify `dxdjsw2ptrblbymqjd2vdz6y.92.4.170.189.sslip.io`.

Al momento del cambio ricordarsi che `VITE_PUBLIC_MINIO_URL` è una variabile di
**build**: l'indirizzo dello storage è cotto dentro il bundle, quindi il
frontend va ricostruito, non solo ridistribuito.

## 6. Ogni pagina si monta due volte

`ResponsiveAppShell` rende i contenuti due volte — una per il layout mobile e
una per quello desktop — e ne nasconde una col CSS:

```tsx
<div className="md:hidden"><AdsLayout>{children}</AdsLayout></div>
<div className="hidden md:block"><DesktopLayout>{children}</DesktopLayout></div>
```

Vale per tutto il sito. Oggi costa solo lavoro sprecato, perché TanStack Query
mette in cache sulla stessa chiave e le richieste non raddoppiano. Ma i due
montaggi hanno **stati indipendenti** (scoperto perché un interruttore in
`/admin/chat-logs` cambiava una copia sola), e il giorno che un componente farà
un effetto collaterale al montaggio lo farà due volte.

## 7. Un caso del gate resta rosso

`fuori-ambito-burst` — *"qual è il miglior driver di Beyblade Burst"* — non si
astiene come dovrebbe. **Non è una regressione**: è la sovrapposizione
documentata accanto a `RERANK_FLOOR`, dove nessuna soglia separa il caso fuori
tema più alto dal caso pertinente più basso. Una domanda su Burst usa metà del
vocabolario del corpus.

Il numero di riferimento del gate è quindi **24/25**, non 25/25. Confrontare con
quello.

## 8. La chat è pubblica senza un tetto complessivo

C'è un limite di 20 domande all'ora per indirizzo IP e 300.000 token per
sessione. Non c'è un tetto giornaliero **complessivo**: cento indirizzi diversi
possono spendere quanto vogliono, e ogni domanda costa un embedding, un re-rank
e i token del modello.

Finché il fornitore è gratuito il danno è che l'assistente smette. Con una
chiave a pagamento il danno è una bolletta.

## 9. Il frontend non ha un solo test

Il backend ha 187 test. Il frontend zero.

Non è teoria: i due difetti di resa della chat — il grassetto che si leggeva
`**così**` e le citazioni `[[knowledge/...]]` in mezzo alle frasi — sono stati
trovati guardando lo schermo, e la pagina che diventava nera dopo ogni
distribuzione per puro caso.

Le funzioni pure di `frontend/src/components/chat/answer.tsx` (`stripCitations`,
`groups`) sono testabili senza browser: `vitest` più quattro test coprirebbe
esattamente quei casi, e girerebbe nel lavoro `veloce` della CI.

## 10. Della CI mancano gli strati 3 e 4

[`.github/workflows/controlli.yml`](../.github/workflows/controlli.yml) copre
test, tipi, integrità del registro e build delle immagini. Restano fuori:

- **i due gate del RAG in notturna** (`eval_retrieval`, `eval_generation`), che
  costano chiamate a pagamento e vanno con le chiavi nei secrets. Sono l'unico
  controllo che direbbe "hai rotto le sigle dei bit" o "il re-ranker si è
  degradato";
- **lo smoke test dopo la distribuzione**: trenta secondi di `curl` sugli
  endpoint più una domanda vera all'assistente. È l'unico strato che avrebbe
  preso i due difetti più imbarazzanti di questa settimana — il 500 di
  `/api/admin/chat-errors`, vivo da quando è stato scritto, e la pagina nera —
  perché erano difetti dell'ambiente distribuito, non del codice.

## 11. Un database non si ricostruisce dalle migrazioni

```
applying 0003_external_player_combos_scoring.sql ...
relation "external_player_combos" does not exist
FAILED
```

La catena parte da uno schema che ai tempi generava Drizzle, quindi da vuoto non
arriva in fondo. Oggi si convive col fatto che il punto di partenza sia un dump
(`docker/initdb/10-beyblade.sql.gz` per lo sviluppo, `docker/ci-db.sql.gz` per
la CI), ed è documentato in [`../migrations/README.md`](../migrations/README.md).

Sistemarlo vorrebbe dire una migrazione 0000 che crea davvero le tabelle di
partenza. Non urgente finché i dump esistono; diventa urgente il giorno che
qualcuno vuole un ambiente nuovo senza avere accesso ai dati di produzione.

## 12. Due questioni di dati, aperte

- **`Hornet` e `Kraken`** sono classificati `blade` nel registro, ma secondo la
  Beyblade Wiki sono **Lock Chip**. Le loro schede sono scaffold vuoti, quindi
  oggi non fanno danno: lo faranno appena qualcuno le scrive.
- **`challonge_reported_combos` è vuota.** Le combo registrate dai giocatori sui
  tornei Challonge sono andate perse e non sono state re-inserite, quindi
  `/api/analytics/meta?platform=challonge` resta vuoto — il che è corretto, ma è
  un buco nei dati, non una scelta.
