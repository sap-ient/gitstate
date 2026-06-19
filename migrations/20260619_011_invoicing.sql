-- 20260619_011_invoicing
-- CLIENT invoicing DERIVED FROM GIT effort (the "…and the invoice" half of the wedge):
-- effort_estimates + merged PRs over a period → invoice line-items with git evidence,
-- shareable read-only via a token. Named client_* to avoid the existing billing `invoices`.
-- forward-only.

CREATE TABLE clients (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          text NOT NULL,
    contact_email text,
    -- billing rate in USD cents per unit of effort (1 effort point ≈ one LLM-sized unit).
    rate_cents    integer NOT NULL DEFAULT 15000,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, name)
);
CREATE INDEX ON clients (org_id);

-- Optional link from a project to the client it bills to.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE client_invoices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id     uuid REFERENCES clients(id) ON DELETE SET NULL,
    project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
    number        text NOT NULL,                       -- human invoice number e.g. INV-2026-001
    status        text NOT NULL DEFAULT 'draft',       -- draft | sent | paid | void
    period_start  date NOT NULL,
    period_end    date NOT NULL,
    currency      text NOT NULL DEFAULT 'USD',
    subtotal_cents integer NOT NULL DEFAULT 0,
    total_cents   integer NOT NULL DEFAULT 0,
    share_token   text UNIQUE,                          -- public read-only link
    notes         text,
    issued_at     timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, number)
);
CREATE INDEX ON client_invoices (org_id);
CREATE INDEX ON client_invoices (org_id, status);

CREATE TABLE client_invoice_lines (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id   uuid NOT NULL REFERENCES client_invoices(id) ON DELETE CASCADE,
    description  text NOT NULL,                         -- what was delivered
    effort_points numeric NOT NULL DEFAULT 0,           -- summed LLM effort estimate
    quantity     numeric NOT NULL DEFAULT 1,
    unit_rate_cents integer NOT NULL DEFAULT 0,
    amount_cents integer NOT NULL DEFAULT 0,
    evidence     jsonb NOT NULL DEFAULT '[]',           -- [{prTitle, repo, mergedAt, sha}] git proof
    sort         integer NOT NULL DEFAULT 0
);
CREATE INDEX ON client_invoice_lines (org_id, invoice_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clients','client_invoices','client_invoice_lines'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY org_isolation ON %I
        USING (org_id = current_org()) WITH CHECK (org_id = current_org());$p$, t);
  END LOOP;
END $$;
