-- 20260621_018_api_tokens
-- Scoped API tokens for agent/LLM integrations (Wave 2+ of the AI/agent flywheel).
-- A long-lived, hashed, scoped token lets the `gittrack` CLI, the issue-context
-- endpoint, and the MCP server authenticate a machine/agent against one org with
-- least-privilege scopes — separate from human JWT sessions. Forward-only.
--
-- The raw token (e.g. "gsk_<random>") is shown ONCE at creation; only its sha256
-- is stored. Pre-auth resolution (no org context yet) goes through a SECURITY
-- DEFINER function, mirroring webhook_org_by_secret / client_invoice_org_by_token.

CREATE TABLE api_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id      uuid REFERENCES users(id) ON DELETE SET NULL, -- creator (attribution)
    name         text NOT NULL,
    token_hash   text NOT NULL UNIQUE,        -- sha256(raw token); raw shown once
    prefix       text NOT NULL,               -- first chars for display (gsk_xxxx…)
    scopes       text[] NOT NULL DEFAULT '{}', -- e.g. read:issues, read:context, write:agent_runs, write:issues
    last_used_at timestamptz,
    expires_at   timestamptz,                 -- NULL = no expiry
    revoked_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON api_tokens (org_id);

ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON api_tokens
    USING (org_id = current_org()) WITH CHECK (org_id = current_org());

-- Pre-auth lookup: resolve org/user/scopes from a token hash, bypassing RLS (the
-- request has no org context yet). SECURITY DEFINER + locked down to the app role,
-- only returns a row for a live (non-revoked, non-expired) token.
CREATE OR REPLACE FUNCTION api_token_by_hash(p_hash text)
RETURNS TABLE (org_id uuid, user_id uuid, token_id uuid, scopes text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    SELECT t.org_id, t.user_id, t.id, t.scopes
    FROM api_tokens t
    WHERE t.token_hash = p_hash
      AND t.revoked_at IS NULL
      AND (t.expires_at IS NULL OR t.expires_at > now())
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION api_token_by_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api_token_by_hash(text) TO gitstate_app;
