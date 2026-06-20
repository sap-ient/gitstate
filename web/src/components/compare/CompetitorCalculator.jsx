/**
 * CompetitorCalculator — the shared, HONEST cost calculator used on both
 * /compare and /pricing.
 *
 * Inputs: # builders, # stakeholders, managed-vs-BYOK toggle, "need AI" toggle.
 * Computes gitstate (builders × managed-or-BYOK price, stakeholders free) vs
 * each competitor (totalSeats × per-seat + per-seat AI add-on for ClickUp /
 * GitHub when AI is on; Jira flagged "+add-ons run 30–50%").
 *
 * HONESTY (the core ask):
 *   - rows are sorted by ACTUAL computed cost — gitstate is NOT assumed to lead.
 *   - when a competitor is cheaper for the entered team shape, we SAY SO plainly
 *     and pivot to value (git-derived, nothing maintained by hand).
 *   - we show the BREAK-EVEN: "gitstate becomes cheapest once you have ~N
 *     stakeholders."
 *   - no "always cheapest" language anywhere.
 *
 * All competitor numbers are the researched 2026 list prices, kept exactly.
 * Currency-aware via useCurrency(). Hand-rolled SVG-free bar chart (CSS bars).
 */
import { useMemo, useState } from 'react'
import {
  Users, Eye, Sparkles, Info, Check, Minus, ArrowRight, TrendingDown,
  KeyRound, Server, GitBranch, Trophy,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useCurrency } from '../../lib/currency.jsx'
import {
  COMPETITORS, computeCosts, gitstatePricing, GITSTATE_DEFAULT,
} from '../../lib/competitorPricing.js'

// ── Stepper input ────────────────────────────────────────────────────────────
function Stepper({ icon: Icon, label, sublabel, value, setValue, min, max, accent }) {
  const clamp = (n) => Math.max(min, Math.min(max, n))
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className="flex items-center justify-center w-7 h-7 rounded-md shrink-0"
          style={{
            background: accent === 'teal' ? 'rgba(45,212,191,0.10)' : 'rgba(99,102,241,0.10)',
            color: accent === 'teal' ? '#2DD4BF' : '#818cf8',
          }}
        >
          <Icon size={15} strokeWidth={2} />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-medium text-[var(--text-dim)]">{label}</span>
          <span className="text-[11px] text-[var(--text-faint)]">{sublabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => setValue(clamp(value - 1))}
          disabled={value <= min}
          className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-btn)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border2)] hover:text-[var(--text)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <Minus size={15} strokeWidth={2.5} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10)
            setValue(Number.isNaN(n) ? min : clamp(n))
          }}
          className="flex-1 h-9 min-w-0 text-center font-mono text-base font-semibold text-[var(--text)] bg-[var(--bg-surface3)] border border-[var(--border)] rounded-[var(--radius-btn)] focus:outline-none focus:border-[#2DD4BF]/50 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => setValue(clamp(value + 1))}
          disabled={value >= max}
          className="flex items-center justify-center w-9 h-9 rounded-[var(--radius-btn)] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border2)] hover:text-[var(--text)] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <span className="text-base leading-none font-semibold">+</span>
        </button>
      </div>
    </div>
  )
}

