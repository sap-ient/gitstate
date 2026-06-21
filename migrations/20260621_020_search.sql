-- 20260621_020_search
-- Wave 4 of the AI/agent flywheel: full-text + fuzzy search over issues, PRs and
-- commits so an agent (via MCP / the API) can find work by meaning, not exact
-- keywords ("the flaky auth test issue"). Generated tsvector columns kept in sync
-- automatically + GIN indexes; pg_trgm enables typo-tolerant similarity ranking.
-- Forward-only; generated columns backfill existing rows on add.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE issues ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED;
CREATE INDEX IF NOT EXISTS issues_search_idx ON issues USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS issues_title_trgm_idx ON issues USING gin (title gin_trgm_ops);

ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,''))) STORED;
CREATE INDEX IF NOT EXISTS pull_requests_search_idx ON pull_requests USING gin (search_tsv);

ALTER TABLE commits ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(message,''))) STORED;
CREATE INDEX IF NOT EXISTS commits_search_idx ON commits USING gin (search_tsv);
