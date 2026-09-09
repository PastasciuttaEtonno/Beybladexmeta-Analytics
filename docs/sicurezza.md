# La sicurezza della linea di montaggio

Questo documento spiega la linea di sicurezza di questo repo: cosa controlla,
perche' ogni soglia e' dov'e', e cosa NON e' implementato. L'ultima parte e' la
piu' importante: una linea DevSecOps che non dichiara i propri buchi da'
un'impressione di copertura che non ha, ed e' peggio di una linea piu' piccola
e onesta.

Il riferimento e' la [OWASP DevSecOps Guideline][owasp], il cui obiettivo
dichiarato e' uno solo: *scoprire i problemi di sicurezza il prima possibile*.
Tutto quello che segue e' subordinato a quello.

[owasp]: https://owasp.org/www-project-devsecops-guideline/

## Dove gira

| Dove | Comando | Quando |
|---|---|---|
| In locale, tutto | `npm run sicurezza` | quando vuoi |
| In locale, veloce | `npm run sicurezza:veloce` | senza Docker |
| Pre-push | automatico dopo `npm run hooks:install` | a ogni push |
| CI | `.github/workflows/sicurezza.yml` | push, PR, e ogni lunedi' |
| DAST | `.github/workflows/dast.yml` | ogni notte alle 4:00 UTC |

Il pre-push non lancia tutto: solo i segreti e le regole del progetto, una
trentina di secondi. Un gancio che fa aspettare viene disattivato entro una
settimana, e un gancio disattivato vale zero.

## Gli otto passi della guida, e cosa ne e' stato qui

| Passo OWASP | Strumento | Stato |
|---|---|---|
| Scansione dei segreti | gitleaks | **blocca** |
| SAST | semgrep | segnala |
| SCA | pip-audit, npm audit, trivy | **blocca** (produzione) |
| IAST | — | **non implementato**, vedi sotto |
| DAST | OWASP ZAP | **blocca** in notturna |
| Scansione IaC | hadolint, checkov | **blocca** |
| Scansione infrastruttura | trivy image | **blocca** sulle CVE correggibili |
| Verifica di conformita' | `tools/conformita.py` | **blocca** |

## Perche' certe cose bloccano e altre no

E' la decisione piu' importante di tutta la linea, e non e' stata presa a
indovinare: **ogni soglia qui sotto viene da una scansione vera di questo
repo**, fatta prima di scrivere il gate.

Il ragionamento e' sempre lo stesso. Un controllo che segnala e basta viene
letto per due settimane e poi mai piu'. Un controllo che blocca su rumore viene
disattivato ancora prima, e si porta dietro anche quello che aveva ragione.
Quindi: **si blocca solo dove la prima scansione ha dato zero falsi positivi.**

### Segreti — blocca

430 commit scansionati, quattro segnalazioni, **tutte e quattro false**:

- due su una `RECAPTCHA_SITE_KEY` in un file che oggi non esiste piu'. Una
  *site key* di reCAPTCHA e' pubblica per costruzione: sta nel bundle del
  browser. Quella segreta e' `RECAPTCHA_SECRET_KEY`, che vive solo
  nell'ambiente del backend;
- due dentro `.config/replit/.semgrep/semgrep_rules.json`, che e' l'elenco
  delle *regole* di Semgrep: contiene chiavi private e webhook di esempio che
  servono da bersaglio ai pattern. Cercarci segreti veri e' come cercare
  malware nelle firme dell'antivirus.

Le quattro sono in `.gitleaks.toml` con scritto il perche'. La storia e'
pulita, quindi il gate puo' bloccare senza dare fastidio a nessuno.

Blocca anche per un motivo che nessun altro controllo ha: **qui la correzione
non e' una correzione.** Una chiave finita in un commit spinto va *ruotata*,
perche' toglierla dal file non la toglie dai cloni gia' fatti. Trovarla al push
e' l'unico momento in cui costa poco — ed e' per questo che la scansione sta
anche nel pre-push e non solo in CI.

### SAST — segnala, per ora

Prima scansione: **69 segnalazioni**, di cui **50 di una sola regola**
(`avoid-sqlalchemy-text`) che su questo codice sbaglia sistematicamente — qui
`text()` si usa ovunque *con i parametri legati*, che e' il modo corretto di
usarlo. Quella regola e' esclusa.

Delle 19 che restano **nessuna e' sfruttabile**, ma tre sono irrigidimenti
veri, e sono il motivo per cui questo gate non blocca ancora:

