"""Genera la sezione "Sinergie note" dalle co-occorrenze reali nei piazzamenti.

Le sinergie non si scrivono a mano: sono un fatto statistico, e un fatto
statistico scritto a mano invecchia in silenzio. Questo le ricava da
unified_meta_view e le riscrive a ogni esecuzione, con la data e la numerosita'
in chiaro dentro il testo.

    python tools/generate_synergies.py --url "$DATABASE_URL" --dry-run
    python tools/generate_synergies.py --url "$DATABASE_URL" --apply
    python tools/generate_synergies.py --url "$DATABASE_URL" --apply --min-sample 12

Il vincolo che conta e' --min-sample. Con 126 piazzamenti complessivi solo pochi
pezzi hanno abbastanza righe perche' una percentuale voglia dire qualcosa: sotto
la soglia la sezione NON viene scritta, invece di produrre "usato nel 100% dei
casi con 9-60" a partire da due piazzamenti. Una sezione assente e' un'assenza
di informazione; una percentuale su n=2 e' disinformazione con l'aria di un dato.

Una sezione modificata a mano non viene mai sovrascritta: per rigenerarla,
cancellane il contenuto e rilancia.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SLOT_COLUMN = {
    "blade": "blade",
    "assist_blade": "assist_blade",
    "ratchet": "ratchet",
    "bit": '"bit"',
    "lock_chip": "lock_chip",
}

# Le due fonti possibili, con cio' che serve per citarle onestamente.
#
# I tornei importati danno 126 piazzamenti e coprono 17 blade; il foglio meta ne
# da' 755 e ne copre 80. Sono numeri diversi perche' misurano cose diverse - i
# primi sono piazzamenti grezzi, il secondo una classifica gia' aggregata da
# qualcun altro - quindi non si sommano e la scheda dice sempre quale ha usato.
SOURCES = {
    "tornei": {
        "table": "unified_meta_view",
        "unit": "piazzamenti",
        "weight": "1",
        "label": "i tornei importati nel sito",
        "extra": "",
    },
    "foglio": {
        "table": "meta_snapshot",
        "unit": "vittorie",
        "weight": "coalesce(win_count, 0)",
        "label": "il foglio meta",
        "extra": " AND win_count > 0",
    },
}
FOLDER = {
    "blade": "blades", "assist_blade": "assist-blades", "ratchet": "ratchets",
    "bit": "bits", "lock_chip": "lock-chips",
}
SLOT_IT = {
    "blade": "Blade", "assist_blade": "Assist Blade", "ratchet": "Ratchet",
    "bit": "Bit", "lock_chip": "Lock Chip",
}

PLACEHOLDERS = {"NONE", "-", ""}

SECTION = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
PLACEHOLDER = re.compile(r"\A(?:\s|<!--.*?-->|TODO\b.*|_.*_)*\Z", re.DOTALL | re.IGNORECASE)
GENERATED = "<!-- Generato da tools/generate_synergies.py"


def replace_section(body: str, heading: str, new_text: str) -> tuple[str, bool]:
    """Sostituisce se e' un segnaposto, o se il contenuto attuale l'ha generato
    questo stesso strumento. Il testo scritto da una persona resta intoccato."""
    matches = list(SECTION.finditer(body))
    for index, match in enumerate(matches):
        if match.group(1).strip().lower() != heading.lower():
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        current = body[start:end]
        if not PLACEHOLDER.match(current) and GENERATED not in current:
            return body, False
        return body[:start] + "\n" + new_text + "\n\n" + body[end:], True
    return body, False


def render(name: str, slot: str, total: int, partners: dict, as_of: str,
           src: dict) -> str:
    lines = [
        f"Su **{total} {src['unit']}** di {name} secondo {src['label']}, "
        f"i pezzi che compaiono piu' spesso nella stessa combo sono questi.",
        "",
    ]
    for other_slot, rows in partners.items():
        if not rows:
            continue
        lines.append(f"**{SLOT_IT[other_slot]}**")
        for partner, count in rows:
            share = count / total * 100
            lines.append(f"- {partner} — {count} su {total} ({share:.0f}%)")
        lines.append("")
    lines.append(
        "Co-occorrenza, non causa: questi pezzi compaiono insieme nelle combo che "
        "sono andate a podio, il che non dimostra da solo che si potenzino a "
        "vicenda. La spiegazione del perche' va nella sezione Interazioni, e la "
        "scrive una persona."
    )
    lines.append("")
    lines.append(
        f"{GENERATED} il {as_of} da {src['table']}. Rilancialo dopo ogni "
        f"import; se riscrivi questa sezione a mano non verra' piu' toccata. -->"
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--knowledge", default=str(REPO / "knowledge"))
    parser.add_argument("--min-sample", type=int, default=10,
                        help="piazzamenti minimi perche' le percentuali valgano (default 10)")
    parser.add_argument("--top", type=int, default=3, help="quanti partner per slot")
    parser.add_argument("--season", help="solo questa stagione; solo con --source tornei")
    parser.add_argument("--source", choices=sorted(SOURCES), default="foglio",
                        help="da quale fonte contare. Default: foglio, che ha "
                             "755 righe contro le 126 dei tornei importati")
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

    src = SOURCES[args.source]
    if args.season and args.source != "tornei":
        print("--season vale solo per --source tornei: meta_snapshot e' una "
              "cattura a una data, non una serie storica per stagione.",
              file=sys.stderr)
        return 1

    url = args.url.replace("postgresql+asyncpg://", "postgresql://")
    root = Path(args.knowledge)
    as_of = date.today().isoformat()
    written = skipped_small = 0

    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT slug, canonical_name, slot FROM component_registry "
                           "ORDER BY slot, canonical_name")
            parts = cursor.fetchall()

        for slug, name, slot in parts:
            column = SLOT_COLUMN[slot]
            season = " AND season = %s" if args.season else ""
            with connection.cursor() as cursor:
                cursor.execute(
                    f"SELECT coalesce(sum({src['weight']}), 0)::bigint "  # noqa: S608
                    f"FROM {src['table']} WHERE {column} = %s{season}{src['extra']}",
                    (name, args.season) if args.season else (name,),
                )
                total = cursor.fetchone()[0]

            if total < args.min_sample:
                if total:
                    skipped_small += 1
                continue

            partners: dict[str, list[tuple[str, int]]] = {}
            for other_slot, other_column in SLOT_COLUMN.items():
                if other_slot == slot:
                    continue
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"SELECT {other_column} AS partner, "  # noqa: S608
                        f"       sum({src['weight']})::bigint AS n "
                        f"FROM {src['table']} WHERE {column} = %s{season}{src['extra']} "
                        f"GROUP BY 1 ORDER BY n DESC NULLS LAST LIMIT %s",
                        (name, args.season, args.top) if args.season else (name, args.top),
                    )
                    rows = [
                        (partner, n) for partner, n in cursor.fetchall()
                        if partner and n and partner.strip().upper() not in PLACEHOLDERS
                    ]
                partners[other_slot] = rows

            if not any(partners.values()):
                continue

            text = render(name, slot, total, partners, as_of, src)
            path = root / FOLDER[slot] / f"{slug}.md"
            print(f"  {name:16} n={total:3}  ->  {path.relative_to(REPO)}")
            if args.dry_run or not path.exists():
                continue
            body = path.read_text(encoding="utf-8")
            body, changed = replace_section(body, "Sinergie note", text)
            if changed:
                path.write_text(body, encoding="utf-8")
                written += 1

    print(f"\n{written} sezione/i scritta/e da {src['table']}")
    print(f"{skipped_small} pezzo/i saltato/i: hanno {src['unit']} ma meno di "
          f"{args.min_sample}, quindi una percentuale sarebbe rumore")
    return 0


if __name__ == "__main__":
    sys.exit(main())
