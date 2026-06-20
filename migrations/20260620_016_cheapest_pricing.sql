-- 20260620_016_cheapest_pricing
-- Reprice so gitstate is the cheapest option at ANY team size.
-- Rationale: competitors price per SEAT and charge extra for AI. gitstate prices
-- per BUILDER (stakeholders free) with AI included. Setting Team to $6 managed
-- (AI included) beats the cheapest AI-inclusive competitor (Linear $8) even for a
-- pure-builder team; BYOK $3 (= $6 − $3 included-LLM) beats the cheapest no-AI
-- per-seat tool (GitHub Projects $3.67). With free stakeholders, gitstate wins at
-- every team shape. forward-only.

UPDATE plans SET per_builder_cents = 600,  included_llm_cents = 300  WHERE key = 'team';
UPDATE plans SET per_builder_cents = 1400, included_llm_cents = 600  WHERE key = 'business';

-- Managed LLM is metered at the model's EXACT standard rate — zero visible markup,
-- no per-seat AI tax. ALL of our margin is the bulk/committed-use discount we get
-- on tokens (~35%): we buy below list and charge list. So overage_markup = 1.00
-- (charge == list); the profit is purely the wholesale spread, never a markup.
UPDATE plans SET overage_markup = 1.00 WHERE key IN ('team','business');
