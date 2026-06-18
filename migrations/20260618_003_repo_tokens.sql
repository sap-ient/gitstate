-- 20260618_003_repo_tokens
-- forward-only; a rollback is a new migration.
--
-- Adds token_encrypted (bytea) to repos so that connected-repo access tokens
-- can be persisted encrypted at rest (AES-256-GCM via internal/crypto) instead
-- of being re-supplied by the client on every sync call.
--
-- The column is nullable: existing rows keep NULL until a token is explicitly
-- stored via store.SetRepoToken. The old in-memory / re-supply path remains
-- fully functional while this column is NULL.

ALTER TABLE repos
  ADD COLUMN IF NOT EXISTS token_encrypted bytea;
