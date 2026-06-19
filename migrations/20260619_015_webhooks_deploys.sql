-- 20260619_015_webhooks_deploys
-- Inbound webhooks (real-time sync) + CI/CD deployments → REAL DORA deploy-frequency
-- and MTTR (the two metrics git history alone can't give). forward-only.

-- Per-org webhook secret for verifying inbound GitHub/GitLab payload signatures.
CREATE TABLE webhook_configs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider    text NOT NULL,                 -- github | gitlab
    secret      text NOT NULL,                 -- HMAC secret (GitHub) / token (GitLab)
    enabled     boolean NOT NULL DEFAULT true,
    last_event_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, provider)
);
CREATE INDEX ON webhook_configs (org_id);

CREATE TABLE deployments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    repo_id      uuid REFERENCES repos(id) ON DELETE SET NULL,
    environment  text NOT NULL DEFAULT 'production',
    status       text NOT NULL DEFAULT 'success',  -- success | failure
    sha          text,
    source       text NOT NULL DEFAULT 'manual',   -- github_actions | gitlab_ci | manual
    external_id  text,
    deployed_at  timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, source, external_id)
);
CREATE INDEX ON deployments (org_id, deployed_at);
CREATE INDEX ON deployments (org_id, environment);

-- Incidents drive MTTR (opened on a failed deploy / reported, closed on recovery).
CREATE TABLE incidents (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    repo_id      uuid REFERENCES repos(id) ON DELETE SET NULL,
    title        text,
    opened_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at  timestamptz,
    severity     text NOT NULL DEFAULT 'minor',
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON incidents (org_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['webhook_configs','deployments','incidents'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY org_isolation ON %I
        USING (org_id = current_org()) WITH CHECK (org_id = current_org());$p$, t);
  END LOOP;
END $$;

-- Inbound webhooks resolve org from the secret BEFORE org context exists → needs an
-- RLS-bypassing lookup (same pattern as the public invoice token).
CREATE OR REPLACE FUNCTION webhook_org_by_secret(prov text, sec text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT org_id FROM webhook_configs WHERE provider = prov AND secret = sec AND enabled LIMIT 1
$$;
REVOKE ALL ON FUNCTION webhook_org_by_secret(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION webhook_org_by_secret(text, text) TO gitstate_app;
