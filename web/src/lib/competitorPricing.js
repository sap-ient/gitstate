/**
 * competitorPricing — shared cost math for the Pricing + Compare calculators.
 *
 * gitstate prices per BUILDER (stakeholders are always free). Managed includes
 * AI; BYOK drops the included-AI value (Team $6 → $3, Business $14 → $8).
 *
 * FAIRNESS — every competitor number below is matched feature-to-feature at the
 * tier a team would actually buy for gitstate-equivalent work (boards/issues +
 * insights + AI assist), using VERIFIED 2026 list prices:
 *   · GitHub Projects — Team plan $4/seat; Copilot Pro +$10/seat (AI add-on).
 *       Projects ships bundled with code hosting, so this is the GitHub bill a
 *       team already pays — included as the toughest (cheapest) rival, labelled.
 *   · ClickUp — Unlimited $7/seat; Brain AI +$9/seat. Read-only GUESTS are FREE
 *       on Unlimited+, so stakeholders don't cost a seat here (credited below).
 *   · Jira — Standard $7.53/seat; Rovo AI is rolling out to Standard at no extra
 *       upfront cost (2026), so AI is treated as bundled (usage-limited).
 *   · Linear — Basic $10/seat (raised from $8); AI now needs paid credits, and
 *       free guests only exist on Business ($16), so Basic seats are all paid.
 *   · ZenHub — $8.33/seat (annual); AI bundled.
 *
 * Two fairness rules in the math:
 *   1. AI add-ons are charged per BUILDER, not per total seat — read-only
 *      stakeholders don't need a Copilot/Brain license.
 *   2. Where a competitor offers free read-only viewers/guests (ClickUp), those
 *      stakeholders are NOT billed a seat.
 *
 * Even after crediting rivals everything that's fair, gitstate still lands
 * cheapest at every team shape (worst case = all-builders: managed $6 < Jira
 * $7.53 with AI; BYOK $3 < GitHub $4 without). We sort by real computed cost and
 * report savings vs the next-cheapest rival and vs the most-expensive option.
 */

// ── gitstate per-builder pricing (managed + BYOK) ────────────────────────────
// These mirror GET /api/plans (perBuilderUsd / byokPerBuilderUsd). We default to
// the "Team" tier for the head-to-head calculator; the live values are passed in
// from the plans API so the calculator never hardcodes a stale number.
export const GITSTATE_DEFAULT = { managed: 6, byok: 3, planName: 'Team' }

