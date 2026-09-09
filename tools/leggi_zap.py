"""Legge il referto di ZAP e decide se la scansione e' passata.

ZAP sa fallire da solo, ma la sua soglia vive dentro le opzioni della riga di
comando: per sapere cosa fa fallire la notturna dovresti leggere un workflow e
ricordarti cosa significano `-I` e `-l`. Qui invece la soglia sta in zap.conf,
che e' un file di testo con scritto accanto a ogni regola PERCHE' e' stata
messa a IGNORE - ed e' quella colonna, non la regola, la parte che serve fra
sei mesi.

    python tools/leggi_zap.py referto-zap.json

Esce 1 se resta anche solo un allarme non spiegato. La logica e' la stessa di
tutta la linea: si blocca su cio' che e' stato guardato in faccia una volta,
si tace su cio' che e' stato spiegato per iscritto.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# ZAP numera i rischi 0..3. Sotto MEDIO non si blocca: la baseline segnala
# volentieri cose come "il sito rivela un timestamp", che non e' una falla ma
# un dettaglio, e una linea che si ferma su quelli si spegne da sola.
SOGLIA = 2  # 0 informativo, 1 basso, 2 medio, 3 alto
NOMI = {0: "informativo", 1: "basso", 2: "MEDIO", 3: "ALTO"}


def regole_spiegate() -> dict[str, str]:
    """Le regole messe a IGNORE in zap.conf, con la loro spiegazione."""
    file = REPO / "zap.conf"
    if not file.is_file():
        return {}

    spiegate: dict[str, str] = {}
    for riga in file.read_text(encoding="utf-8").splitlines():
        riga = riga.strip()
        if not riga or riga.startswith("#"):
            continue
        pezzi = re.split(r"\s*\t\s*|\s{2,}", riga)
        if len(pezzi) >= 2 and pezzi[1].upper() == "IGNORE":
            spiegate[pezzi[0]] = pezzi[2] if len(pezzi) > 2 else "(senza motivo scritto)"
    return spiegate


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: python tools/leggi_zap.py <referto.json>")
        return 2

    referto = Path(sys.argv[1])
    if not referto.is_file():
        print(f"referto non trovato: {referto}")
        print("ZAP non e' arrivato in fondo: guarda i registri del lavoro.")
        return 1

    dati = json.loads(referto.read_text(encoding="utf-8", errors="replace"))
    spiegate = regole_spiegate()

    allarmi = []
    for sito in dati.get("site", []):
        for allarme in sito.get("alerts", []):
            allarmi.append({
                "id": str(allarme.get("pluginid", "?")),
                "nome": allarme.get("name", "?"),
                "rischio": int(str(allarme.get("riskcode", "0")) or 0),
                "quante": len(allarme.get("instances", [])),
            })

    allarmi.sort(key=lambda a: -a["rischio"])

    print()
    print("=" * 70)
    if not allarmi:
        print("  ZAP non ha segnalato niente.")
    for allarme in allarmi:
        stato = "spiegato" if allarme["id"] in spiegate else "        "
        print(f"  {NOMI[allarme['rischio']]:12} {stato}  [{allarme['id']:>6}] "
              f"{allarme['nome'][:44]:44} x{allarme['quante']}")
    print("=" * 70)

    fermano = [a for a in allarmi
               if a["rischio"] >= SOGLIA and a["id"] not in spiegate]

    if fermano:
        print(f"\n{len(fermano)} allarme/i da guardare:\n")
        for allarme in fermano:
            print(f"  [{allarme['id']}] {allarme['nome']}  ({NOMI[allarme['rischio']]},"
                  f" {allarme['quante']} occorrenze)")
        print("\nDue strade oneste, e nessuna terza:")
        print("  - sistemarlo;")
        print("  - metterlo a IGNORE in zap.conf CON SCRITTO IL PERCHE'.")
        print("Un IGNORE senza motivo e' un problema nascosto, non risolto.")
        return 1

    ignorati = sum(1 for a in allarmi if a["id"] in spiegate)
    print(f"\nnessun allarme sopra la soglia ({ignorati} spiegati in zap.conf)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
