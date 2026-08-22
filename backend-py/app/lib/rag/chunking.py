"""Turns a knowledge-base markdown file into the chunks that get embedded.

The split is by `##` heading, not by a fixed window. The schede are written so
that one heading answers one question, which means a section is already the unit
a reader would want back — cutting it at 512 tokens would hand the model half an
interaction table and leave the other half in a chunk nobody retrieved.

Two things happen here that matter more than the splitting:

  * `code_tokens`. '9-60' and '1-60' sit almost on top of each other in any
    embedding space, and they are different parts with opposite statistics. They
    are pulled out as exact strings so retrieval can match them instead of
    approximating them.

  * hashing, per document and per chunk. Editing one paragraph of an eight
    section scheda re-embeds one chunk. Without it, every ingest pays for the
    whole corpus again.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Iterable

import yaml

# The frontmatter block, and the headings that open a section.
FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
HEADING = re.compile(r"^##\s+(.+?)\s*$", re.MULTILINE)

# The document title. Dropped rather than chunked: it repeats canonical_name,
# which is already in the frontmatter and in every context header. Left in, a
# scaffolded scheda with nothing written in it still produces one chunk holding
# only its own title - so the corpus would look populated and cost real
# embedding calls while containing no knowledge at all.
TITLE = re.compile(r"\A#\s+.+?$\s*", re.MULTILINE)

# Ratchet designations: 1-60, 9-60, 1-70, 3-85. Two digits after the dash, one
# or two before. Bounded so a date or a score does not look like a part.
RATCHET = re.compile(r"\b\d{1,2}-\d{2}\b")
SYSTEM = re.compile(r"\b(?:BX|UX|CX)\b")

# A section holding only whitespace, a TODO marker or an HTML comment has not
# been written yet. Ingesting it would spend an embedding call on nothing and
# put an empty chunk in front of the model.
PLACEHOLDER = re.compile(r"\A(?:\s|<!--.*?-->|TODO\b.*|_.*_)*\Z", re.DOTALL | re.IGNORECASE)

# Rough, and deliberately so: this feeds a size guard, not a billing estimate.
# Italian prose runs near four characters per token.
CHARS_PER_TOKEN = 4

MAX_TOKENS = 600


# Una sezione puo' dichiarare da dove viene e che natura ha:
#
#   <!-- provenance: third-party | source: https://... | kind: opinion -->
#
# Serve perche' la knowledge base non contiene solo fatti. Un peso in grammi e
# il giudizio di un appassionato sono entrambi testo, e senza una distinzione
# leggibile dalla macchina arriverebbero al modello con la stessa autorevolezza.
# Quello che si dichiara qui finisce in kb_chunk.meta e sopravvive fino alla
# costruzione del prompt, dove i due possono essere presentati diversamente.
PROVENANCE = re.compile(r"<!--\s*provenance:(.*?)-->", re.DOTALL | re.IGNORECASE)
COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)


@dataclass
class Chunk:
    ordinal: int
    heading: str | None
    text: str
    code_tokens: list[str]
    token_count: int
    chunk_hash: str = ""
    context_header: str | None = None
    provenance: dict[str, str] = field(default_factory=dict)


@dataclass
class Document:
    source_path: str
    frontmatter: dict
    body: str
    content_hash: str
    chunks: list[Chunk] = field(default_factory=list)

    @property
    def slug(self) -> str | None:
        value = self.frontmatter.get("slug")
        return str(value) if value else None

    @property
    def doc_type(self) -> str:
        """What kind of document this is - component, rule, guide, meta_snapshot.

        Deliberately not the part's slot. A scheda about a Blade and one about a
        Bit are the same kind of document; which slot the part occupies belongs
        to the part, and component_registry already records it. Conflating the
        two was caught by kb_document's check constraint, which is what it is
        there for.
        """
        return str(self.frontmatter.get("type", "guide"))

    @property
    def slot(self) -> str | None:
        value = self.frontmatter.get("slot")
        return str(value) if value else None

    @property
    def lang(self) -> str:
        return str(self.frontmatter.get("lang", "it"))


def _hash(text: str) -> str:
    """Over normalised text, so that reflowing a paragraph or changing line
    endings on a Windows checkout does not invalidate the whole corpus."""
    normalised = re.sub(r"\s+", " ", text).strip()
    return hashlib.sha256(normalised.encode("utf-8")).hexdigest()


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // CHARS_PER_TOKEN)


def extract_code_tokens(text: str, known_names: Iterable[str] = ()) -> list[str]:
    """Exact identifiers a full-text search would mangle and an embedder would
    blur. `known_names` comes from component_registry, so part names are matched
    against reality rather than guessed from capitalisation."""
    found: list[str] = []
    seen: set[str] = set()

    def add(token: str) -> None:
        if token not in seen:
            seen.add(token)
            found.append(token)

    for match in RATCHET.findall(text):
        add(match)
    for match in SYSTEM.findall(text):
        add(match)

    # Substring matching, because a name can carry punctuation next to it
    # ("montato su WizardRod."). Longest first so 'DranSword' is not shadowed by
    # a shorter name that happens to be contained in it.
    for name in sorted(known_names, key=len, reverse=True):
        if name and name in text:
            add(name)

    return found


def split_sections(body: str) -> list[tuple[str | None, str]]:
    """(heading, text) pairs. Anything before the first `##` is kept with a null
    heading rather than dropped: it is usually the one-line summary."""
    matches = list(HEADING.finditer(body))
    if not matches:
        stripped = TITLE.sub("", body.lstrip()).strip()
        return [(None, stripped)] if stripped else []

    sections: list[tuple[str | None, str]] = []
    preamble = TITLE.sub("", body[: matches[0].start()].lstrip()).strip()
    if preamble:
        sections.append((None, preamble))

    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        sections.append((match.group(1), body[start:end].strip()))
    return sections


def _split_oversized(text: str) -> list[str]:
    """A section past the cap is split on blank lines, never mid-sentence. Only
    reached by long-form guides; a scheda section never gets near it."""
    if estimate_tokens(text) <= MAX_TOKENS:
        return [text]

    parts: list[str] = []
    current: list[str] = []
    size = 0
    for paragraph in re.split(r"\n\s*\n", text):
        cost = estimate_tokens(paragraph)
        if current and size + cost > MAX_TOKENS:
            parts.append("\n\n".join(current))
            current, size = [], 0
        current.append(paragraph)
        size += cost
    if current:
        parts.append("\n\n".join(current))
    return parts


def parse(source_path: str, raw: str, known_names: Iterable[str] = ()) -> Document:
    """A markdown file to a Document with its chunks. Sections that are still
    placeholders are skipped, so a scaffolded scheda nobody has written yet
    costs nothing and contributes no empty chunks."""
    match = FRONTMATTER.match(raw)
    if match:
        frontmatter = yaml.safe_load(match.group(1)) or {}
        body = raw[match.end():]
    else:
        frontmatter, body = {}, raw

    if not isinstance(frontmatter, dict):
        raise ValueError(f"{source_path}: frontmatter must be a mapping")

    document = Document(
        source_path=source_path,
        frontmatter=frontmatter,
        body=body,
        content_hash=_hash(body),
    )

    ordinal = 0
    for heading, text in split_sections(body):
        if PLACEHOLDER.match(text):
            continue
        provenance = parse_provenance(text)
        # I commenti escono dal testo prima dell'embedding: sono note per chi
        # cura la scheda, non contenuto, e pagarne l'embedding significherebbe
        # anche farli comparire fra le fonti mostrate al lettore.
        text = COMMENT.sub("", text).strip()
        if not text:
            continue
        for part in _split_oversized(text):
            if PLACEHOLDER.match(part):
                continue
            document.chunks.append(
                Chunk(
                    ordinal=ordinal,
                    heading=heading,
                    text=part,
                    code_tokens=extract_code_tokens(f"{heading or ''}\n{part}", known_names),
                    token_count=estimate_tokens(part),
                    chunk_hash=_hash(f"{heading or ''}\n{part}"),
                    provenance=provenance,
                )
            )
            ordinal += 1

    return document


def parse_provenance(text: str) -> dict[str, str]:
    """Legge la direttiva di provenienza di una sezione, se c'e'."""
    match = PROVENANCE.search(text)
    if not match:
        return {}
    fields: dict[str, str] = {}
    for part in match.group(1).split("|"):
        key, _, value = part.partition(":")
        key, value = key.strip().lower(), value.strip()
        if key and value:
            fields[key] = value
        elif key:
            # forma abbreviata: "provenance: third-party | ..."
            fields.setdefault("provenance", key)
    return fields


def build_context_header(document: Document, chunk: Chunk) -> str:
    """Prepended to the text before embedding so a chunk that says "questo
    pezzo" still retrieves for the part's name.

    Written from the frontmatter rather than generated by a model: the facts
    needed are the ones already declared in the file, so a template gets the
    same result as an LLM call for none of the cost and with no chance of the
    header disagreeing with the document it heads.
    """
    name = document.frontmatter.get("canonical_name") or document.slug or "?"
    slot = (document.slot or "").replace("_", " ")
    system = document.frontmatter.get("system")

    subject = f"{slot} {name}".strip() if slot else str(name)
    if system:
        subject = f"{subject}, sistema {system}"

    if chunk.heading:
        return f"Sezione '{chunk.heading}' della scheda di {subject}."
    return f"Scheda di {subject}."
