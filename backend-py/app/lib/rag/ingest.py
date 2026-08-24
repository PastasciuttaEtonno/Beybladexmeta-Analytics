"""Reads knowledge/ into kb_document and kb_chunk. Idempotent, and cheap to re-run.

Deduplication happens at two levels, and the second is the one that matters:

  * document — the content hash is unchanged, so the file is skipped whole. No
    parsing, no embedding calls.
  * chunk — the document changed, but most of its sections did not. Their
    vectors are carried over from the superseded version by hash, so editing one
    paragraph of an eight-section scheda costs one embedding call rather than
    eight.

A document is replaced, never edited in place: the old row gets a superseded_at
and the new one is inserted beside it. A citation stored in a conversation last
month still resolves to the text that was actually shown then.

The whole run is one transaction. A failure halfway leaves the corpus as it was,
rather than half-new — which for a retrieval index is the difference between
"nothing happened" and "some answers now come from a version that never existed".
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.rag import chunking
from app.lib.rag.embeddings import Embedder, to_pgvector


@dataclass
class IngestReport:
    docs_seen: int = 0
    docs_changed: int = 0
    docs_skipped: int = 0
    chunks_embedded: int = 0
    chunks_reused: int = 0
    chunks_skipped: int = 0
    empty: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.empty is None:
            self.empty = []

    def summary(self) -> str:
        return (
            f"{self.docs_seen} document(s): {self.docs_changed} changed, "
            f"{self.docs_skipped} unchanged\n"
            f"{self.chunks_embedded} chunk(s) embedded, {self.chunks_reused} reused "
            f"from the previous version, {self.chunks_skipped} left untouched"
        )


def git_sha(repo: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=5, check=True,
        )
        return result.stdout.strip() or None
    except (subprocess.SubprocessError, OSError):
        return None


async def load_known_names(session: AsyncSession) -> list[str]:
    """Canonical names, for code_tokens extraction. Taken from the registry so
    the chunker matches against parts that exist rather than inferring them
    from capitalisation."""
    rows = await session.execute(text("SELECT canonical_name FROM component_registry"))
    return [row[0] for row in rows]


async def ingest(
    session: AsyncSession,
    knowledge_dir: Path,
    embedder: Embedder,
    *,
    repo_root: Path | None = None,
) -> IngestReport:
    report = IngestReport()
    repo_root = repo_root or knowledge_dir.parent
    known_names = await load_known_names(session)
    sha = git_sha(repo_root)

    run = await session.execute(
        text("INSERT INTO kb_ingest_run (git_sha) VALUES (:sha) RETURNING id"),
        {"sha": sha},
    )
    run_id = run.scalar_one()

    # Chunk in attesa di vettore, e le scritture rimandate finche' i vettori
    # non ci sono. Tutto resta dentro la stessa transazione.
    pending: list[chunking.Chunk] = []
    writes: list[tuple[int, chunking.Document, dict[str, str]]] = []

    for path in sorted(knowledge_dir.rglob("*.md")):
        if path.name.upper() == "README.MD":
            continue
        # source_path is the citation key and the identity of the document, so
        # it has to be stable and repo-relative. A directory outside the repo
        # falls back to its own name rather than failing the whole run.
        try:
            source_path = path.relative_to(repo_root).as_posix()
        except ValueError:
            source_path = path.as_posix()
        document = chunking.parse(source_path, path.read_text(encoding="utf-8"), known_names)
        report.docs_seen += 1

        existing = (
            await session.execute(
                text(
                    "SELECT id, content_hash, doc_version FROM kb_document "
                    "WHERE source_path = :path AND superseded_at IS NULL"
                ),
                {"path": source_path},
            )
        ).first()

        if existing and existing.content_hash == document.content_hash:
            # Il testo non e' cambiato, ma il modello potrebbe: passando da un
            # embedder all'altro i vettori vecchi non sono confrontabili con i
            # nuovi. Senza questo controllo un cambio di provider non
            # riembedderebbe niente e lascerebbe il corpus sui vettori
            # precedenti, riportando "tutto invariato" - un fallimento
            # silenzioso che si manifesta solo come ranking scadente.
            stale = await session.execute(
                text(
                    "SELECT count(*) FROM kb_chunk "
                    "WHERE document_id = :id AND embedding_model IS DISTINCT FROM :model"
                ),
                {"id": existing.id, "model": embedder.name},
            )
            if stale.scalar_one() == 0:
                report.docs_skipped += 1
                count = await session.execute(
                    text("SELECT count(*) FROM kb_chunk WHERE document_id = :id"),
                    {"id": existing.id},
                )
                report.chunks_skipped += count.scalar_one()
                continue

        if not document.chunks:
            # A scaffolded scheda nobody has written yet. Recording it would put
            # an empty document in the corpus and make the counts lie about how
            # much of the knowledge base actually exists.
            report.empty.append(source_path)
            continue

        # Vectors from the version being replaced, by chunk hash. Only reusable
        # if the same model produced them.
        reusable: dict[str, str] = {}
        if existing:
            rows = await session.execute(
                text(
                    "SELECT chunk_hash, embedding::text FROM kb_chunk "
                    "WHERE document_id = :id AND embedding_model = :model "
                    "AND embedding IS NOT NULL"
                ),
                {"id": existing.id, "model": embedder.name},
            )
            reusable = {row[0]: row[1] for row in rows}

            await session.execute(
                text("UPDATE kb_document SET superseded_at = now() WHERE id = :id"),
                {"id": existing.id},
            )

        inserted = await session.execute(
            text(
                "INSERT INTO kb_document (source_path, doc_type, slug, lang, frontmatter, "
                "                         content_hash, doc_version, git_sha) "
                "VALUES (:path, :type, :slug, :lang, CAST(:frontmatter AS jsonb), "
                "        :hash, :version, :sha) RETURNING id"
            ),
            {
                "path": source_path,
                "type": document.doc_type,
                "slug": document.slug,
                "lang": document.lang,
                "frontmatter": _json(document.frontmatter),
                "hash": document.content_hash,
                "version": (existing.doc_version + 1) if existing else 1,
                "sha": sha,
            },
        )
        document_id = inserted.scalar_one()
        report.docs_changed += 1

        for chunk in document.chunks:
            chunk.context_header = chunking.build_context_header(document, chunk)

        fresh = [c for c in document.chunks if c.chunk_hash not in reusable]
        # I vettori NON si chiedono qui. Farlo per documento significava una
        # chiamata API ogni manciata di chunk - centotrenta chiamate dove ne
        # bastano dodici - e su una chiave con limiti ridotti la differenza fra
        # minuti e ore e' tutta li'. Si raccoglie e si embedda in blocco dopo.
        pending.extend(fresh)
        report.chunks_reused += len(document.chunks) - len(fresh)

        writes.append((document_id, document, reusable))

    # Un solo giro di embedding per tutto il corpus, a lotti di BATCH.
    vectors: dict[str, str] = {}
    if pending:
        texts = [f"{c.context_header}\n\n{c.text}" for c in pending]
        embedded = await embedder.embed(texts)
        vectors = {c.chunk_hash: to_pgvector(v) for c, v in zip(pending, embedded)}
        report.chunks_embedded = len(pending)

    for document_id, document, reusable in writes:
        for chunk in document.chunks:
            await session.execute(
                text(
                    "INSERT INTO kb_chunk (document_id, ordinal, heading, text, context_header, "
                    "                      chunk_hash, embedding, embedding_model, code_tokens, "
                    "                      meta, token_count) "
                    "VALUES (:doc, :ordinal, :heading, :text, :header, :hash, "
                    "        CAST(:embedding AS vector), :model, :codes, "
                    "        CAST(:meta AS jsonb), :tokens)"
                ),
                {
                    "doc": document_id,
                    "ordinal": chunk.ordinal,
                    "heading": chunk.heading,
                    "text": chunk.text,
                    "header": chunk.context_header,
                    "hash": chunk.chunk_hash,
                    "embedding": vectors.get(chunk.chunk_hash) or reusable[chunk.chunk_hash],
                    "model": embedder.name,
                    "codes": chunk.code_tokens,
                    "meta": _json(_meta(document, chunk)),
                    "tokens": chunk.token_count,
                },
            )

    await session.execute(
        text(
            "UPDATE kb_ingest_run SET finished_at = now(), docs_seen = :seen, "
            "docs_changed = :changed, chunks_embedded = :embedded, chunks_skipped = :skipped "
            "WHERE id = :id"
        ),
        {
            "id": run_id,
            "seen": report.docs_seen,
            "changed": report.docs_changed,
            "embedded": report.chunks_embedded,
            "skipped": report.chunks_skipped + report.chunks_reused,
        },
    )
    await session.commit()
    return report


def _meta(document: chunking.Document, chunk: chunking.Chunk | None = None) -> dict:
    """What retrieval filters on. Kept small on purpose — these are hard filters
    applied before any similarity is computed, not a copy of the frontmatter."""
    meta = {"doc_type": document.doc_type, "lang": document.lang}
    if document.slot:
        meta["slot"] = document.slot
    for key in ("slug", "system", "archetype", "season"):
        value = document.frontmatter.get(key)
        if value:
            meta[key] = value
    # La provenienza e' per sezione, non per documento: una scheda puo' mettere
    # accanto i fatti del produttore e il giudizio di un terzo, e il confine
    # deve restare visibile a valle.
    if chunk and chunk.provenance:
        meta["provenance"] = chunk.provenance.get("provenance", "third-party")
        for key in ("kind", "source"):
            if chunk.provenance.get(key):
                meta[key] = chunk.provenance[key]
    return meta


def _json(value: dict) -> str:
    import json

    return json.dumps(value, ensure_ascii=False, default=str)
