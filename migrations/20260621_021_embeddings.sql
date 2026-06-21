-- 20260621_021_embeddings
-- True vector search (pgvector) for issue discovery — the semantic layer over the
-- Wave-4 FTS. Issues carry an embedding produced by gitstate's embedder; search
-- fuses cosine similarity with full-text rank. The default embedder is local +
-- deterministic (no external dependency, works offline over real content); a
-- neural provider can be configured later. Forward-only.

CREATE EXTENSION IF NOT EXISTS vector;

-- 256-dim matches gitstate's built-in local embedder. A neural provider override
-- must produce the same dimension (or this column is re-migrated).
ALTER TABLE issues
    ADD COLUMN IF NOT EXISTS embedding       vector(256),
    ADD COLUMN IF NOT EXISTS embedding_model text,
    ADD COLUMN IF NOT EXISTS embedded_at     timestamptz;

-- HNSW cosine index for fast nearest-neighbour. Partial (only embedded rows).
CREATE INDEX IF NOT EXISTS issues_embedding_idx
    ON issues USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;
