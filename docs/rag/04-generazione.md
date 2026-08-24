# 04 — La generazione

> **M4.** Gli strumenti quantitativi, il prompt, l'astrazione del fornitore, e
> la guardia che verifica ciò che il modello ha scritto.

Il recupero porta il contesto. Qui si decide cosa il modello può farne.

## Gli strumenti: i numeri non passano dall'indice

Sei strumenti (`tools.py`, 694 righe). Il modello decide quali chiamare; il
database risponde.

| Strumento | Domanda a cui risponde |
|---|---|
| `top_combos` | Le combo più forti, per periodo o regione |
| `component_ranking` | La classifica di uno slot |
| `component_usage` | Quanto e come si usa un pezzo |
| `combo_detail` | Una combinazione precisa |
| `compare_components` | Due pezzi affiancati |
| `current_meta` | Il meta di oggi, dallo snapshot esterno |

### Ogni risultato porta con sé il suo contesto

`ToolResult` obbliga tre campi: `sample_size`, `as_of`, `source`. Non sono
decorativi.

**`sample_size`** perché una classifica costruita su tre risultati è formalmente
vera e praticamente inutile. Sotto i 10 piazzamenti lo strumento aggiunge da solo
una nota che il modello è tenuto a riportare (*"su soli N piazzamenti"*).

**`as_of`** perché *"il meta attuale"* significa cose diverse a distanza di un
mese, e una risposta senza data invecchia senza dirlo.

**`source`** perché lo snapshot esterno e i piazzamenti verificati **non vanno
sommati**: sono conteggi di popolazioni diverse. Lo strumento lo dice, e il
prompt lo ripete.

### Un errore restituito, non sollevato

`call_tool()` non solleva eccezioni: restituisce un risultato con un campo di
errore. Se il modello chiama uno strumento con argomenti sbagliati, riceve una
spiegazione e riprova. Sollevare interromperebbe il turno per un errore che il
modello sa correggere da solo.

### Ogni interrogazione una volta sola

Osservato in esercizio: il modello ha chiamato `current_meta` **tre volte con gli
stessi argomenti** nello stesso turno. Tre giri sul database, tre copie dello
stesso risultato nel contesto, tre indicatori identici nell'interfaccia.

`_ToolCache` deduplica per `(nome, argomenti ordinati)`. Il dettaglio che conta:
**la ripetizione riceve comunque il risultato**, dalla cache. Il protocollo esige
un `tool_result` per ogni `call_id`, e ometterne uno lascia il modello ad
aspettare una risposta che non arriverà mai.

## Il prompt

`prompt.py`, 170 righe di cui la maggior parte è il `SYSTEM_PROMPT`. Sei regole
non negoziabili; le tre che portano più peso:

1. **Rispondi solo da ciò che hai davanti.** Se documenti e strumenti non
   bastano, dillo. Una risposta plausibile e non verificabile è peggio di un
   "non lo so", perché fa perdere fiducia anche nelle risposte giuste.

2. **Cita.** Ogni affermazione presa da un documento porta il suo identificatore;
   ogni numero preso da uno strumento dice quale — e mai fra doppie parentesi,
   perché quella forma indica un documento e uno strumento non lo è.

3. **Non calcolare.** Percentuali, somme e confronti li fanno gli strumenti. Se
   serve un numero che nessuno strumento ha dato, non si stima.

> **Nessun esempio dentro un prompt deve essere copiabile come dato valido.**
> Questa frase è nel prompt perché è costata una citazione falsa: la regola 2
> diceva «non inventare identificatori» e mostrava, due parole prima,
> `[[knowledge/blades/wizard-rod.md]]` — un percorso reale. Il modello l'ha
> copiato. Dettaglio completo nel capitolo [07](07-errori-che-insegnano.md).

## L'astrazione del fornitore

Due protocolli: `LanguageModel` e `Conversation`. Il ciclo di generazione non sa
quale modello sta parlando.

Serve perché i formati sono davvero diversi, non per pulizia formale:

| | Anthropic | OpenAI / OpenRouter |
|---|---|---|
| Chiamate a strumenti | Blocchi `tool_use` nel contenuto | `tool_calls` a parte |
| Argomenti | Oggetto già decodificato | **Stringa JSON** da decodificare |
| Risultati | Blocchi `tool_result` | Messaggi con ruolo `tool` |
| Errori | Stato HTTP | **Anche dentro un HTTP 200** |

L'ultima riga è la più insidiosa e ha prodotto un difetto vero: OpenRouter
restituisce i guasti dentro il corpo di una risposta 200. Un percorso che si fida
dello stato HTTP consegna una risposta vuota dichiarandola riuscita.

Cambiare fornitore sono due righe in `.env`. La configurazione attuale è
OpenRouter (piano gratuito); l'adattatore Claude è scritto e testato.

## Il ciclo, e cosa succede quando finisce male

Quattro giri di strumenti al massimo (`MAX_TOOL_ROUNDS = 4`): senza un tetto, un
modello che continua a interrogare è una bolletta senza fondo.

Ma **esaurire i giri non è una risposta.** Osservato: il modello ha consumato
tutti e quattro i giri chiamando strumenti e non ha mai scritto niente; il ciclo
usciva per limite raggiunto e consegnava il testo vuoto che aveva in mano — un
`done` regolare, lunghezza zero, nessun errore. Indistinguibile, per il client,
da «non aveva niente da dire».

Ora, se il testo è vuoto, si serve l'ultimo giro di chiamate pendenti e poi si
**chiede la conclusione** (`FINAL_NUDGE`). La sollecitazione concede di smettere
di raccogliere, non di smettere di attenersi alle fonti: «rispondi comunque»
inviterebbe a colmare i vuoti a memoria, cioè esattamente ciò che la pipeline
esiste per impedire. Se anche il secondo tentativo è vuoto, è un errore
dichiarato.

## La guardia

`guard.py` legge la risposta finita e verifica tre cose.

**Citazioni fantasma** — ogni `[[percorso]]` scritto dal modello deve
corrispondere a una fonte davvero iniettata. È una verifica **meccanica e
completa**: o il percorso è nella lista o non c'è.

**Strumenti inesistenti** — un `(fonte: ...)` che nomina uno strumento mai
definito.

**Numeri non fondati** — un'euristica, non una prova: cerca ogni numero della
risposta nei risultati degli strumenti e nel contesto. Tollera il separatore
delle migliaia (`4.261` per 4261) e gli arrotondamenti agli interi (14 per 14,3),
perché senza queste due tolleranze segnalava numeri corretti su risposte
corrette — e un allarme che grida sempre viene ignorato.

**La risposta non viene bloccata.** È già scritta, e nasconderla non la migliora.
Il verdetto viene registrato in `chat_message.phantom_citations` e restituito
all'interfaccia. Le citazioni fantasma dovrebbero essere sempre zero; quella
colonna è il modo in cui si scopre che non lo sono.

## Le due valutazioni

Rispondono a due domande diverse e vanno tenute separate.

**`tools/eval_retrieval.py`** — *ha trovato i documenti giusti?* Golden set di 25
casi, con gli slug attesi. Include casi **`expected_none`**, dove la risposta
giusta è astenersi: senza, si misurerebbe solo metà del comportamento.

**`tools/eval_generation.py`** — *cosa ci ha scritto?* Cita? Riporta la
numerosità del campione? Distingue opinione da fatto?

Stato: 19 casi valutabili su 20 passano, 5 in attesa che le schede vengano
scritte — e quei 5 sono corretti così: misurano anche quanto corpus manca.

---

Prossimo: [05 — La consegna](05-consegna.md)
