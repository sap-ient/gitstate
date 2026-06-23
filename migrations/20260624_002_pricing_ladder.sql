-- 20260624_002_pricing_ladder
-- Competitive, breakeven-early pricing ladder (USD-anchored, billed in ZAR).
-- Cost basis: Neon (usage) + Fly.io (scale-to-zero) ≈ $5–10 marginal/active org/mo
-- + managed-LLM passthrough at a 5% markup. Per-builder model; stakeholders free.
-- Forward-only; re-runnable via ON CONFLICT.
--
--   free     — $0,  BYOK-only, 2 builders, 3 repos / 90-day history, scale-to-zero.
--   starter  — $7/builder,  $1/mo included managed-LLM, overage ×1.05.
--   pro      — $15/builder, $5/mo included LLM, PDF invoices, priority sync.
--   scale    — $29/builder, $20/mo included LLM, SSO + audit + SLA.
--   enterprise — custom (self-host / BYOK / unlimited).

INSERT INTO plans (key, name, usd_cents, per_builder_cents, included_llm_cents, overage_markup, builders, max_conns, features) VALUES
  ('free',       'Free',       0, 0,    0,    1.05, 2, 10,  '{"byok_only": true, "scale_to_zero": true, "max_repos": 3, "history_days": 90}'),
  ('starter',    'Starter',    0, 700,  100,  1.05, 10, 50, '{"pdf_invoices": false}'),
  ('pro',        'Pro',        0, 1500, 500,  1.05, 0, 200, '{"pdf_invoices": true, "priority_sync": true, "advanced_analytics": true}'),
  ('scale',      'Scale',      0, 2900, 2000, 1.05, 0, 500, '{"pdf_invoices": true, "priority_sync": true, "advanced_analytics": true, "sso": true, "audit": true, "sla": true}'),
  ('enterprise', 'Enterprise', 0, 0,    0,    1.05, 0, 0,   '{"custom": true, "self_host": true, "byok": true, "unlimited": true}')
ON CONFLICT (key) DO UPDATE SET
  name               = EXCLUDED.name,
  usd_cents          = EXCLUDED.usd_cents,
  per_builder_cents  = EXCLUDED.per_builder_cents,
  included_llm_cents = EXCLUDED.included_llm_cents,
  overage_markup     = EXCLUDED.overage_markup,
  builders           = EXCLUDED.builders,
  max_conns          = EXCLUDED.max_conns,
  features           = EXCLUDED.features;

-- Retire the old 'team'/'business' keys (superseded by starter/pro/scale).
UPDATE organizations SET plan_key = 'pro' WHERE plan_key = 'business';
UPDATE organizations SET plan_key = 'starter' WHERE plan_key = 'team';
DELETE FROM plans WHERE key IN ('team', 'business', 'hobby');
UPDATE organizations SET plan_key = 'enterprise' WHERE plan_key = 'ent';
DELETE FROM plans WHERE key = 'ent';
