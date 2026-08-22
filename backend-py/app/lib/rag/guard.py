"""Verifica meccanica della risposta, dopo che il modello l'ha scritta.

Tutto il resto del sistema chiede al modello di comportarsi bene. Questo
modulo e' l'unica parte che CONTROLLA, e la differenza e' sostanziale: le regole
nel prompt di sistema sono istruzioni, e un'istruzione puo' essere disattesa
senza che nessuno se ne accorga.

Due controlli, con capacita' molto diverse fra loro - e la differenza va detta,
non nascosta.

**Le citazioni sono verificabili del tutto.** Gli identificatori che il modello
scrive o compaiono fra quelli iniettati, o non esistono. Non c'e' zona grigia,
e una citazione inventata e' il segnale piu' netto che una risposta e' stata
costruita a memoria invece che dal contesto.

**I numeri lo sono in parte.** Si estraggono quelli scritti nella risposta e si
cercano nel contesto e nei risultati degli strumenti. Un numero che non compare
da nessuna parte e' quasi certamente inventato; ma un numero che compare
potrebbe essere stato usato a sproposito, e uno calcolato correttamente da due
altri verrebbe segnalato a torto. E' quindi un indizio con un tasso di falsi
positivi, non un verdetto - e viene restituito come tale.

Nessuno dei due riscrive la risposta. Cancellare una citazione inventata
lascerebbe in piedi l'affermazione che sosteneva, che e' la parte sbagliata.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# [[knowledge/blades/wizard-rod.md]] - la forma che il prompt impone.
CITATION = re.compile(r"\[\[([^\]]+)\]\]")

# (fonte: component_usage)
TOOL_CITATION = re.compile(r"\(fonte:\s*([a-z_]+)\)", re.IGNORECASE)

# I numeri nel testo: interi, decimali con virgola o punto, percentuali.
NUMBER = re.compile(r"\d+(?:[.,]\d+)?")

# Numeri che non vale la pena verificare: fanno parte del linguaggio, non dei
# dati. "una delle 3 posizioni", "primi 5", "anni 2026".
IGNORED_NUMBERS = {"0", "1", "2", "3", "4", "5", "10", "100"}


@dataclass
class Verdict:
    """Cosa non torna in una risposta. Vuoto significa che i controlli passano,
    non che la risposta sia giusta: la correttezza non e' verificabile qui."""

    phantom_citations: list[str] = field(default_factory=list)
    unknown_tools: list[str] = field(default_factory=list)
    unsourced_numbers: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        """Solo le citazioni fantasma e gli strumenti inesistenti fanno fallire.

        I numeri senza fonte no: il controllo ha falsi positivi noti, e far
        fallire una risposta buona per un'euristica sarebbe peggio del problema
        che risolve. Restano nel verdetto perche' vanno guardati.
        """
        return not self.phantom_citations and not self.unknown_tools

    def to_dict(self) -> dict[str, Any]:
        return {
            "phantom_citations": self.phantom_citations,
            "unknown_tools": self.unknown_tools,
            "unsourced_numbers": self.unsourced_numbers,
        }


def _numbers_in(value: Any) -> set[str]:
    """Ogni numero dentro una struttura annidata, come stringa normalizzata."""
    found: set[str] = set()
    if isinstance(value, dict):
        for item in value.values():
            found |= _numbers_in(item)
    elif isinstance(value, (list, tuple)):
        for item in value:
            found |= _numbers_in(item)
    elif isinstance(value, bool):
        pass
    elif isinstance(value, (int, float)):
        found.add(_normalise_number(value))
    elif isinstance(value, str):
        found |= {_normalise_number(n) for n in NUMBER.findall(value)}
    return found


def _normalise_number(value: Any) -> str:
    """'75,0' e 75.0 e '75' sono lo stesso numero. Senza normalizzare, il
    controllo segnalerebbe ogni percentuale scritta all'italiana."""
    text = str(value).replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return text
    return str(int(number)) if number == int(number) else f"{number:g}"


# Separatore delle migliaia: un punto o uno spazio seguito da esattamente tre
# cifre. '4.261' e' quattromiladuecentosessantuno; '14.3' e' quattordici virgola
# tre, e il gruppo di tre cifre non c'e'.
THOUSANDS = re.compile(r"[.\s](?=\d{3}\b)")


def _sourced(raw: str, available: set[str]) -> bool:
    """Il numero scritto nella risposta risale a uno che il modello ha ricevuto?

    Tre forme, tutte legittime, e ignorarle rendeva il controllo inutilizzabile:
    sulla prima risposta vera segnalava cinque numeri, e tutti e cinque erano
    corretti.

      1. identico
      2. scritto con il separatore delle migliaia: la risposta dice '4.261',
         il payload contiene 4261
      3. arrotondato all'intero: la risposta dice '14%', il payload dice 14.3

    L'arrotondamento si concede SOLO quando la risposta scrive un intero. Se
    scrive '14,7' e il dato e' 14,3 non e' un arrotondamento: e' un numero
    diverso, e va segnalato.
    """
    if _normalise_number(raw) in available:
        return True

    without_separators = THOUSANDS.sub("", raw)
    if without_separators != raw and _normalise_number(without_separators) in available:
        return True

    try:
        value = float(raw.replace(",", "."))
    except ValueError:
        return False
    if value != int(value):
        return False

    for other in available:
        try:
            candidate = float(other)
        except ValueError:
            continue
        if abs(candidate - value) < 0.5:
            return True
    return False


def verify(
    answer: str,
    *,
    injected_sources: set[str],
    tool_names: set[str],
    tool_results: list[Any] | None = None,
    context_text: str = "",
) -> Verdict:
    """Confronta cio' che la risposta afferma con cio' che le e' stato dato.

    `injected_sources` sono i `source_path` dei chunk finiti nel prompt, non
    tutti quelli del corpus: citare un documento reale ma non recuperato e'
    comunque inventarselo, perche' il modello non l'ha letto.
    """
    verdict = Verdict()

    for cited in CITATION.findall(answer):
        if cited.strip() not in injected_sources:
            verdict.phantom_citations.append(cited.strip())

    for tool in TOOL_CITATION.findall(answer):
        if tool.lower() not in tool_names:
            verdict.unknown_tools.append(tool)

    available = _numbers_in(tool_results or []) | _numbers_in(context_text)
    for raw in NUMBER.findall(answer):
        if raw in IGNORED_NUMBERS:
            continue
        if _normalise_number(raw) in IGNORED_NUMBERS:
            continue
        if not _sourced(raw, available):
            verdict.unsourced_numbers.append(raw)

    # Un numero ripetuto e' un problema solo, non tre.
    verdict.unsourced_numbers = sorted(set(verdict.unsourced_numbers))
    return verdict


def sources_from(hits: list[Any]) -> set[str]:
    return {hit.source_path for hit in hits}
