# 05 — La consegna

> **M5 e M6.** Streaming SSE e interfaccia. Perché una risposta che arriva in
> quaranta secondi va consegnata in modo diverso da una che arriva in due.

## Il problema

Una risposta completa richiede: embedding della domanda, tre rami di ricerca,
re-rank, una chiamata al modello, uno o più giri di strumenti, un'altra chiamata.
Con un modello gratuito la latenza mediana misurata è stata **fra 45 e 75
secondi**.

Quaranta secondi di rotellina sono un abbandono. Ma quei quaranta secondi non
sono vuoti: succedono cose che si possono raccontare.

## Sei eventi, che sono un contratto

| Evento | Quando | Perché esiste |
|---|---|---|
| `status` | A ogni fase | Riempie l'attesa di informazione vera, non di un'animazione |
| `sources` | Appena il recupero finisce | **Prima del testo**: chi legge sa su cosa si baserà la risposta mentre viene scritta |
| `tool` | A ogni interrogazione | Rende visibile che i numeri vengono da una query, non dalla memoria del modello |
| `delta` | A ogni frammento di testo | Il testo che scorre |
| `done` | Alla fine | Risposta completa, fonti, verdetto della guardia, consumo |
| `error` | Se qualcosa si rompe | Messaggio generico più codice — vedi [06](06-esercizio.md) |

L'ordine di `sources` **prima** di `delta` non è un dettaglio implementativo: è
la scelta che rende l'attesa comprensibile. L'utente vede da dove verrà la
risposta prima di vederla.

## Perché SSE e non WebSocket

Il flusso è a senso unico: il server parla, il client ascolta. SSE attraversa
proxy e CDN senza configurazione; i WebSocket dietro nginx richiedono header
aggiuntivi. Una bidirezionalità che non serve non vale una dipendenza in più nel
percorso.

Un accorgimento necessario: `X-Accel-Buffering: no`. Nginx bufferizza le risposte
per impostazione predefinita, e con un buffer lo streaming smette di essere
streaming — arriva tutto insieme alla fine, che è il comportamento che si stava
cercando di evitare.

## Il ponte fra sincrono e asincrono

Gli SDK dei modelli consegnano i frammenti tramite una **callback sincrona**;
FastAPI vuole un **generatore asincrono**. `_with_deltas()` fa da ponte con una
coda e un sentinella di fine.

Il risultato che conta: `answer()` e `answer_stream()` producono la stessa
risposta, e un test lo verifica confrontandole campo per campo — compresi i
contatori di consumo. Se i due percorsi divergessero, il costo di una risposta
dipenderebbe da come è stata consegnata.

## L'interfaccia

`useChatStream.ts` legge il flusso con `fetch` invece di `EventSource`, perché
serve una richiesta **POST** con un corpo — e `EventSource` fa solo GET.

I frammenti si accumulano e si scaricano una volta per fotogramma con
`requestAnimationFrame`. Senza, ogni frammento provocherebbe un render e il testo
lungo scatterebbe. Un `AbortController` permette di fermare la risposta a metà.

Due punti d'accesso:

- **`/chat`**, la pagina intera;
- **il lanciatore**, un pulsante presente su ogni pagina che apre lo stesso
  pannello di lato.

Il secondo esiste perché la domanda nasce mentre si guarda una combo — *«ma
questo bit perché si usa tanto?»* — e obbligare a cambiare pagina spezza proprio
il momento in cui l'assistente serve.

Il pannello è caricato in ritardo: chi non lo apre non paga il codice dello
streaming nel primo caricamento. Attenzione a un tranello: importare il pannello
staticamente da qualunque punto **annulla** il caricamento differito, e il
sintomo è nessun sintomo — funziona tutto, semplicemente il bundle non si è
diviso. Va verificato guardando i chunk prodotti dalla build.

## Un difetto di posizionamento che vale una regola

Il pulsante del lanciatore aveva le classi `fixed bottom-20 right-4 z-40`. Non
era fisso.

Il design system del progetto definisce:

```css
.hover-elevate:not(.no-default-hover-elevate), … { position: relative; z-index: 0; }
```

Quel selettore ha **specificità maggiore** di `.fixed`, quindi vinceva. Il
pulsante restava nel flusso in fondo al documento, e `bottom`/`right` venivano
letti come scostamenti relativi: finiva a `left: -16px`, mezzo tagliato sotto il
bordo. Anche `z-40` era annullato dallo `z-index: 0` della stessa regola.

**La regola generale:** un elemento che partecipa a un sistema di effetti basato
su `position: relative` non può essere anche `position: fixed`. Il
posizionamento va su un contenitore. La cura alternativa — la classe di fuga
`no-default-hover-elevate` — sistema la posizione spegnendo l'effetto, cioè
rinunciando alla ragione per cui quella regola esiste.

---

Prossimo: [06 — L'esercizio](06-esercizio.md)
