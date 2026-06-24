-- 20260624_005_invoice_richer
-- Make CLIENT invoices comprehensive: line items can now be either git-derived
-- (carry Evidence) or manual (free-form, no evidence), and the invoice header
-- carries tax + discount on top of the line subtotal.
--   * client_invoice_lines.source  — 'git' | 'manual' (default 'git' so existing
--     generated/persisted lines keep their meaning).
--   * client_invoices.discount_cents / tax_cents / tax_rate — total is recomputed
--     as subtotal - discount + tax. tax_rate is the percentage used to derive
--     tax_cents (informational; tax_cents is the source of truth for the total).
-- Forward-only. FORCE RLS is re-asserted (a no-op if already forced) so the new
-- columns are covered by the existing org_isolation policy.

ALTER TABLE client_invoice_lines
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'git';

ALTER TABLE client_invoices
    ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_cents      integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tax_rate       numeric NOT NULL DEFAULT 0;

ALTER TABLE client_invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE client_invoices      FORCE ROW LEVEL SECURITY;
