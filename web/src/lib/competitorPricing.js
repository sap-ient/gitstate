/**
 * competitorPricing — shared, HONEST cost math for the Pricing + Compare
 * calculators.
 *
 * gitstate prices per BUILDER (stakeholders free). Managed includes AI; BYOK
 * drops the included-AI value (Team $12→$8, Business $25→$13).
 *
 * Competitors price per TOTAL seat (builders + stakeholders). AI is free
 * (Linear), bundled (Jira / ZenHub) or a per-seat add-on (ClickUp, GitHub).
 *
 * The core honesty rule: we compute everyone's real monthly bill and SORT BY
 * ACTUAL COST — gitstate is NOT assumed to lead. For small all-builder teams,
 * cheap per-seat tools (especially GitHub's $3.67) genuinely win, and the UI
 * must say so. gitstate's edge shows up once stakeholders are in the mix.
 *
 * All competitor numbers are the researched 2026 list prices — kept exactly.
 */

// ── gitstate per-builder pricing (managed + BYOK) ────────────────────────────
// These mirror GET /api/plans (perBuilderUsd / byokPerBuilderUsd). We default to
// the "Team" tier for the head-to-head calculator; the live values are passed in
// from the plans API so the calculator never hardcodes a stale number.
export const GITSTATE_DEFAULT = { managed: 12, byok: 8, planName: 'Team' }

// ── Competitors — per total seat, 2026 list prices (exact, never inflated) ───
export const COMPETITORS = [
  {
    key: 'github',
    label: 'GitHub Projects',
    perSeat: 3.67,
    aiAddOn: 10, // Copilot, per seat
    aiKind: 'addon',
    note: 'Team · Copilot +$10/seat',
  },
  {
    key: 'clickup',
    label: 'ClickUp',
    perSeat: 7,
    aiAddOn: 9, // Brain, per seat
    aiKind: 'addon',
    note: 'Paid · Brain AI +$9/seat',
  },
  {
    key: 'jira',
    label: 'Jira',
    perSeat: 7.53,
    aiAddOn: 0,
    aiKind: 'bundled',
    note: 'Standard · AI bundled',
    addonsNote: true, // marketplace add-ons run +30–50% in practice
  },
  {
    key: 'linear',
    label: 'Linear',
    perSeat: 8,
    aiAddOn: 0,
    aiKind: 'free',
    note: 'Standard · AI included free',
  },
  {
    key: 'zenhub',
    label: 'ZenHub',
    perSeat: 8.33,
    aiAddOn: 0,
    aiKind: 'bundled',
    note: 'Annual · AI bundled',
  },
]

/**
 * Resolve the gitstate per-builder price for the head-to-head calculator from
 * the live plans list. Falls back to GITSTATE_DEFAULT.
 * @param {Array} plans   GET /api/plans payload
 * @param {string} planKey which paid tier to compare against ('team' | 'business')
 */
export function gitstatePricing(plans, planKey = 'team') {
  const fallback = GITSTATE_DEFAULT
  if (!Array.isArray(plans)) return fallback
  const p = plans.find((x) => x.key === planKey)
  if (!p) return fallback
  const managed = typeof p.perBuilderUsd === 'number' && p.perBuilderUsd > 0 ? p.perBuilderUsd : fallback.managed
  const byok =
    typeof p.byokPerBuilderUsd === 'number' && p.byokPerBuilderUsd > 0 ? p.byokPerBuilderUsd : managed
  return { managed, byok, planName: p.name ?? fallback.planName }
}

/**
 * Compute monthly cost for gitstate + every competitor, SORTED BY ACTUAL COST
 * (cheapest first — whoever that is).
 *
 * @param {object}  o
 * @param {number}  o.builders
 * @param {number}  o.stakeholders
 * @param {boolean} o.byok          gitstate billing mode
 * @param {boolean} o.needsAi       add per-seat AI add-on for ClickUp / GitHub
 * @param {object}  o.gs            { managed, byok, planName }
 * @returns {{ rows: Array, gs: object, breakEven: number|null }}
 */
export function computeCosts({ builders, stakeholders, byok, needsAi, gs = GITSTATE_DEFAULT }) {
  const totalSeats = builders + stakeholders
  const gsPerBuilder = byok ? gs.byok : gs.managed

  const gitstate = {
    key: 'gitstate',
    label: 'gitstate',
    isGs: true,
    total: builders * gsPerBuilder,
    seatBasis: builders,
    seatLabel: builders === 1 ? 'builder' : 'builders',
    perUnit: gsPerBuilder,
    aiKind: 'included',
    note: `${gs.planName} · ${byok ? 'BYOK' : 'managed'}`,
    breakdown:
      `${builders} builder${builders === 1 ? '' : 's'} × $${gsPerBuilder}` +
      ` · ${stakeholders} stakeholder${stakeholders === 1 ? '' : 's'} free` +
      ` · AI ${byok ? 'BYOK' : 'included'}`,
  }

  const competitors = COMPETITORS.map((c) => {
    const seatCost = totalSeats * c.perSeat
    const aiCost = needsAi && c.aiKind === 'addon' ? totalSeats * c.aiAddOn : 0
    return {
      key: c.key,
      label: c.label,
      isGs: false,
      total: seatCost + aiCost,
      seatBasis: totalSeats,
      seatLabel: totalSeats === 1 ? 'seat' : 'seats',
      perUnit: c.perSeat,
      aiKind: c.aiKind,
      aiCost,
      aiAddOn: c.aiAddOn,
      addonsNote: c.addonsNote,
      note: c.note,
      breakdown:
        `${totalSeats} seat${totalSeats === 1 ? '' : 's'} × $${c.perSeat}` +
        (aiCost > 0 ? ` + AI ${totalSeats} × $${c.aiAddOn}` : ''),
    }
  })

  const rows = [gitstate, ...competitors]
  // HONEST sort: by real computed cost. No "gitstate should lead" assumption.
  rows.sort((a, b) => a.total - b.total || (a.isGs ? -1 : b.isGs ? 1 : 0))

  return {
    rows,
    gs: gitstate,
    breakEven: stakeholderBreakEven({ builders, byok, needsAi, gs }),
  }
}

/**
 * The smallest number of stakeholders at which gitstate becomes the cheapest
 * option (strictly ≤ every competitor) for a fixed builder count.
 *
 * gitstate cost is flat in stakeholders (builders × perBuilder); every
 * competitor grows with total seats, so there is always a crossover. Returns:
 *   - 0   → gitstate is already cheapest at zero stakeholders
 *   - N>0 → add ~N stakeholders and gitstate wins
 *   - null → unreachable within a sane cap (shouldn't happen given the math)
 */
export function stakeholderBreakEven({ builders, byok, needsAi, gs = GITSTATE_DEFAULT }) {
  const gsPerBuilder = byok ? gs.byok : gs.managed
  const gsTotal = builders * gsPerBuilder

  // Cheapest competitor per-seat (incl. AI add-on when AI is on).
  const seatPrices = COMPETITORS.map(
    (c) => c.perSeat + (needsAi && c.aiKind === 'addon' ? c.aiAddOn : 0),
  )
  const minSeat = Math.min(...seatPrices)
  if (minSeat <= 0) return null

  const CAP = 100000
  for (let s = 0; s <= CAP; s++) {
    const compMin = Math.min(
      ...COMPETITORS.map(
        (c) => (builders + s) * (c.perSeat + (needsAi && c.aiKind === 'addon' ? c.aiAddOn : 0)),
      ),
    )
    if (gsTotal <= compMin) return s
  }
  return null
}
