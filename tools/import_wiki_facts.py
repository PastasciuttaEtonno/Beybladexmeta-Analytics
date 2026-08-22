"""Importa dalla Beyblade Wiki i FATTI di ogni pezzo, e ne compila la sezione Profilo.

Cosa prende e cosa no, perche' la distinzione conta:

  * PRENDE i campi dell'infobox - peso, tipo, verso di rotazione, stat, codice
    prodotto, date di uscita, nome Hasbro, legalita' X Standard. Sono dati
    fattuali: un peso di 35,3 grammi e' un fatto, non un testo d'autore, e
    riportarlo non e' riprodurre la pagina.
  * NON COPIA la prosa della wiki. Le descrizioni sono materiale sotto licenza
    CC BY-SA: riprodurle nella repo obbligherebbe l'intero progetto alla stessa
    licenza. Il Profilo viene quindi SCRITTO qui a partire dai campi, in
    italiano, e la pagina di origine finisce in `sources` come riferimento.
  * NON TOCCA le sezioni Interazioni e Sinergie note. La prima e' lavoro umano,
    la seconda si genera dalle statistiche (tools/generate_synergies.py).

    python tools/import_wiki_facts.py --url "$DATABASE_URL" --dry-run --only wizard-rod
    python tools/import_wiki_facts.py --url "$DATABASE_URL" --apply --slot ratchet
    python tools/import_wiki_facts.py --url "$DATABASE_URL" --apply --write-profiles

Una sezione Profilo gia' scritta a mano non viene mai sovrascritta.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
API = "https://beyblade.fandom.com/api.php"
PAGE = "https://beyblade.fandom.com/wiki/"
UA = "BeybladexmetaAnalytics/0.1 (knowledge base import; contact via repo)"

# Un quarto di secondo fra le richieste. Non e' un limite imposto: e' educazione
# verso un sito che ci sta regalando i dati.
DELAY = 0.25

# Piu' di un prefisso per slot, in ordine di tentativo. Un Blade CX e' titolato
# "Main Blade - X" e non "Blade - X": con un prefisso solo sparivano 31 blade su
# 86, tutti quelli del sistema Custom Line, e sembrava che la wiki non li avesse.
CLASSIFICATION = {
    "blade": ["Blade", "Main Blade", "Metal Blade"],
    "assist_blade": ["Assist Blade"],
    "ratchet": ["Ratchet"],
    "bit": ["Bit"],
    "lock_chip": ["Lock Chip"],
}

FOLDER = {
    "blade": "blades",
    "assist_blade": "assist-blades",
    "ratchet": "ratchets",
    "bit": "bits",
    "lock_chip": "lock-chips",
}

SYSTEM = {"Basic Line": "BX", "Unique Line": "UX", "Custom Line": "CX"}

# I campi che teniamo. Tutto il resto dell'infobox viene ignorato.
FIELDS = [
    "Name", "AKA", "ProductCode", "Classification", "Type", "SpinDirection",
    "Weight", "System", "ReleaseJP", "ReleaseUS", "Height",
    "AttackStat", "DefenseStat", "StaminaStat", "XStandard",
]

TYPE_IT = {
    "Attack": "attacco", "Defense": "difesa", "Stamina": "resistenza",
    "Balance": "equilibrio",
}
SPIN_IT = {"Right-Spin": "rotazione destrorsa", "Left-Spin": "rotazione sinistrorsa",
           "Dual-Spin": "doppio verso di rotazione"}

INFOBOX_FIELD = re.compile(r"^\|\s*(\w+)\s*=\s*(.*?)\s*$", re.M)
SECTION = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)
PLACEHOLDER = re.compile(r"\A(?:\s|<!--.*?-->|TODO\b.*|_.*_)*\Z", re.DOTALL | re.IGNORECASE)


def clean(value: str) -> str:
    """Toglie il markup wiki lasciando il testo. [[Blade - X|X]] -> X."""
    value = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", value)
    value = re.sub(r"\[\[([^\]]*)\]\]", r"\1", value)
    value = re.sub(r"<br\s*/?>", " / ", value)
    value = re.sub(r"<[^>]+>", "", value)
    value = re.sub(r"\{\{[^}]*\}\}", "", value)
    return re.sub(r"\s+", " ", value).strip()


def fetch(title: str) -> tuple[str, str] | None:
    """(titolo effettivo, wikitext). I redirect vengono seguiti: 'Blade -
    CrocCrunch' rimanda a 'Blade - Bite Croc', e senza seguirlo si otteneva la
    riga '#REDIRECT' - nessun infobox, quindi pezzo dichiarato introvabile."""
    url = (f"{API}?action=parse&page={urllib.parse.quote(title)}"
           f"&prop=wikitext&redirects=1&format=json")
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except Exception as exc:  # rete, timeout, JSON malformato
        print(f"    ! {title}: {exc}", file=sys.stderr)
        return None
    if "error" in payload:
        return None
    return payload["parse"]["title"], payload["parse"]["wikitext"]["*"]


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def title_index(classifications: list[str]) -> dict[str, str]:
    """Tutti i titoli di pagina sotto i prefissi dati, indicizzati per nome
    normalizzato.

    Sostituisce la ricerca per parole chiave, che era il punto debole del
    procedimento: cercando 'T.Rex' la wiki restituiva 'Blade - TyrannoBeat' come
    primo risultato utile, e solo la verifica finale impediva di attaccare a un
    pezzo le statistiche di un altro. L'indice invece e' esatto - 'T.Rex' e
    'T. Rex' normalizzano entrambi a 'trex' - e costa sette richieste in tutto
    invece di una ricerca per pezzo.
    """
    index: dict[str, str] = {}
    for classification in classifications:
        prefix = f"{classification} - "
        cont = None
        while True:
            url = (f"{API}?action=query&list=allpages"
                   f"&apprefix={urllib.parse.quote(prefix)}&aplimit=500&format=json")
            if cont:
                url += f"&apcontinue={urllib.parse.quote(cont)}"
            request = urllib.request.Request(url, headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    payload = json.load(response)
            except Exception as exc:
                print(f"    ! indice {prefix}: {exc}", file=sys.stderr)
                break
            for page in payload["query"]["allpages"]:
                # setdefault: il primo prefisso vince, cosi' 'Blade - X' batte
                # 'Metal Blade - X' se per assurdo esistessero entrambi.
                index.setdefault(norm(page["title"].split(" - ", 1)[-1]), page["title"])
            cont = payload.get("continue", {}).get("apcontinue")
            if not cont:
                break
    return index


def matches(title: str, facts: dict, name: str) -> bool:
    """Il pezzo trovato e' davvero quello cercato?

    Senza questo controllo la ricerca per nome puo' agganciare un pezzo vicino
    - 'Dran' che porta a DranSword - e attaccare a un componente il peso e le
    statistiche di un altro. Sarebbe un errore invisibile: la scheda sembrerebbe
    completa e sarebbe sbagliata.
    """
    wanted = norm(name)
    candidates = {norm(title.split(" - ", 1)[-1]), norm(facts.get("Name", ""))}
    candidates.update(
        norm(re.sub(r"\s*\((?:Hasbro|Takara Tomy)\)\s*", "", part))
        for part in facts.get("AKA", "").split("/")
    )
    candidates.discard("")
    return wanted in candidates


def resolve(index: dict[str, str], name: str) -> tuple[str, dict] | None:
    """Trova il titolo nell'indice e ne legge la scheda."""
    asked = index.get(norm(name))
    if not asked:
        return None
    result = fetch(asked)
    time.sleep(DELAY)
    if not result:
        return None
    landed, wikitext = result
    facts = parse_infobox(wikitext)
    if not facts:
        return None
    # Il titolo viene dall'indice, quindi il nome normalizzato coincide gia'.
    # matches() resta come rete: se la pagina fosse un redirect verso un pezzo
    # diverso, e' la wiki stessa a dichiarare l'equivalenza (landed != asked).
    if landed != asked or matches(landed, facts, name):
        return landed, facts
    return None


