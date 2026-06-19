-- 20260619_012_invoice_token_lookup
-- The public (unauthenticated) invoice share view must resolve a share_token → org
-- BEFORE any org context exists, but client_invoices has RLS, so the app role can't
-- read it. A SECURITY DEFINER function (runs as the owner, bypassing RLS) resolves
-- exactly the one invoice for a given unguessable token, then the handler reads it
-- inside db.WithOrg(orgID). forward-only.

CREATE OR REPLACE FUNCTION client_invoice_org_by_token(tok text)
RETURNS TABLE(org_id uuid, invoice_id uuid)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id, id
  FROM client_invoices
  WHERE share_token IS NOT NULL AND share_token = tok
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION client_invoice_org_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION client_invoice_org_by_token(text) TO gitstate_app;
