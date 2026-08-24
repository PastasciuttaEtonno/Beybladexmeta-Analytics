---
id: rule.identita-combo
type: rule
lang: it
status: ok
doc_version: 1
sources: ["decisione di modellazione del progetto, 2026-08-21"]
---

# Cosa identifica una combo

Riferimento per capire perché due assetti che sembrano diversi risultano la
stessa combo nelle statistiche del sito.

## Componenti che identificano una combo

Una combo è identificata da cinque posizioni: Lock Chip, Blade, Assist Blade,
Ratchet e Bit. Sono i componenti registrati per ogni piazzamento e sono quelli
che compaiono nell'identificatore della combo.

Due assetti che differiscono in almeno una di queste posizioni sono due combo
distinte e vengono conteggiate separatamente.

## Componenti volutamente non tracciati

L'Over Blade non viene registrato. La scelta è deliberata: non rende una combo
diversa da un'altra combo identica in tutto tranne l'Over Blade. Di conseguenza
sul sito non esiste un filtro per Over Blade e nessuna statistica è suddivisa
per Over Blade — non perché il dato manchi, ma perché non distinguerebbe nulla.

Lo stesso vale per il Lock Chip di plastica, quello standard: non differenzia
una combo dall'altra e per questo non viene registrato come componente a sé.

## Come vengono trattati i Lock Chip

Solo i Lock Chip in metallo vengono registrati, perché sono gli unici che
distinguono una combo da un'altra. Nelle statistiche compaiono con il loro nome:
`emperor` e `valkyrie`.

Una combo che monta il Lock Chip di plastica standard risulta senza Lock Chip:
la posizione è registrata come `None`. Non significa che il pezzo non ci sia
fisicamente, significa che non è uno dei Lock Chip che il sito distingue.

Questo spiega perché il valore `None` domina largamente le statistiche dei Lock
Chip: raccoglie tutte le combo che montano quello di plastica.

## Conseguenze quando si leggono le statistiche

- Il conteggio dei piazzamenti di una combo somma assetti che possono avere Over
  Blade diversi fra loro.
- Un confronto fra due combo che differiscono solo per l'Over Blade non è
  possibile con i dati del sito, e non lo sarà: non è una lacuna da colmare ma
  una scelta di cosa considerare rilevante.
- Cercare il Lock Chip `None` non filtra le combo prive di Lock Chip, ma quelle
  che ne montano uno non distintivo.
