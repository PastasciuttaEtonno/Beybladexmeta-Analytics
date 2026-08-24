"""Le domande vere diventano casi del golden set.

Il golden set v0 l'ho scritto io immaginando cosa avrebbe chiesto la gente.
Sono domande ragionevoli e non sono quelle vere: chi usa il sito scrive in modo
diverso da chi ha costruito lo schema, e le domande che sbagliano sono quasi
sempre di forme che non avevo previsto.

`chat_message` le registra tutte. Questo strumento le tira fuori dando la
precedenza a quelle che sono andate male, perche' un caso che gia' passa non
insegna niente:

  1. pollice giu'                 - qualcuno ha detto che la risposta e' sbagliata
  2. citazioni fantasma           - ha citato fonti inesistenti
  3. astensioni                   - non ha risposto: o manca la scheda o il
                                    recupero e' troppo severo, e sono due cure opposte

Non scrive nel golden set: stampa i casi in una forma da incollare, con
expected_docs da riempire a mano. Cosa DOVEVA trovare e' un giudizio umano, e
generarlo dal recupero stesso significherebbe misurare il sistema col suo
stesso metro.

    python tools/harvest_questions.py --url "$DATABASE_URL"
    python tools/harvest_questions.py --url "$DATABASE_URL" --kind abstained
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend-py"))

import yaml  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

# Le tre categorie e la query che le trova. La domanda dell'utente e' il
# messaggio 'user' che PRECEDE la risposta, quindi serve la finestra: prendere
# il messaggio successivo per id e' l'unico legame che le unisce.
QUERIES = {
    "thumbs_down": (
        "una persona ha detto che la risposta e' sbagliata",
        "a.feedback = -1",
    ),
    "phantom": (
        "ha citato fonti che non esistono",
        "a.phantom_citations <> '[]'::jsonb",
    ),
    "abstained": (
        "non ha risposto: manca la scheda, o il recupero e' troppo severo",
        "a.abstained",
    ),
}

SQL = """
SELECT q.content AS question,
       a.abstained,
       a.retrieval,
       a.phantom_citations,
       a.feedback,
       a.created_at
FROM chat_message a
JOIN LATERAL (
    SELECT content FROM chat_message
    WHERE session_id = a.session_id AND role = 'user' AND id < a.id
    ORDER BY id DESC LIMIT 1
) q ON true
WHERE a.role = 'assistant' AND ({condition})
ORDER BY a.created_at DESC
LIMIT :limit
"""


def slugify(question: str) -> str:
    """Un id leggibile e stabile, ricavato dalla domanda."""
    words = re.findall(r"[a-z0-9]+", question.lower())
    return "-".join(words[:6]) or "domanda"


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.environ.get("DATABASE_URL", ""))
    parser.add_argument("--kind", choices=[*QUERIES, "all"], default="all")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--golden", default="eval/golden_set.yaml",
                        help="usato solo per NON riproporre domande gia' presenti")
    args = parser.parse_args()

    if not args.url:
        print("serve --url o DATABASE_URL", file=sys.stderr)
        return 2

    # Le domande gia' nel golden set non si ripropongono: il file cresce a mano,
    # e un duplicato costa piu' tempo di quanto ne valga il caso.
    known: set[str] = set()
    golden = Path(args.golden)
    if golden.exists():
        data = yaml.safe_load(golden.read_text(encoding="utf-8")) or {}
        known = {c.get("query", "").strip().lower() for c in (data.get("cases") or [])}

    engine = create_async_engine(args.url.replace("postgresql://", "postgresql+asyncpg://"))
    kinds = list(QUERIES) if args.kind == "all" else [args.kind]

    total = 0
    async with engine.connect() as conn:
        for kind in kinds:
            why, condition = QUERIES[kind]
            rows = (await conn.execute(text(SQL.format(condition=condition)),
                                       {"limit": args.limit})).mappings().all()
            fresh = [r for r in rows if r["question"].strip().lower() not in known]

            print(f"\n# === {kind}: {why} ===")
            if not rows:
                print(f"#     nessun caso. Con {kind} e' una buona notizia.")
                continue
            if not fresh:
                print(f"#     {len(rows)} caso/i, tutti gia' nel golden set.")
                continue

            for row in fresh:
                total += 1
                report = row["retrieval"] or {}
                counts = report.get("branch_counts") or {}
                print(f"""
  - id: {slugify(row['question'])}
    query: "{row['question'].replace('"', "'")}"
    # da riempire a mano: quali schede DOVEVA trovare.
    expected_docs: []
    tags: [raccolto, {kind}]
    # rami dense/fulltext/exact: {counts.get('dense', '?')}/{counts.get('fulltext', '?')}/{counts.get('exact', '?')}\
{chr(10) + '    # motivo astensione: ' + str(report.get('reason')) if report.get('reason') else ''}\
{chr(10) + '    # citazioni fantasma: ' + str(row['phantom_citations']) if row['phantom_citations'] else ''}""")

    await engine.dispose()

    print(f"\n# {total} caso/i nuovo/i da valutare.")
    if total:
        print("# Riempi expected_docs e incolla in eval/golden_set.yaml.")
        print("# expected_docs: [] significa 'deve astenersi' - lascialo solo se e' vero.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