INFOBOX_START = re.compile(r"\{\{\s*[\w ]*Infobox", re.I)


def infobox_block(wikitext: str) -> str:
    """Il blocco dell'infobox, delimitato contando le graffe.

    Prima questa funzione prendeva "tutto fino al primo }}", che si rompe su
    ogni pagina che si apre con una nota di disambiguazione: Bit - Ball comincia
    con {{About|...}}, quindi la testa finiva dopo 49 caratteri e l'infobox non
    veniva mai letto. Il pezzo risultava "senza pagina" pur avendone una.
    """
    match = INFOBOX_START.search(wikitext)
    if not match:
        return ""
    depth, index = 0, match.start()
    while index < len(wikitext):
        if wikitext.startswith("{{", index):
            depth += 1
            index += 2
        elif wikitext.startswith("}}", index):
            depth -= 1
            index += 2
            if depth == 0:
                return wikitext[match.start():index]
        else:
            index += 1
    return wikitext[match.start():]


def parse_infobox(wikitext: str) -> dict[str, str]:
    block = infobox_block(wikitext)
    found = {}
    for key, raw in INFOBOX_FIELD.findall(block):
        if key in FIELDS:
            value = clean(raw)
            if value:
                found[key] = value
    return found


def weight_grams(value: str) -> float | None:
    match = re.search(r"([\d.]+)", value)
    return float(match.group(1)) if match else None


KIND_IT = {
    "blade": "Blade", "assist_blade": "Assist Blade", "ratchet": "Ratchet",
    "bit": "Bit", "lock_chip": "Lock Chip",
}