// ── Competitors — verified 2026 list prices, matched feature-to-feature ──────
export const COMPETITORS = [
  {
    key: 'github',
    label: 'GitHub Projects',
    perSeat: 4, // GitHub Team, per seat
    aiAddOn: 10, // Copilot Pro, per builder
    aiKind: 'addon',
    freeViewers: false, // every member is a paid seat
    tier: 'Team',
    note: 'Team $4 · Copilot +$10 (bundled w/ code hosting)',
  },
  {
    key: 'clickup',
    label: 'ClickUp',
    perSeat: 7, // Unlimited
    aiAddOn: 9, // Brain, per builder
    aiKind: 'addon',
    freeViewers: true, // free read-only guests on Unlimited+
    tier: 'Unlimited',
    note: 'Unlimited $7 · Brain +$9 · guests free',
  },
  {
    key: 'jira',
    label: 'Jira',
    perSeat: 7.53, // Standard
    aiAddOn: 0,
    aiKind: 'bundled', // Rovo rolling out to Standard (2026), usage-limited
    freeViewers: false,
    tier: 'Standard',
    note: 'Standard $7.53 · Rovo AI bundled',
  },
  {
    key: 'linear',
    label: 'Linear',
    perSeat: 10, // Basic (raised from $8)
    aiAddOn: 0,
    aiKind: 'credits', // AI now requires paid credits
    freeViewers: false, // free guests only on Business ($16)
    tier: 'Basic',
    note: 'Basic $10 · AI = paid credits',
  },
  {
    key: 'zenhub',
    label: 'ZenHub',
    perSeat: 8.33, // annual
    aiAddOn: 0,
    aiKind: 'bundled',
    freeViewers: false,
    tier: 'Annual',
    note: 'Annual $8.33 · AI bundled',
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
 * (cheapest first). gitstate genuinely lands on top at every team shape.
 *
 * Fairness: AI add-ons are charged per BUILDER (read-only stakeholders don't need
 * an AI license); competitors with free read-only viewers (ClickUp guests) don't
 * bill those stakeholders a seat.
 *
 * @param {object}  o
 * @param {number}  o.builders
 * @param {number}  o.stakeholders
 * @param {boolean} o.byok          gitstate billing mode
 * @param {boolean} o.needsAi       Managed ⇒ true (rivals add per-builder AI); BYOK ⇒ false
 * @param {object}  o.gs            { managed, byok, planName }
 * @returns {{ rows, gs, nextCheapest, mostExpensive, saveVsNext, saveVsMax, pctVsNext, multipleVsMax }}
 */
export function computeCosts({ builders, stakeholders, byok, needsAi, gs = GITSTATE_DEFAULT }) {
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
    // Read-only stakeholders ride free only where the tool offers free viewers;
    // otherwise every seat is billed.
    const billedSeats = c.freeViewers ? builders : builders + stakeholders
    const seatCost = billedSeats * c.perSeat
    // AI is a per-BUILDER license (stakeholders are read-only and don't use it).
    const aiCost = needsAi && c.aiKind === 'addon' ? builders * c.aiAddOn : 0
    const freeRiders = c.freeViewers ? stakeholders : 0
    return {
      key: c.key,
      label: c.label,
      isGs: false,
      total: seatCost + aiCost,
      seatBasis: billedSeats,
      seatLabel: billedSeats === 1 ? 'seat' : 'seats',
      perUnit: c.perSeat,
      aiKind: c.aiKind,
      aiCost,
      aiAddOn: c.aiAddOn,
      freeViewers: c.freeViewers,
      freeRiders,
      tier: c.tier,
      note: c.note,
      breakdown:
        `${billedSeats} seat${billedSeats === 1 ? '' : 's'} × $${c.perSeat}` +
        (aiCost > 0 ? ` + AI ${builders} × $${c.aiAddOn}` : '') +
        (freeRiders > 0 ? ` · ${freeRiders} guest${freeRiders === 1 ? '' : 's'} free` : ''),
    }
  })

  const rows = [gitstate, ...competitors]
  // Sort by real computed cost; gitstate genuinely lands cheapest. Tie-break
  // keeps gitstate first when totals match (e.g. a degenerate zero case).
  rows.sort((a, b) => a.total - b.total || (a.isGs ? -1 : b.isGs ? 1 : 0))

  // Next-cheapest = the lowest-cost competitor (the closest rival to beat).
  const nextCheapest = rows.find((r) => !r.isGs) ?? null
  const mostExpensive = rows[rows.length - 1]

  const saveVsNext = nextCheapest ? nextCheapest.total - gitstate.total : 0
  const saveVsMax = mostExpensive ? mostExpensive.total - gitstate.total : 0
  // % cheaper than the next-cheapest rival (how much less gitstate costs).
  const pctVsNext =
    nextCheapest && nextCheapest.total > 0
      ? Math.round((saveVsNext / nextCheapest.total) * 100)
      : 0
  // "Z× less than the most expensive" — guard against divide-by-zero.
  const multipleVsMax =
    mostExpensive && gitstate.total > 0 ? mostExpensive.total / gitstate.total : null

  return {
    rows,
    gs: gitstate,
    nextCheapest,
    mostExpensive,
    saveVsNext,
    saveVsMax,
    pctVsNext,
    multipleVsMax,
  }
}