1. ~~**`oauth.py:110` — `redirect_uri` costruito da `X-Forwarded-Host`.**~~
   **FATTO.** Era peggio di come l'avevo scritto la prima volta: i due callback
   di Challengermode (`:151`, `:217`) non passavano *nessun* `base_url`, quindi
   costruivano sempre l'indirizzo dall'intestazione. Solo i due di Challonge
   preferivano `APP_BASE_URL`, e ricadevano sull'intestazione se era vuota.

   Ora `_redirect_uri` prende l'indirizzo solo dalla configurazione: se
   `APP_BASE_URL` manca torna stringa vuota, e i chiamanti rispondono
   "OAuth misconfigured" — che e' il ramo di errore che il codice *aveva gia'*,
   quindi non e' stato inventato un modo nuovo di fallire. Verificato
   rilanciando Semgrep: la segnalazione non c'e' piu'.

   **Cosa serve perche' funzioni:** `APP_BASE_URL` impostata. Se un giorno il
   collegamento degli account risponde "OAuth misconfigured", e' quella.

2. **`oauth.py:455` e `oauth.py:472` — corpi di risposta di terzi nei registri.**
   `log.error("Challonge Token Error: %s", token_response.text)` scrive nei log
   la risposta di uno scambio di token fallito. La 472 e' peggio: registra il
   corpo della risposta *user info*, che contiene dati personali dell'utente
   che sta collegando l'account.
   *Cosa serve:* registrare lo stato e non il corpo.

   Semgrep segnalava anche `challengermode.py:98`, ed e' un falso positivo:
   quella riga registra un'eccezione di `path.write_text()` - un errore di
   filesystem - e la regola scatta solo perche' la funzione intorno maneggia
   un token. Verificato leggendo il blocco `try`. Va lasciata com'e'.

3. ~~**`uses:` su tag mobili.**~~
   **FATTO.** Tutte e ventiquattro le occorrenze, undici azioni distinte, sono
   fissate allo SHA con la versione in un commento accanto. Due cose sono
   saltate fuori proprio fissandole:

   - `bridgecrewio/checkov-action@master` puntava a un **ramo**, non a un tag:
     il pin piu' debole che esista, e l'avevo scritto io;
   - `aquasecurity/trivy-action@0.28.0` **non esisteva**. I tag di quell'azione
     hanno la `v` davanti (`v0.28.0`), quindi il lavoro `immagini` sarebbe
     fallito al primo giro su GitHub. Ora e' su `v0.36.0`.

   Anche l'immagine `semgrep/semgrep` del contenitore era senza tag, cioe'
   `latest`, mentre il runner locale fissava `1.97.0`: due Semgrep diversi
   sulla stessa domanda danno due risposte diverse, e non sapresti a quale
   credere. Ora sono lo stesso.

   Il pin da solo pero' *sposta* il problema invece di risolverlo: un
   riferimento congelato non riceve piu' nemmeno le correzioni di sicurezza.
   Per questo e' arrivato con `.github/dependabot.yml`, che ogni lunedi' apre
   **una** PR con dentro tutti gli aggiornamenti - non undici, che nessuno
   guarderebbe.

Delle tre ne resta **una**: la 2. Chiusa quella, questo gate diventa
bloccante. E' scritto qui perche' sia una promessa verificabile e non
un'intenzione.

### SCA — blocca sulla produzione, segnala sullo sviluppo

Sono due lavori separati, e la separazione e' il punto.

Le due segnalazioni con cui questa divisione e' nata — **vite (ALTA)** e
**esbuild (MEDIA)** — erano entrambe nel server di sviluppo di Vite, che **non
esiste nell'immagine di produzione**: quella serve file statici con nginx, e di
Vite non resta niente. Per questo il gate di produzione le ignorava e quello
degli strumenti no.

**Sono chiuse.** npm proponeva `vite@8.2.2` avvisando "breaking change", ma
quello e' solo npm che offre sempre l'ultima: l'avviso copre `vite <=6.4.2`, e
**6.4.3 richiede gia' `esbuild ^0.25.0`**, cioe' la versione corretta. Un
major invece di tre, e `@vitejs/plugin-react` dichiarava gia' di supportarlo.
Verificato prima di applicarlo, su una copia: tipi puliti, build a posto (3040
moduli), immagine costruita e servita, asset con hash raggiungibili.
`npm audit` passa da 2 segnalazioni a 0.