def _generated_note(page_title: str) -> str:
    return (
        f"<!-- Generato da tools/import_wiki_facts.py dai campi scheda di "
        f"{PAGE}{urllib.parse.quote(page_title.replace(' ', '_'))} — "
        f"fatti, non prosa della wiki. Riscrivilo pure: una sezione modificata "
        f"a mano non viene piu' toccata. -->"
    )


def render_profile(name: str, slot: str, facts: dict, page_title: str) -> str:
    """Il Profilo, scritto dai fatti. Nessuna frase proviene dalla wiki."""
    lines: list[str] = []
    system = facts.get("System", "")
    sigla = SYSTEM.get(system)

    opening = f"**{name}** è un {KIND_IT[slot]}"
    if sigla:
        opening += f" del sistema {sigla} ({system})"
    tipo = TYPE_IT.get(facts.get("Type", ""))
    if tipo:
        opening += f", di tipo {tipo}"
    lines.append(opening + ".")

    dettagli = []
    grams = weight_grams(facts.get("Weight", ""))
    if grams:
        dettagli.append(f"pesa {str(grams).replace('.', ',')} grammi")
    spin = SPIN_IT.get(facts.get("SpinDirection", ""))
    if spin:
        dettagli.append(f"ha {spin}")
    if dettagli:
        lines.append("Il pezzo " + " e ".join(dettagli) + ".")

    stats = [(k, facts.get(f"{k}Stat")) for k in ("Attack", "Defense", "Stamina")]
    stats = [(k, v) for k, v in stats if v and v.isdigit()]
    if stats:
        parts = ", ".join(f"{TYPE_IT[k]} {v}" for k, v in stats)
        lines.append(
            f"Le statistiche dichiarate dal produttore sono {parts}. "
            f"Sono valori del produttore, non misure di torneo: descrivono "
            f"l'intenzione di progetto, non il rendimento reale."
        )

    hasbro = [
        re.sub(r"\s*\((?:Hasbro|Takara Tomy|Youngtoys)\)\s*", "", part).strip()
        for part in facts.get("AKA", "").split("/")
    ]
    hasbro = [h for h in hasbro if h and len(h) > 2 and norm(h) != norm(name)]
    if hasbro:
        lines.append(
            f"Nelle edizioni occidentali il pezzo è distribuito con il nome "
            f"{' o '.join(hasbro)}."
        )

    lines.append("")
    lines.append(_generated_note(page_title))
    return "\n".join(lines)


def render_format_notes(name: str, facts: dict, page_title: str) -> str:
    """Note di formato: solo cio' che e' verificabile dai campi scheda.

    I "rulings" della wiki - parti limitate, Hall of Fame, decisioni B4 - sono
    prosa e cambiano nel tempo, quindi non vengono copiati: la sezione rimanda
    alla pagina e lascia a chi scrive il compito di riassumere cio' che conta.
    """
    lines: list[str] = []
    if facts.get("XStandard"):
        lines.append(f"**{name}** è marcato come legale nel formato X Standard.")
    if facts.get("ProductCode"):
        lines.append(f"Codice prodotto: {facts['ProductCode']}.")
    uscite = [
        ("Giappone", facts.get("ReleaseJP")),
        ("Stati Uniti", facts.get("ReleaseUS")),
    ]
    uscite = [(dove, quando) for dove, quando in uscite if quando]
    if uscite:
        lines.append(
            "Uscita: " + ", ".join(f"{dove} {quando}" for dove, quando in uscite) + "."
        )
    if not lines:
        return ""
    lines.append("")
    lines.append(
        f"Eventuali limitazioni di torneo (parti limitate, Hall of Fame, decisioni "
        f"B4) sono elencate su {PAGE}{urllib.parse.quote(page_title.replace(' ', '_'))} "
        f"e vanno riassunte qui a mano: cambiano nel tempo."
    )
    lines.append("")
    lines.append(_generated_note(page_title))
    return "\n".join(lines)


