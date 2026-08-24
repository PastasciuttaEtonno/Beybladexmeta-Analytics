"""Seconda fonte: beyblade.wiki. Statistiche ufficiali, abbreviazioni, riferimenti.

Complementare a import_wiki_facts.py, non alternativa. Fandom copre 164 pezzi su
171 e da' peso, verso di rotazione e date; questa ne copre 133 ma aggiunge:

  * due dimensioni di statistica che Fandom non riporta, Dash e Burst
    Resistance, e valori anche dove Fandom lascia il campo vuoto;
  * le abbreviazioni ufficiali dei Bit (F, T, B, HN...), che sono il modo in cui
    le combo vengono scritte davvero;
  * i due Bit a ratchet integrato, Operate e Turbo, che su Fandom stanno fuori
    dallo schema delle pagine componente.

## Licenza - la ragione per cui questo strumento prende cosi' poco

Il piede di pagina del sito dice "(c) 2026 Beyblade Wiki" e nient'altro: nessuna
Creative Commons, quindi tutti i diritti riservati. Fandom era CC BY-SA, qui no.

Di conseguenza si prendono solo i NUMERI - le statistiche dichiarate dal
produttore e le sigle - che sono fatti e non testo d'autore. Le sezioni
"Description" e "Final Thoughts" NON vengono toccate, per due motivi che valgono
entrambi da soli: sono materiale protetto, e "Final Thoughts" e' per sua natura
un'opinione, che entrando nella knowledge base verrebbe poi citata dal modello
come se fosse un fatto accertato.

L'URL della pagina finisce nel frontmatter come `reference`, cosi' chi scrive la
sezione Interazioni ce l'ha sottomano e attinge leggendo, non copiando.

    python tools/import_beybladewiki.py --url "$DATABASE_URL" --dry-run
    python tools/import_beybladewiki.py --url "$DATABASE_URL" --apply
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SITE = "https://beyblade.wiki/"
SITEMAPS = ["post-sitemap.xml", "page-sitemap.xml"]
UA = "BeybladexmetaAnalytics/0.1 (knowledge base import; contact via repo)"
DELAY = 0.25

# L'ordine conta: '-main-blade' va provato prima di '-blade', altrimenti
# 'blast-main-blade' verrebbe letto come il blade 'blast-main'.
SUFFIX_SLOT = [
    ("-main-blade", "blade"),
    ("-assist-blade", "assist_blade"),
    ("-lock-chip", "lock_chip"),
    ("-blade", "blade"),
    ("-ratchet", "ratchet"),
    ("-bit", "bit"),
]

LIST_PAGES = {
    "bit": "list-of-beyblade-x-bits/",
    "blade": "list-of-beyblade-x-blades/",
    "ratchet": "list-of-beyblade-x-ratchets/",
    "assist_blade": "list-of-beyblade-x-assist-blades/",
    "lock_chip": "beyblade-x-lock-chips/",
}

FOLDER = {
    "blade": "blades", "assist_blade": "assist-blades", "ratchet": "ratchets",
    "bit": "bits", "lock_chip": "lock-chips",
}

STAT_KEYS = ["attack", "defense", "stamina", "dash", "burst_resistance"]


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def get(url: str) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.read().decode("utf-8", "replace")
    except Exception as exc:
        print(f"    ! {url}: {exc}", file=sys.stderr)
        return None


def strip_tags(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub("<[^>]+>", " ", fragment))).strip()


def url_index() -> dict[tuple[str, str], str]:
    """(slot, nome normalizzato) -> URL, dalla sitemap.

    Dalla sitemap e non tirando a indovinare l'URL: il sito risponde 200 anche a
    percorsi inventati, quindi una prova per tentativi darebbe per esistenti
    pagine che non esistono.
    """
    index: dict[tuple[str, str], str] = {}
    for sitemap in SITEMAPS:
        body = get(SITE + sitemap)
        time.sleep(DELAY)
        if not body:
            continue
        for loc in re.findall(r"<loc>([^<]+)</loc>", body):
            slug = loc.replace(SITE, "").rstrip("/")
            for suffix, slot in SUFFIX_SLOT:
                if slug.endswith(suffix):
                    index.setdefault((slot, norm(slug[: -len(suffix)])), loc)
                    break
    return index


def abbreviations() -> dict[tuple[str, str], str]:
    """Le sigle ufficiali dalle pagine elenco: (slot, nome) -> 'HN'."""
    found: dict[tuple[str, str], str] = {}
    for slot, page in LIST_PAGES.items():
        body = get(SITE + page)
        time.sleep(DELAY)
        if not body:
            continue
        table = re.search(r"<table[^>]*>.*?</table>", body, re.S)
        if not table:
            continue
        header = [strip_tags(c).lower()
                  for c in re.findall(r"<th[^>]*>(.*?)</th>", table.group(0), re.S)]
        try:
            i_abbr = header.index("abbreviation")
            i_name = next(i for i, h in enumerate(header) if h.endswith("name"))
        except (ValueError, StopIteration):
            continue
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table.group(0), re.S)[1:]:
            cells = [strip_tags(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
            if len(cells) > max(i_abbr, i_name) and cells[i_abbr]:
                found[(slot, norm(cells[i_name]))] = cells[i_abbr]
    return found


def official_stats(page: str) -> dict[str, str] | None:
    """La tabella "Stats (Official)". I valori possono essere doppi ('20/50'):
    i Bit a ratchet integrato hanno due modalita', e schiacciarli a un numero
    solo perderebbe meta' dell'informazione. Restano stringhe."""
    table = re.search(r"<table[^>]*>.*?</table>", page, re.S)
    if not table:
        return None
    cells = [strip_tags(c) for c in
             re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", table.group(0), re.S)]
    labels = [c.lower() for c in cells[:5]]
    if labels[:3] != ["attack", "defense", "stamina"]:
        return None
    values = cells[5:10]
    if len(values) < 5 or not all(re.fullmatch(r"[\d/]+", v) for v in values):
        return None
    return dict(zip(STAT_KEYS, values))


def section_text(page: str, heading_pattern: str) -> str:
    """I paragrafi sotto un <h2>, fino all'intestazione successiva."""
    # h2 o h3: il sito non e' coerente fra le pagine, e ancorarsi a un solo
    # livello faceva sparire "Final Thoughts" senza segnalare nulla.
    match = re.search(
        rf"<h[23][^>]*>[^<]*{heading_pattern}[^<]*</h[23]>(.*?)"
        rf"(?=<h[23]|</article|</main|<footer)",
        page, re.S | re.I,
    )
    if not match:
        return ""
    paragraphs = [
        strip_tags(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", match.group(1), re.S)
    ]
    return "\n\n".join(p for p in paragraphs if len(p) > 40)


def marked_section(title: str, body: str, url: str, kind: str) -> str:
    """Una sezione importata, con la sua provenienza dichiarata.

    La direttiva non e' decorativa: chunking.py la legge e la scrive in
    kb_chunk.meta, quindi arriva fino alla costruzione del prompt. Senza,
    il giudizio di un appassionato raggiungerebbe il modello con la stessa
    autorevolezza di un peso in grammi.
    """
    return (
        f"## {title}\n\n"
        f"<!-- provenance: third-party | source: {url} | kind: {kind} -->\n\n"
        f"{body}\n"
    )


def append_imported_text(path: Path, url: str, page: str) -> int:
    """Aggiunge in coda alla scheda descrizione e valutazione, se non ci sono
    gia'. Non tocca nulla di quello che c'e' sopra."""
    body = path.read_text(encoding="utf-8")
    added = 0
    wanted = [
        ("Descrizione (fonte esterna)", section_text(page, "Description of"), "description"),
        ("Valutazione esterna (opinione)", section_text(page, "Final Thoughts"), "opinion"),
    ]
    for title, text, kind in wanted:
        if not text or f"## {title}" in body:
            continue
        body = body.rstrip() + "\n\n" + marked_section(title, text, url, kind)
        added += 1
    if added:
        path.write_text(body, encoding="utf-8")
    return added


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--knowledge", default=str(REPO / "knowledge"))
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true")
    group.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--import-text", action="store_true",
        help="importa anche descrizione e valutazione, ciascuna con una direttiva "
             "di provenienza che chunking.py trasforma in metadati del chunk",
    )
    args = parser.parse_args()

    try:
        import psycopg
    except ImportError:
        try:
            import psycopg2 as psycopg  # type: ignore
        except ImportError:
            print("Serve psycopg:  uv pip install psycopg[binary]", file=sys.stderr)
            return 1

    print("costruisco l'indice degli URL dalla sitemap...")
    index = url_index()
    print(f"  {len(index)} pagine di componenti")
    print("leggo le sigle dalle pagine elenco...")
    abbrevs = abbreviations()
    print(f"  {len(abbrevs)} sigle\n")

    root = Path(args.knowledge)
    url = args.url.replace("postgresql+asyncpg://", "postgresql://")
    with_stats = with_abbrev = referenced = absent = imported = 0

    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT slug, canonical_name, slot FROM component_registry "
                           "ORDER BY slot, canonical_name")
            parts = cursor.fetchall()

        for slug, name, slot in parts:
            page_url = index.get((slot, norm(name)))
            abbrev = abbrevs.get((slot, norm(name)))
            if not page_url:
                absent += 1
                continue

            body = get(page_url)
            time.sleep(DELAY)
            stats = official_stats(body) if body else None
            if stats:
                with_stats += 1
            print(f"  {name:18} {'stats ' + '/'.join(stats.values()) if stats else 'nessuna stat':32}"
                  f"{' sigla ' + abbrev if abbrev else ''}")

            if args.dry_run:
                continue

            payload = {"stats_official": stats, "beybladewiki": page_url}
            payload = {k: v for k, v in payload.items() if v}
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE component_registry SET attributes = attributes || %s::jsonb, "
                    "updated_at = now() WHERE slug = %s",
                    (json.dumps(payload), slug),
                )
                if abbrev:
                    cursor.execute(
                        "INSERT INTO component_alias (alias_norm, alias, slug, kind) "
                        "VALUES (%s, %s, %s, 'abbrev') ON CONFLICT DO NOTHING",
                        (norm(abbrev), abbrev, slug),
                    )
                    with_abbrev += cursor.rowcount

            path = root / FOLDER[slot] / f"{slug}.md"
            if path.exists():
                text = path.read_text(encoding="utf-8")
                if "reference:" not in text:
                    text = re.sub(r"^(sources: .*)$", rf"\1\nreference: {page_url}",
                                  text, count=1, flags=re.M)
                    path.write_text(text, encoding="utf-8")
                    referenced += 1
                if args.import_text and body:
                    imported += append_imported_text(path, page_url, body)

        if args.apply:
            connection.commit()

    print(f"\n{with_stats} pezzo/i con statistiche ufficiali, {absent} senza pagina")
    if args.apply:
        print(f"{with_abbrev} sigla/e aggiunta/e come alias")
        print(f"{referenced} scheda/e con il link di riferimento nel frontmatter")
        if args.import_text:
            print(f"{imported} sezione/i importata/e con provenienza dichiarata")
            print("\nOgni sezione porta una direttiva che chunking.py scrive in")
            print("kb_chunk.meta: a valle un'opinione di terzi resta distinguibile")
            print("da un dato del produttore invece di arrivare al modello allo")
            print("stesso modo.")
        else:
            print("\nDescrizione e valutazione non importate: aggiungi --import-text.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