// ── Pill toggle (segmented, two options) ─────────────────────────────────────
function SegToggle({ label, options, value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">{label}</span>
      <div className="inline-flex rounded-[var(--radius-btn)] border border-[var(--border2)] bg-[var(--bg-surface3)] p-0.5">
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all duration-150 cursor-pointer',
                active ? 'text-[#0B1120]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              ].join(' ')}
              style={active ? { background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' } : undefined}
            >
              {opt.icon}
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Hand-rolled bar chart ────────────────────────────────────────────────────
function BarChart({ rows, format }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  const rowH = 50
  const labelW = 132

  return (
    <div className="w-full">
      {rows.map((r, i) => {
        const pct = (r.total / max) * 100
        const isFree = r.total === 0
        const isCheapest = i === 0
        return (
          <div key={r.key} className="group flex items-center" style={{ height: rowH }}>
            {/* Label */}
            <div className="flex items-center gap-2 pr-3 shrink-0" style={{ width: labelW }}>
              <span className="font-mono text-[10px] text-[var(--text-faint)] tabular-nums w-4 text-right">
                {i + 1}
              </span>
              <span
                className={['text-[13px] truncate', r.isGs ? 'font-semibold' : 'font-medium'].join(' ')}
                style={{ color: r.isGs ? '#2DD4BF' : 'var(--text-dim)' }}
              >
                {r.label}
              </span>
              {isCheapest && (
                <Trophy size={11} className="text-[#fbbf24] shrink-0" strokeWidth={2.2} aria-label="cheapest" />
              )}
            </div>

            {/* Bar track */}
            <div className="relative flex-1 h-full flex items-center">
              <div className="relative w-full h-7 rounded-md overflow-hidden bg-[var(--bg-surface3)]/50">
                <div
                  className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-500 ease-out"
                  style={{
                    width: `${Math.max(pct, isFree ? 0 : 2)}%`,
                    background: r.isGs
                      ? 'linear-gradient(90deg, #2DD4BF, #6366F1)'
                      : isCheapest
                      ? 'linear-gradient(90deg, rgba(251,191,36,0.55), rgba(251,191,36,0.30))'
                      : 'linear-gradient(90deg, var(--bg-surface3), var(--border2))',
                    boxShadow: r.isGs ? '0 0 18px rgba(45,212,191,0.35)' : 'none',
                  }}
                />
              </div>
              <span
                className="absolute text-[13px] font-mono font-semibold tabular-nums pointer-events-none text-[var(--text-dim)]"
                style={{
                  left: r.isGs && pct > 24 ? `calc(${Math.min(pct, 100)}% - 4.5rem)` : 'auto',
                  right: r.isGs && pct > 24 ? 'auto' : '0.5rem',
                  color: r.isGs && pct > 24 ? '#0B1120' : undefined,
                }}
              >
                {format(r.total)}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── How-it's-calculated disclosure ───────────────────────────────────────────
function MathDisclosure({ format, gs }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 border-t border-[var(--border)] pt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
      >
        <Info size={13} />
        How this is calculated
        <span className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      <div className="grid transition-all duration-300 ease-out" style={{ gridTemplateRows: open ? '1fr' : '0fr' }}>
        <div className="overflow-hidden">
          <div className="pt-3 text-[12px] text-[var(--text-faint)] leading-relaxed space-y-2.5">
            <p>
              <span className="text-[#2DD4BF] font-medium">gitstate</span> bills only{' '}
              <span className="text-[var(--text-muted)]">builders</span> — {format(gs.managed)}/builder managed (AI
              included) or {format(gs.byok)}/builder BYOK (you bring your own LLM key; we drop the included-AI value).
              Stakeholders are always free.
            </p>
            <p>
              Every competitor bills <span className="text-[var(--text-muted)]">per total seat</span> (builders{' '}
              <em className="not-italic">plus</em> stakeholders). 2026 list prices:
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-mono pl-1">
              <li>GitHub Projects — {format(3.67)}/seat · Copilot +{format(10)}/seat</li>
              <li>ClickUp — {format(7)}/seat · Brain AI +{format(9)}/seat</li>
              <li>Jira — {format(7.53)}/seat · AI bundled</li>
              <li>Linear — {format(8)}/seat · AI free</li>
              <li>ZenHub — {format(8.33)}/seat · AI bundled</li>
            </ul>
            <p>
              With <span className="text-[var(--text-muted)]">“need AI”</span> on, ClickUp and GitHub add their
              per-seat AI add-on to every seat. Jira&apos;s marketplace add-ons commonly add{' '}
              <span className="text-[var(--text-muted)]">+30–50%</span> in practice — not included above, so
              Jira&apos;s real cost is typically higher than shown.
            </p>
            <p className="text-[var(--text-faint)]">
              Rows are sorted by actual computed cost. We don&apos;t assume gitstate is cheapest — for small
              all-builder teams it usually isn&apos;t, and the calculator says so.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
/**
 * @param {object}  props
 * @param {Array}   props.plans         GET /api/plans payload (for live gitstate price)
 * @param {string}  props.planKey       'team' | 'business' — which tier to compare
 * @param {boolean} props.compact       tighter spacing variant
 */
export default function CompetitorCalculator({ plans, planKey = 'team' }) {
  const { format } = useCurrency()
  const [builders, setBuilders] = useState(6)
  const [stakeholders, setStakeholders] = useState(20)
  const [byok, setByok] = useState(false)
  const [needsAi, setNeedsAi] = useState(true)

  const gsPrice = useMemo(() => gitstatePricing(plans, planKey), [plans, planKey])

  const { rows, gs, breakEven } = useMemo(
    () => computeCosts({ builders, stakeholders, byok, needsAi, gs: gsPrice }),
    [builders, stakeholders, byok, needsAi, gsPrice],
  )

  const cheapest = rows[0]
  const gsWins = cheapest.isGs
  const cheaperRivals = rows.filter((r) => !r.isGs && r.total < gs.total)
  // The single most-relevant rival to anchor the narrative against.
  const anchor = gsWins
    ? rows.find((r) => !r.isGs) // cheapest competitor we beat
    : cheaperRivals[0] // cheapest rival that beats us

  const deltaVsAnchor = anchor ? Math.abs(gs.total - anchor.total) : 0
  const mostExpensive = rows[rows.length - 1]
  const savedVsMax = mostExpensive.total - gs.total

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border2)] bg-[var(--bg-surface)] grain">
      <div className="absolute inset-0 ambient-brand pointer-events-none" />
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[300px_1fr]">

        {/* ── Inputs panel ── */}
        <div className="p-6 md:p-7 border-b lg:border-b-0 lg:border-r border-[var(--border)] bg-[var(--bg-surface2)]/40">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
            your team
          </span>
          <p className="text-xs text-[var(--text-muted)] mt-1 mb-6 leading-relaxed">
            Set your team shape — we compute every tool&apos;s real monthly bill and rank by actual cost.
          </p>

          <div className="space-y-6">
            <Stepper
              icon={Users}
              label="Builders"
              sublabel="ship code · run agents"
              value={builders}
              setValue={setBuilders}
              min={1}
              max={500}
              accent="teal"
            />
            <Stepper
              icon={Eye}
              label="Stakeholders"
              sublabel="read-only · PMs, clients, execs"
              value={stakeholders}
              setValue={setStakeholders}
              min={0}
              max={5000}
              accent="indigo"
            />

            <SegToggle
              label="gitstate billing"
              value={byok}
              onChange={setByok}
              options={[
                { value: false, label: `Managed ${format(gsPrice.managed)}`, icon: <Sparkles size={12} /> },
                { value: true, label: `BYOK ${format(gsPrice.byok)}`, icon: <KeyRound size={12} /> },
              ]}
            />

            <SegToggle
              label="need AI features"
              value={needsAi}
              onChange={setNeedsAi}
              options={[
                { value: true, label: 'Yes', icon: <Check size={12} /> },
                { value: false, label: 'No', icon: <Minus size={12} /> },
              ]}
            />
          </div>

          {/* gitstate context note */}
          <div className="mt-6 rounded-[var(--radius-badge)] border border-[#2DD4BF]/20 bg-[#2DD4BF]/[0.05] px-3 py-2.5">
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed flex items-start gap-1.5">
              <Eye size={13} className="text-[#2DD4BF] shrink-0 mt-0.5" strokeWidth={2.2} />
              <span>
                gitstate charges only for builders — <span className="text-[#2DD4BF] font-medium">stakeholders are free</span>.
                {' '}{byok
                  ? 'BYOK drops the included-AI value; you route LLM calls to your own key.'
                  : 'Managed bundles AI — no per-seat AI tax.'}
              </span>
            </p>
          </div>
        </div>

        {/* ── Results panel ── */}
        <div className="p-6 md:p-8">
          {/* Headline — honest, depends on who actually wins */}
          <div className="mb-6">
            {gsWins ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-[#2DD4BF] mb-2">
                  <TrendingDown size={13} /> gitstate is cheapest for this team
                </span>
                <h3 className="font-display text-2xl md:text-[28px] font-bold text-[var(--text)] leading-tight tracking-tight">
                  {format(gs.total)}/mo on gitstate —{' '}
                  <span className="gradient-text">
                    {savedVsMax > 0 ? `${format(savedVsMax)}/mo less` : 'the lowest bill'}
                  </span>{' '}
                  than {mostExpensive.label}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                  With <span className="text-[var(--text-dim)] font-medium">{stakeholders} free stakeholder
                  {stakeholders === 1 ? '' : 's'}</span>, per-seat tools tax every viewer — gitstate doesn&apos;t.
                  {savedVsMax > 0 && <> That&apos;s ≈ {format(savedVsMax * 12)}/yr versus the priciest option.</>}
                </p>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-[#fbbf24] mb-2">
                  <Trophy size={13} /> {cheapest.label} is cheaper for this team
                </span>
                <h3 className="font-display text-2xl md:text-[28px] font-bold text-[var(--text)] leading-tight tracking-tight">
                  gitstate is{' '}
                  <span className="text-[#fbbf24]">{format(deltaVsAnchor)}/mo more</span>{' '}
                  than {anchor?.label}
                </h3>
                <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                  Straight on price, {cheapest.label} wins this shape — a small all-builder team with{' '}
                  {stakeholders === 0 ? 'no' : `only ${stakeholders}`} stakeholder{stakeholders === 1 ? '' : 's'}{' '}
                  is exactly where cheap per-seat tools lead. But that {format(deltaVsAnchor)}/mo buys you{' '}
                  <span className="text-[var(--text-dim)]">
                    state derived from git
                  </span>{' '}
                  — every status, metric and invoice line read from commits and PRs, nothing maintained by hand.
                </p>
              </>
            )}
          </div>

          {/* Break-even callout */}
          <BreakEven
            builders={builders}
            stakeholders={stakeholders}
            breakEven={breakEven}
            gsWins={gsWins}
          />

          {/* Chart */}
          <div className="mt-6">
            <BarChart rows={rows} format={format} />
          </div>

          {/* Per-tool table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[460px]">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
                  <th className="text-left font-medium pb-2">Tool</th>
                  <th className="text-left font-medium pb-2 hidden sm:table-cell">Basis</th>
                  <th className="text-right font-medium pb-2">Monthly</th>
                  <th className="text-right font-medium pb-2">vs gitstate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const delta = r.total - gs.total // + = costs more than gitstate
                  return (
                    <tr
                      key={r.key}
                      className={['border-t border-[var(--border)]', r.isGs ? 'bg-[#2DD4BF]/[0.05]' : ''].join(' ')}
                    >
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[13px] font-medium"
                            style={{ color: r.isGs ? '#2DD4BF' : 'var(--text-dim)' }}
                          >
                            {r.label}
                          </span>
                          {r.isGs && (
                            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#2DD4BF]/15 text-[#2DD4BF]">
                              you
                            </span>
                          )}
                          {r.addonsNote && (
                            <span
                              className="text-[9px] font-mono text-yellow-400/80"
                              title="Marketplace add-ons add +30–50% in practice"
                            >
                              +add-ons*
                            </span>
                          )}
                        </div>
                        <span className="block text-[10px] text-[var(--text-faint)] font-mono mt-0.5">
                          {r.breakdown}
                        </span>
                      </td>
                      <td className="py-2.5 pr-2 hidden sm:table-cell">
                        <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                          {r.seatBasis} {r.seatLabel}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <span
                          className="text-[13px] font-mono font-semibold tabular-nums"
                          style={{ color: r.isGs ? '#2DD4BF' : 'var(--text-dim)' }}
                        >
                          {format(r.total)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {r.isGs ? (
                          <span className="text-[11px] font-mono text-[var(--text-faint)]">—</span>
                        ) : delta >= 0 ? (
                          <span className="text-[12px] font-mono font-semibold tabular-nums text-[#2DD4BF]">
                            +{format(delta)}
                            <span className="text-[10px] text-[#2DD4BF]/70 ml-1">more</span>
                          </span>
                        ) : (
                          <span className="text-[12px] font-mono font-semibold tabular-nums text-[#fbbf24]">
                            −{format(Math.abs(delta))}
                            <span className="text-[10px] text-[#fbbf24]/70 ml-1">less</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <MathDisclosure format={format} gs={gsPrice} />

          {/* CTA */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-[var(--radius-btn)] font-semibold text-sm text-[#0B1120] w-full sm:w-auto transition-all duration-150 hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
            >
              {gsWins ? 'Start free — keep the savings' : 'Try gitstate free'}
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
            <span className="text-[11px] text-[var(--text-faint)] leading-relaxed">
              Self-host is free forever ·{' '}
              <span className="inline-flex items-center gap-1 font-mono text-[var(--text-muted)]">
                <GitBranch size={11} /> AGPL-3.0
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Break-even callout ───────────────────────────────────────────────────────
function BreakEven({ builders, stakeholders, breakEven, gsWins }) {
  if (breakEven == null) return null

  // already winning
  if (gsWins) {
    const headroom = stakeholders - breakEven
    return (
      <div className="flex items-start gap-2.5 rounded-[var(--radius-badge)] border border-[#2DD4BF]/25 bg-[#2DD4BF]/[0.06] px-3.5 py-3 text-xs leading-relaxed">
        <Server size={14} className="text-[#2DD4BF] shrink-0 mt-0.5" />
        <span className="text-[var(--text-dim)]">
          gitstate becomes the cheapest option at{' '}
          <strong className="text-[#2DD4BF]">~{breakEven} stakeholder{breakEven === 1 ? '' : 's'}</strong> for{' '}
          {builders} builder{builders === 1 ? '' : 's'} — you have{' '}
          {headroom > 0 ? <>{headroom} past that line</> : <>just crossed it</>}. Every extra stakeholder is free
          here and billable everywhere else.
        </span>
      </div>
    )
  }

  // losing on price — show the crossover honestly
  const needed = Math.max(0, breakEven - stakeholders)
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--radius-badge)] border border-[#fbbf24]/25 bg-[#fbbf24]/[0.06] px-3.5 py-3 text-xs leading-relaxed">
      <Info size={14} className="text-[#fbbf24] shrink-0 mt-0.5" />
      <span className="text-[var(--text-dim)]">
        gitstate becomes the cheapest option once you have{' '}
        <strong className="text-[#fbbf24]">~{breakEven} stakeholder{breakEven === 1 ? '' : 's'}</strong> on{' '}
        {builders} builder{builders === 1 ? '' : 's'}
        {needed > 0 && <> — about {needed} more than you entered</>}. Below that, per-seat tools are cheaper and we
        won&apos;t pretend otherwise.
      </span>
    </div>
  )
}

// Re-export shared constants for any consumer that wants the raw list.
export { COMPETITORS, GITSTATE_DEFAULT }