def replace_section(body: str, heading: str, new_text: str) -> tuple[str, bool]:
    """Sostituisce una sezione SOLO se e' ancora un segnaposto."""
    matches = list(SECTION.finditer(body))
    for index, match in enumerate(matches):
        if match.group(1).strip().lower() != heading.lower():
            continue
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        if not PLACEHOLDER.match(body[start:end]):
            return body, False
        return body[:start] + "\n\n" + new_text + "\n\n" + body[end:], True
    return body, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--knowledge", default=str(REPO / "knowledge"))
    parser.add_argument("--slot", help="solo questo slot")
    parser.add_argument("--only", nargs="*", help="solo questi slug")
    parser.add_argument("--write-profiles", action="store_true",
                        help="compila anche la sezione Profilo dei file .md")
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

    url = args.url.replace("postgresql+asyncpg://", "postgresql://")
    root = Path(args.knowledge)

    with psycopg.connect(url) as connection:
        with connection.cursor() as cursor:
            clauses, params = [], []
            if args.slot:
                clauses.append("slot = %s")
                params.append(args.slot)
            if args.only:
                clauses.append("slug = ANY(%s)")
                params.append(list(args.only))
            where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
            cursor.execute(
                f"SELECT slug, canonical_name, slot FROM component_registry {where} "
                f"ORDER BY slot, canonical_name",
                params,
            )
            parts = cursor.fetchall()

        print(f"{len(parts)} pezzo/i da cercare sulla wiki")
        indexes = {
            slot: title_index(prefixes) for slot, prefixes in CLASSIFICATION.items()
        }
        print(f"indice: {sum(len(i) for i in indexes.values())} pagine di componenti\n")
        found = missing = profiles = aliases_added = 0
        unmatched: list[tuple[str, str]] = []

        for slug, name, slot in parts:
            lookup = name if slot != "lock_chip" else name.capitalize()
            resolved = resolve(indexes[slot], lookup)
            if resolved is None:
                missing += 1
                unmatched.append((slot, name))
                print(f"  -  {name:18} nessuna pagina verificabile")
                continue
            title, facts = resolved

            found += 1
            system = SYSTEM.get(facts.get("System", ""))
            grams = weight_grams(facts.get("Weight", ""))
            summary = f"{facts.get('Type', '?'):8} {str(grams) + 'g' if grams else '?':>7}  {system or '?'}"
            hasbro = facts.get("AKA", "")
            print(f"  ok {name:18} {summary}" + (f"   AKA {hasbro}" if hasbro else ""))

            if args.dry_run:
                continue

            attributes = {
                "weight_g": grams,
                "type": facts.get("Type"),
                "spin": facts.get("SpinDirection"),
                "product_code": facts.get("ProductCode"),
                "release_jp": facts.get("ReleaseJP"),
                "x_standard": bool(facts.get("XStandard")),
                "stats": {
                    k.lower(): int(facts[f"{k}Stat"])
                    for k in ("Attack", "Defense", "Stamina")
                    if facts.get(f"{k}Stat", "").isdigit()
                } or None,
                "wiki_page": title,
            }
            attributes = {k: v for k, v in attributes.items() if v is not None}

            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE component_registry SET attributes = attributes || %s::jsonb, "
                    "system = COALESCE(system, %s), updated_at = now() WHERE slug = %s",
                    (json.dumps(attributes), system, slug),
                )
                # Il nome Hasbro e' un alias vero: chi gioca con i prodotti
                # occidentali conosce il pezzo solo con quello.
                for alias in [a.strip() for a in hasbro.split("/") if a.strip()]:
                    alias = re.sub(r"\s*\((?:Hasbro|Takara Tomy)\)\s*", "", alias).strip()
                    norm = re.sub(r"[^a-z0-9]", "", alias.lower())
                    if not norm:
                        continue
                    kind = "abbrev" if len(alias) <= 2 else "localized"
                    cursor.execute(
                        "INSERT INTO component_alias (alias_norm, alias, slug, kind) "
                        "VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                        (norm, alias, slug, kind),
                    )
                    aliases_added += cursor.rowcount

            if args.write_profiles:
                path = root / FOLDER[slot] / f"{slug}.md"
                if path.exists():
                    body = path.read_text(encoding="utf-8")
                    if system and re.search(r"^system:\s*$|^system:\s+#", body, re.M):
                        body = re.sub(r"^system:.*$", f"system: {system}", body,
                                      count=1, flags=re.M)
                    if facts.get("XStandard") or facts.get("ProductCode"):
                        body = re.sub(
                            r"^sources: \[\]$",
                            f'sources: ["{PAGE}{urllib.parse.quote(title.replace(" ", "_"))}"]',
                            body, count=1, flags=re.M)
                    body, changed = replace_section(
                        body, "Profilo", render_profile(name, slot, facts, title))
                    notes = render_format_notes(name, facts, title)
                    if notes:
                        body, _ = replace_section(body, "Note di formato", notes)
                    path.write_text(body, encoding="utf-8")
                    profiles += changed

        if args.apply:
            connection.commit()

    print(f"\n{found} trovato/i, {missing} senza pagina verificabile")
    if unmatched:
        print("\nDa risolvere a mano - il nome nella repo e quello sulla wiki non coincidono,")
        print("il che di solito significa un refuso da una delle due parti:")
        for slot, name in unmatched:
            print(f"  {slot:13} {name}")
    if args.apply:
        print(f"{aliases_added} alias aggiunto/i (nomi Hasbro e abbreviazioni)")
        if args.write_profiles:
            print(f"{profiles} sezione/i Profilo compilata/e")
    return 0


if __name__ == "__main__":
    sys.exit(main())