La divisione in due lavori resta, perche' la domanda che separa i due non era
legata a quelle due segnalazioni: "cosa arriva agli utenti" e "cosa gira sulla
macchina di chi sviluppa" restano due rischi diversi, e il secondo conta
comunque - un pacchetto compromesso li' legge i segreti della CI.

### Immagini — blocca solo sulle CVE correggibili

Questa e' la soglia che sarebbe stata sbagliata di sicuro senza misurarla
prima. L'immagine del backend ha **54 CVE ALTA/CRITICA**, e per **zero** di
esse esiste una correzione: sono il fondo di magazzino di `python:3.12-slim` —
zlib, perl, util-linux — e non dipendono da niente che facciamo noi.

Senza `--ignore-unfixed` questo lavoro sarebbe **rosso dal primo giorno e per
sempre**, e verrebbe spento entro un mese. Con `--ignore-unfixed` dice una cosa
sola, ma vera: *esiste una patch e non l'avete presa.*

### DAST — blocca in notturna

Prima scansione vera contro lo stack acceso (Postgres + FastAPI + nginx):
**59 controlli passati, 8 avvisi, 0 fallimenti.**

Sopra la soglia (MEDIO) arrivano solo due regole, entrambe imposte da terzi e
segnate in `zap.conf` con il loro perche':

- **CSP con `unsafe-inline`/`unsafe-eval`**: li impongono reCAPTCHA e AdSense,
  che iniettano script inline. Chiuderla davvero vuol dire nonce generati da
  nginx a ogni richiesta, piu' la verifica che reCAPTCHA li rispetti. E' un
  lavoro vero, non una riga. Intanto `default-src 'self'`, `object-src 'none'`
  e `frame-ancestors 'none'` ci sono e sono strette.
- **SRI mancante**: gli script di Google cambiano contenuto senza versione, un
  hash li romperebbe al primo aggiornamento loro. SRI ha senso su una CDN che
  serve un file fisso; su questi no.

Sotto la soglia, ma vere e da fare:

- **`Permissions-Policy` mancante** — una riga in `nginx.conf.template` che
  spegne fotocamera, microfono e geolocazione, che questo sito non usa.
  Nessuna controindicazione: semplicemente non ancora fatta.
- **COEP/COOP/CORP mancanti** — vanno misurate prima di attivarle, perche' COEP
  rompe gli iframe di terzi (reCAPTCHA, annunci).

Una nota su un allarme che *sembra* grave e non lo e': ZAP ha segnalato
`Application Error Disclosure` su `/sitemap.xml`. E' un 500 **ambientale** — la
scansione gira senza `CHALLENGERMODE_REFRESH_KEY`, la rotta interroga un'API
esterna e fallisce. Verificato a mano che **il corpo della risposta non contiene
la traccia**: torna un sitemap XML vuoto e valido, e lo stack trace resta nei
registri, che e' dove deve stare. Lasciato a `WARN` e non a `IGNORE` apposta:
se un giorno scatta su un'altra rotta, quella e' un'informazione da vedere.

`HSTS` non compare perche' ZAP lo cerca solo su HTTPS e la scansione gira in
chiaro dentro la rete di Docker. **In produzione va impostato su Traefik**, che
e' dove finisce il TLS: nginx qui dietro non lo vede nemmeno.

### Conformita' — blocca

`tools/conformita.py` e' la parte che nessuno scanner del mondo puo' darti,
perche' non riguarda i problemi che hanno tutti i progetti ma le promesse che
si e' fatta *questa* applicazione:

- nessun `.env` versionato, nessuna chiave o certificato;
- niente valori veri dentro i `.env.example`;
- il cookie di sessione con `httponly` e `samesite`;
- le intestazioni di sicurezza ancora al loro posto in nginx;
- la Swagger di FastAPI chiusa al pubblico;
- i container non root, le immagini di base fissate;
- il compose di produzione che passa variabili e non valori;
- ogni workflow con il suo blocco `permissions`;
- il dump della CI senza dati personali.

E' lo stesso mestiere di `check_kb_registry.py` — prendere una cosa che sappiamo
debba essere vera e chiederglielo a ogni push — applicato alla sicurezza. Sono
esattamente le cose che si rompono in silenzio durante una migrazione, perche'
il sito continua a funzionare benissimo senza.

