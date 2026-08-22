-- RAG foundations: the component vocabulary and the knowledge-base tables.
--
-- Two things live here, and they are deliberately separate:
--
--   * component_registry / component_alias — the canonical identity of every
--     part. This is what makes "Wizard Rod", "wizardrod" and "WR" resolve to
--     the same thing as blade_stats.blade = 'WizardRod'. Every retrieval query
--     filters on it, so it is the first thing that has to be right.
--
--   * kb_document / kb_chunk / kb_ingest_run — the qualitative corpus. The
--     statistics are NOT copied in here: numbers are answered from
--     unified_meta_view and the *_stats tables by parameterised queries, never
--     by similarity search. Only hand-written prose gets embedded.
--
-- Nothing in this migration is populated. tools/seed_component_registry.py
-- fills the registry from the stats tables; the ingest pipeline fills the rest.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;


-- ---------------------------------------------------------------------------
-- Normalisation
-- ---------------------------------------------------------------------------

-- Folds a part name to its lookup form: lowercase, no separators.
--   'Wizard Rod' -> 'wizardrod'      'WizardRod' -> 'wizardrod'
--   '9-60'       -> '960'            '9 - 60'    -> '960'
--
-- IMMUTABLE because it is used in a generated column and in indexes. unaccent()
-- is deliberately NOT called here: it is only STABLE (it reads a dictionary), so
-- including it would make this function unusable in an index. Accents do not
-- appear in part names anyway — they matter for the Italian prose, which is
-- handled by the text search configuration below.
CREATE OR REPLACE FUNCTION kb_norm(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
    SELECT regexp_replace(lower(value), '[^a-z0-9]', '', 'g');
$$;


-- ---------------------------------------------------------------------------
-- Component vocabulary
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS component_registry (
    slug            text PRIMARY KEY,
    -- Must match the value stored in the stats tables byte for byte. A join
    -- that silently returns zero rows is the failure mode this table exists to
    -- prevent, so the check script compares the two rather than trusting it.
    canonical_name  text NOT NULL,
    slot            text NOT NULL
                    CHECK (slot IN ('blade', 'assist_blade', 'ratchet', 'bit', 'lock_chip')),
    system          text CHECK (system IN ('BX', 'UX', 'CX')),
    -- Free-form part data: spin direction, weight, archetype, release. Kept as
    -- jsonb because it is read by the prompt layer, not queried on.
    attributes      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (slot, canonical_name)
);


CREATE TABLE IF NOT EXISTS component_alias (
    -- The normalised form is the key: callers look up kb_norm(user_input).
    alias_norm  text NOT NULL,
    -- Kept for readability when someone inspects the table by hand.
    alias       text NOT NULL,
    slug        text NOT NULL REFERENCES component_registry(slug) ON DELETE CASCADE,
    kind        text NOT NULL DEFAULT 'exact'
                CHECK (kind IN ('exact', 'spaced', 'slug', 'abbrev', 'typo', 'localized')),

    PRIMARY KEY (alias_norm, slug)
);

-- One alias may in principle point at two parts in different slots ("Ball" as
-- a bit and as something else later), so lookups return rows and the caller
-- disambiguates by slot. This index is what makes that lookup a single probe.
CREATE INDEX IF NOT EXISTS component_alias_norm_idx
    ON component_alias (alias_norm);

-- Fuzzy fallback for typos: 'wizzardrod' -> 'wizardrod'. Only consulted when
-- the exact lookup above misses, and only above a high similarity threshold.
CREATE INDEX IF NOT EXISTS component_alias_trgm_idx
    ON component_alias USING gin (alias_norm gin_trgm_ops);


-- ---------------------------------------------------------------------------
-- Knowledge base
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kb_document (
    id              bigserial PRIMARY KEY,
    -- Where it came from, relative to the repo root: 'knowledge/blades/wizard-rod.md'.
    source_path     text NOT NULL,
    doc_type        text NOT NULL
                    CHECK (doc_type IN ('component', 'rule', 'guide', 'meta_snapshot')),
    -- Set for doc_type = 'component'; null for prose that is not about one part.
    slug            text REFERENCES component_registry(slug) ON DELETE RESTRICT,
    lang            text NOT NULL DEFAULT 'it',
    frontmatter     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- SHA-256 of the normalised body. Unchanged hash means the whole document
    -- is skipped at ingest: no chunking, no embedding calls, no cost.
    content_hash    text NOT NULL,
    doc_version     integer NOT NULL DEFAULT 1,
    git_sha         text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    -- Soft delete. Retrieval reads only live rows; superseded rows stay so that
    -- a citation stored in an old conversation still resolves to the text that
    -- was actually shown at the time.
    superseded_at   timestamptz
);

-- At most one live document per source file. Old versions carry a
-- superseded_at and therefore fall outside the index.
CREATE UNIQUE INDEX IF NOT EXISTS kb_document_live_source_idx
    ON kb_document (source_path)
    WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS kb_document_slug_idx
    ON kb_document (slug)
    WHERE superseded_at IS NULL;


CREATE TABLE IF NOT EXISTS kb_chunk (
    id              bigserial PRIMARY KEY,
    document_id     bigint NOT NULL REFERENCES kb_document(id) ON DELETE CASCADE,
    ordinal         integer NOT NULL,
    heading         text,
    text            text NOT NULL,
    -- Generated once at ingest and prepended to the text before embedding, so a
    -- chunk that says "questo pezzo" still retrieves for "WizardRod".
    context_header  text,
    chunk_hash      text NOT NULL,

    -- 1024 dimensions: voyage-3.5. Recorded per row because cosine distances
    -- from different models are not comparable — mixing them degrades ranking
    -- silently, which is the worst way for it to degrade.
    --
    -- vector, not halfvec: at 1024 dims we are well under the 2000-dimension
    -- ceiling for HNSW on `vector`, and halfvec's storage saving is a few MB
    -- across the whole corpus. halfvec would only be needed for a 3072-dim model.
    embedding       vector(1024),
    embedding_model text,

    -- Italian, because the corpus is Italian. Part names survive stemming
    -- unharmed, and exact matching on them is code_tokens' job anyway.
    tsv             tsvector GENERATED ALWAYS AS (
                        to_tsvector('italian', coalesce(context_header, '') || ' ' || text)
                    ) STORED,

    -- Exact identifiers pulled out by regex at ingest: ['9-60', 'Ball', 'UX'].
    -- This is the branch that makes 9-60 a match rather than a neighbourhood —
    -- an embedder places 9-60 and 1-60 almost on top of each other.
    code_tokens     text[] NOT NULL DEFAULT '{}',

    -- slug, slot, system, season, lang. Hard filters are applied here before
    -- any similarity is computed.
    meta            jsonb NOT NULL DEFAULT '{}'::jsonb,

    token_count     integer,
    created_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (document_id, ordinal)
);

-- HNSW rather than IVFFlat: the corpus is a few thousand chunks, where HNSW's
-- build cost is irrelevant and its recall is better. IVFFlat would also have to
-- be built after the table is populated and re-indexed as the corpus churns.
CREATE INDEX IF NOT EXISTS kb_chunk_embedding_idx
    ON kb_chunk USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS kb_chunk_tsv_idx
    ON kb_chunk USING gin (tsv);

CREATE INDEX IF NOT EXISTS kb_chunk_code_tokens_idx
    ON kb_chunk USING gin (code_tokens);

CREATE INDEX IF NOT EXISTS kb_chunk_meta_idx
    ON kb_chunk USING gin (meta jsonb_path_ops);

CREATE INDEX IF NOT EXISTS kb_chunk_document_idx
    ON kb_chunk (document_id);


CREATE TABLE IF NOT EXISTS kb_ingest_run (
    id              bigserial PRIMARY KEY,
    git_sha         text,
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    docs_seen       integer NOT NULL DEFAULT 0,
    docs_changed    integer NOT NULL DEFAULT 0,
    chunks_embedded integer NOT NULL DEFAULT 0,
    -- The number that says the deduplication is working: on a re-run with no
    -- edits, chunks_embedded is 0 and this equals the corpus size.
    chunks_skipped  integer NOT NULL DEFAULT 0,
    error           text
);

COMMIT;
