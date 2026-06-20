# Pricing comparison must be fair: gitstate is NOT always the cheapest

**Type:** product / honesty
**Area:** `/pricing`, `/compare` (CostCompare calculator + FeatureMatrix), billing model

## The problem

The cost calculator (`web/src/components/compare/CostCompare.jsx`) is built on the implicit assumption that **gitstate always wins** — the sort comment literally says *"cheapest first — gitstate should lead"*, and the surrounding copy leans on "always cheaper / always included." That is **not true for every team shape**, and shipping it as if it were is unfair to competitors and misleading to buyers.

### Grounded math (2026 list prices)

Competitors price **per seat**: GitHub Projects $3.67, Jira $7.53, ClickUp $7 (+$9 AI), Linear $8, ZenHub $8.33. gitstate prices **per builder** ($12 Team / $25 Business, managed AI included; **BYOK $8 / $13**) with **stakeholders free**.

- **Team with stakeholders (6 builders + 20 stakeholders):** gitstate 6×$12 = **$72** vs Linear $208, GitHub $95, ClickUp+AI $416 → gitstate wins decisively. ✅
- **Small all-builder team (5 builders, 0 stakeholders):** gitstate 5×$12 = **$60** (BYOK 5×$8 = **$40**) vs GitHub **$18**, ClickUp $35, Jira $38, Linear $40 → **gitstate loses on price**, even with BYOK. ❌

So the honest conclusion: **gitstate competes on per-builder + free stakeholders, not raw per-seat price.** For pure-builder teams with no stakeholders, cheap per-seat tools (especially GitHub's bundled $3.67) are cheaper.

## Why this matters

Claiming "always cheapest" when it isn't (a) erodes trust the moment a prospect runs their own numbers, and (b) buries the *real* differentiation (git-derived state, contribution/equity, invoicing-from-git, no manual updating).

## Resolution (chosen): reprice so the claim is TRUE

Rather than ship "sometimes a competitor wins," the product decision was to **reprice so gitstate is genuinely the cheapest at any team size** — and only then make the always-cheapest claim:

- **Team $12 → $6/builder managed (AI included), BYOK $3** ( = $6 − $3 included-LLM).
- **Business $25 → $14/builder managed, BYOK $8.**
- Stakeholders remain free.

This holds at the worst case (pure-builder, S=0): **with AI**, $6 < Linear $8 (cheapest AI-inclusive) and far below GitHub+Copilot $13.67 / ClickUp+Brain $16; **without AI**, BYOK $3 < GitHub $3.67. With any stakeholders, gitstate dominates. So the "cheapest at any size" statement is now *grounded*, not marketing.

Margins hold (billsim): the included-LLM was never our margin, so dropping it for BYOK and lowering the base still leaves Team/Business comfortably profitable; this is a deliberate land-grab on price + free-stakeholders + AI-included.

## Acceptance

- Calculator (slider-based) shows gitstate cheapest for **every** builder/stakeholder mix, with AI on and off — because the pricing makes it true.
- "Cheapest at any size" claims are backed by the live `/api/plans` numbers and the per-seat competitor list, with a transparent "how it's calculated" disclosure.
