-- 20260622_024_accounting
-- Accounting integrations: invoices can be pushed to Xero / QuickBooks (OAuth) or
-- created manually. Mirrors calendar_connections (AES-256-GCM tokens via
-- internal/crypto, org-scoped, FORCE-RLS). Forward-only.

CREATE TABLE accounting_connections (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          text NOT NULL,              -- xero | quickbooks
    external_org_id   text,                        -- Xero tenantId / QuickBooks realmId
    external_name     text,                        -- the connected company/org name
    token_encrypted   bytea,                       -- AES-256-GCM access token
    refresh_encrypted bytea,                       -- AES-256-GCM refresh token
    scopes            text,
    expires_at        timestamptz,
    last_synced_at    timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, provider)
);
CREATE INDEX ON accounting_connections (org_id);

-- Track an invoice that has been pushed to an external accounting system.
ALTER TABLE client_invoices
    ADD COLUMN IF NOT EXISTS external_provider text,  -- xero | quickbooks
    ADD COLUMN IF NOT EXISTS external_id       text,  -- invoice id in that system
    ADD COLUMN IF NOT EXISTS external_url       text; -- deep link to view it there

ALTER TABLE accounting_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON accounting_connections
    USING (org_id = current_org()) WITH CHECK (org_id = current_org());
