"""Importa in meta_snapshot il CSV del foglio meta.

Il foglio ha 754 combo con il numero di vittorie; unified_meta_view ne ricava
126 dai tornei importati. E' un campione sei volte piu' grande, ed e' cio' che
rende le sinergie significative su molti piu' pezzi.

    python tools/import_meta_snapshot.py --url "$DATABASE_URL" \\
        --csv "C:/.../beyblade-combo-ranking.csv" --captured-at 2026-08-21 --apply

Due scelte che non sono dettagli.

**La cattura sostituisce, non aggiorna.** Il foglio e' una classifica gia'
aggregata: mescolare la versione di oggi con quella di ieri sommerebbe due volte
gli stessi tornei. Ogni import cancella le righe della stessa fonte e riscrive.

**I nomi vengono verificati contro component_registry, non fidati.** Se il
foglio scrive un pezzo in modo che il database non conosce, la riga viene
importata ma il nome segnalato: da li' in poi ogni join su quel pezzo tornerebbe
vuoto, ed e' meglio saperlo all'import che scoprirlo da una risposta sbagliata.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Le colonne A-H del foglio, nell'ordine in cui compaiono.
COLUMNS = ["lock_chip", "over_blade", "blade", "assist_blade", "ratchet", "bit",
           "points", "win_count"]
RANK_COLUMNS = {"combo_rank": 8, "rank_change": 9}

PLACEHOLDERS = {"", "none", "-", "n/a"}

# Gli slot che il database modella. over_blade non c'e': non identifica una
# combo, quindi si importa ma non si verifica contro il registry.
VERIFIED_SLOTS = {"blade": "blade", "assist_blade": "assist_blade",
                  "ratchet": "ratchet", "bit": "bit", "lock_chip": "lock_chip"}


def clean(value: str) -> str | None:
    value = (value or "").strip()
    return None if value.lower() in PLACEHOLDERS else value


def as_number(value: str):
    value = (value or "").strip().replace(",", "")
    if not re.fullmatch(r"-?\d+(\.\d+)?", value):
        return None
    return float(value) if "." in value else int(value)


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--csv", required=True)
    parser.add_argument("--source", default="google-sheet")
    parser.add_argument("--source-ref", default="",
                        help="es. l'URL del foglio, o il gid del tab")
    parser.add_argument("--captured-at", default=date.today().isoformat(),
                        help="quando il foglio e' stato scaricato, non quando lo importi")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    try:
        import psycopg
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore
        except ImportError:
            print("Serve psycopg:  uv pip install psycopg[binary]", file=sys.stderr)
            return 1

    path = Path(args.csv)
    if not path.exists():
        print(f"{path} non esiste", file=sys.stderr)
        return 1

    rows = []
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for record in list(csv.reader(handle))[1:]:
            if len(record) < len(COLUMNS):
                continue
            entry = {name: clean(record[i]) for i, name in enumerate(COLUMNS[:6])}
            entry["points"] = as_number(record[6])
            entry["win_count"] = as_number(record[7])
            for name, index in RANK_COLUMNS.items():
                raw = record[index] if len(record) > index else ""
                entry[name] = as_number(raw) if name == "combo_rank" else clean(raw)
            # Una riga senza blade ne' bit non e' una combo: nel foglio le
            # colonne a destra ospitano tabelle di supporto sulle stesse righe.
            if not entry["blade"] and not entry["bit"]:
                continue
            rows.append(entry)

    print(f"{len(rows)} combo lette da {path.name}")
    if not rows:
        return 1

    url = args.url.replace("postgresql+asyncpg://", "postgresql://")
    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT slot, canonical_name FROM component_registry")
            known: dict[str, set[str]] = {}
            for slot, name in cursor.fetchall():
                known.setdefault(slot, set()).add(norm(name))

        unknown: dict[str, set[str]] = {}
        for entry in rows:
            for field, slot in VERIFIED_SLOTS.items():
                value = entry.get(field)
                if value and norm(value) not in known.get(slot, set()):
                    unknown.setdefault(slot, set()).add(value)

        if unknown:
            print("\nNomi che il registry non conosce - ogni join su questi "
                  "tornerebbe vuoto:")
            for slot, names in sorted(unknown.items()):
                print(f"  {slot:13} {', '.join(sorted(names)[:8])}"
                      + (f" ... e altri {len(names)-8}" if len(names) > 8 else ""))

        if args.dry_run:
            print(f"\n{len(rows)} righe pronte, nessuna scritta (--dry-run)")
            return 0

        with connection.cursor() as cursor:
            # Sostituzione, non aggiornamento: vedi la docstring.
            cursor.execute("DELETE FROM meta_snapshot WHERE source = %s", (args.source,))
            removed = cursor.rowcount
            for entry in rows:
                cursor.execute(
                    "INSERT INTO meta_snapshot (source, source_ref, captured_at, "
                    "  lock_chip, over_blade, blade, assist_blade, ratchet, \"bit\", "
                    "  points, win_count, combo_rank, rank_change) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                    (args.source, args.source_ref or None, args.captured_at,
                     entry["lock_chip"], entry["over_blade"], entry["blade"],
                     entry["assist_blade"], entry["ratchet"], entry["bit"],
                     entry["points"], entry["win_count"], entry["combo_rank"],
                     entry["rank_change"]),
                )
        connection.commit()
        print(f"\nRimosse {removed} righe della cattura precedente, "
              f"inserite {len(rows)} nuove (catturate il {args.captured_at}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
