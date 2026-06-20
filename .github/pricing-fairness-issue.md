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

## Proposed fix

1. **Calculator honesty** — sort by actual computed cost (no "gitstate should lead" assumption). When a competitor is cheaper for the entered team shape, **say so**, and pivot the message to value ("$X more than GitHub, but you get …"). Show the stakeholder ratio where gitstate breaks even.
2. **Billing model** — BYOK now discounts the base by the included-LLM value (Team $12→$8, Business $25→$13) so BYOK is genuinely cheaper [implemented]. Don't overstate BYOK as "cheapest."
3. **FeatureMatrix** — keep the existing honest "where competitors lead" section; ensure the cost story matches it.

## Acceptance

- Calculator shows the true cheapest option for any builder/stakeholder mix, including cases where gitstate is not it.
- No "always cheapest" language anywhere in pricing/compare.
- A clear, honest statement of *when* gitstate is cheaper (stakeholder-heavy) and when it isn't (small all-builder teams).