Alla prima esecuzione ha trovato da solo le stesse due cose che aveva trovato
Checkov, il che e' un buon segno per entrambi: `controlli.yml` che girava senza
un blocco `permissions`, e il frontend che girava da root. **Tutte e due sono
state sistemate** — la prima con `permissions: contents: read`, la seconda
passando a `nginxinc/nginx-unprivileged`.

Il secondo caso merita una nota, perche' sembrava il piu' costoso e non lo era.
L'immagine non privilegiata di norma ascolta sulla 8080, e cambiare porta
avrebbe voluto dire toccare anche Coolify e Traefik — cioe' rischiare di far
cadere il sito per una pulizia. Si e' rivelato non necessario: dentro un
container Docker `net.ipv4.ip_unprivileged_port_start` vale `0`, quindi anche
uid 101 puo' legarsi alla porta 80. Verificato accendendo lo stack: PID 1 gira
come `nginx`, la 80 ascolta, `/api` inoltra, la Swagger risponde ancora 404.
**Nessuna modifica al deploy.**

## IAST: perche' non c'e'

E' l'unico degli otto passi che non e' implementato, ed e' una decisione, non
una dimenticanza.

IAST significa un agente dentro il processo dell'applicazione, che osserva il
flusso dei dati *mentre* il codice gira e segnala quando un valore non fidato
arriva in un punto pericoloso. E' la tecnica che sta fra SAST (legge il codice
fermo, non sa cosa succede davvero) e DAST (vede solo l'esterno, non sa
perche').

Per Python e FastAPI, gli agenti IAST che fanno davvero questo mestiere sono
prodotti commerciali (Contrast, Datadog IAST, Seeker). **Non esiste un
equivalente libero** che faccia analisi del flusso a runtime su questo stack.

La tentazione, in un progetto che vuole spuntare tutte e otto le caselle, e'
chiamare "IAST" qualcos'altro — di solito far girare la suite di test con lo
scanner attaccato — e considerarla chiusa. Sarebbe **peggio che lasciarla
aperta**: la casella spuntata toglie la domanda dal tavolo, e nessuno torna a
guardarci.

Quello che copre parzialmente il buco, oggi:

- i **187 test** con database che passano su ogni push;
- il **DAST notturno**, che vede l'applicazione viva anche se solo da fuori;
- il **SAST**, che vede il flusso dei dati ma senza sapere quali rami girano.

Resta scoperto: le vulnerabilita' che si vedono solo mettendo insieme la
richiesta esterna e il percorso interno che segue. Se un giorno questo progetto
avesse un budget per uno strumento commerciale, **e' qui che andrebbe speso.**

## Aggiungere una soppressione

Prima o poi uno di questi controlli segnalera' qualcosa che non e' un problema.
La strada e' sempre la stessa, in tutti e cinque i file di configurazione
(`.gitleaks.toml`, `.hadolint.yaml`, `.checkov.yaml`, `.semgrepignore`,
`zap.conf`):

**si scrive accanto il perche'.**

Non e' una regola di stile. Una soppressione senza motivo e' indistinguibile,
sei mesi dopo, da una falla messa a tacere di venerdi' sera — e nessuno se la
sentira' mai di toglierla, perche' non sa cosa succede se lo fa. Se non sai
spiegare perche' quella segnalazione non e' un problema, quasi sicuramente lo e'.

`tools/leggi_zap.py` questa regola la applica proprio: un `IGNORE` in
`zap.conf` senza terza colonna viene trattato come "senza motivo scritto".

## Saltare i controlli sui commit di sola documentazione

L'idea viene in mente a tutti prima o poi: se un commit tocca solo il README,
perche' far girare test, tipi e due build Docker? GitHub ha `paths-ignore`
apposta, ed e' una riga.

**Non e' stato fatto**, e i motivi valgono piu' della riga risparmiata.

### `**.md` qui sarebbe la regola sbagliata

`knowledge/` contiene **171 file `.md`**, e non sono documentazione: sono il
corpus del RAG. `check_kb_registry.py` li legge e verifica che ogni
`canonical_name:` si risolva nel registro dei pezzi - e' il controllo numero 5
del suo elenco.

Un `paths-ignore: '**.md'` spegnerebbe proprio quel controllo, sui file che in
questo repo cambiano piu' spesso di tutti. Sarebbe la classica regola che
sembra innocua e disattiva l'unica cosa che ti proteggeva, senza dirlo.

Se un giorno la si scrive, la forma e' `*.md` e non `**.md`: nei filtri di
GitHub `*` non attraversa le `/`, quindi prende solo la radice e lascia stare
`knowledge/`. La differenza fra le due e' un asterisco e un controllo di
integrita' della base di conoscenza.

### E comunque non su `sicurezza`

Semmai, solo su `controlli`: test, tipi, migrazioni e build non possono essere
rotti da un file markdown, quindi li' saltare e' guadagno secco.

Su `sicurezza` no, per via di **gitleaks**. La documentazione e' esattamente il
posto dove un segreto finisce per sbaglio: un `curl` d'esempio con un token
vero, una stringa di connessione dentro un runbook, una chiave incollata in una
nota di risoluzione dei problemi. Saltare la scansione dei segreti sui commit
di sola documentazione la toglie **dove il rischio e' piu' alto, non piu'
basso.**

### Quanto si risparmia, davvero

Misurato sui giri veri: `controlli` circa **43 secondi**, `sicurezza` circa
**50**. In gioco c'e' un minuto scarso. Costruire filtri per lavoro, e
ricordarsi per sempre di tenerli allineati, per un minuto e con quei due rischi
sopra, non e' un buon affare.

### La trappola che arrivera' dopo

Oggi `main` non e' protetto e non ha check obbligatori, quindi `paths-ignore`
sarebbe innocuo da quel lato. **Il giorno che attivi la branch protection
cambia tutto**: un check filtrato via non parte, GitHub lo aspetta per sempre,
e la PR di sola documentazione resta bloccata su "Expected - Waiting for status
to be reported". Non fallisce: resta li'.

Da quel momento il modo corretto non e' piu' `paths-ignore`, ma far partire il
workflow sempre e uscire subito dall'interno, cosi' il check riporta comunque
il suo esito verde.

## Cosa resta da fare

In ordine di rapporto fra utilita' e fatica:

1. **`Permissions-Policy` in nginx** — una riga, nessuna controindicazione.
2. **Non registrare i corpi delle risposte OAuth** — `oauth.py:455` e `:472`.
   E' l'ultima cosa che separa il gate SAST dal poter bloccare.
3. **HSTS su Traefik** — dove finisce il TLS, non in nginx.
4. **COEP/COOP/CORP** — da misurare prima di attivare: COEP rompe gli iframe
   di reCAPTCHA e degli annunci.
5. **Nonce nella CSP** — il piu' costoso, e quello che chiuderebbe l'unico
   avviso MEDIO rimasto nel DAST.

Gia' fatto, e tolto da questa lista: il frontend non gira piu' da root, i
workflow dichiarano tutti i loro permessi, il `redirect_uri` di OAuth non viene
piu' da un'intestazione, e i riferimenti alle azioni sono fissati con qualcuno
che li aggiorna.

## Il buco piu' grande, che non e' nessuno degli otto passi

Vale la pena dirlo in fondo, perche' e' la cosa che questa pagina rischia di
far dimenticare proprio riuscendo bene.

**ZAP scansiona da non autenticato.** Tutto cio' che sta dietro il login — il
profilo, i preferiti, `/api/admin` — non viene mai raggiunto. Il controllo
degli accessi e' la categoria **A01** della OWASP Top 10, la prima, quella da
cui vengono piu' violazioni reali di qualunque altra: un IDOR, una rotta di
amministrazione che si accontenta di `require_auth` invece di `require_admin`,
un oggetto altrui raggiungibile cambiando un id nell'URL. **Niente di tutto
questo verrebbe visto da un solo controllo di quelli qui sopra.**

Nemmeno i 187 test coprono quel terreno: sono test funzionali, e in `tests/`
non c'e' un solo test che tocchi OAuth o l'autorizzazione.

Quindi: questa linea verifica molto bene **l'impianto** — segreti,
dipendenze, configurazione, contenitori, intestazioni. Della **logica di
autorizzazione dell'applicazione** non sa niente. E' la differenza fra "nessuno
degli errori noti" e "sicuro", e vale la pena tenerla presente prima di
guardare sette spunte verdi e concludere la seconda.

Il passo successivo piu' utile, se un giorno se ne vuole fare uno, non e' un
nono strumento: sono dei test di autorizzazione — utente A che prova a leggere
le cose di B, utente normale che bussa a `/api/admin` — che sono normalissimo
pytest e girerebbero nella linea che gia' esiste.
