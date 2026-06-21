/**
 * CalibrationPanel — surfaces the effort-estimator's calibration + accuracy.
 *
 * Backend (already live, see useEstimation.js):
 *   • accuracy[]    — per-cohort bias/MAE/sample-count. biasRatio<1 ⇒ under-est.
 *                     underPct>0 ⇒ runs N% low; <0 ⇒ runs high.
 *   • calibration[] — difficultyBucket(1–10) → observed median/p25/p75 secs.
 *
 * Layout (matches the DORA/tech-debt idiom — StatCards + a LineChart + a table):
 *   1. Headline StatCards from the `global` cohort: Bias, MAE, Samples, Cohorts.
 *   2. Per-cohort accuracy table, sorted by |bias| desc so the worst-calibrated
 *      cohorts surface ("estimates run 20% low on payments"). n ≥ MIN_N only.
 *   3. The calibration curve — difficulty → observed median secs (p25–p75 band)
 *      for a selectable cohort, via the shared multi-series LineChart.
 *
 * Everything degrades to an explanatory empty state on a fresh org. Both themes,
 * all semantic var(--…) tokens.
 */
import { useMemo, useState } from 'react'
import { Card, StatCard } from '../ui/index.js'
import { Gauge, Target, Ruler, Layers, Hash, Activity } from 'lucide-react'
import { LineChart } from '../LineChart.jsx'
import { fmtSecs } from './format.js'

// Min sample count for a cohort to be trusted in the table / curve picker.
const MIN_N = 3

// ── formatters ────────────────────────────────────────────────────────────────

/** "runs N% low/high" copy + semantic accent from a cohort's underPct. */
function biasView(underPct) {
  if (underPct == null || !Number.isFinite(Number(underPct))) {
    return { label: '—', mag: 0, accent: 'var(--text-faint)', dir: 'n/a' }
  }
  const v = Number(underPct)
  const mag = Math.abs(v)
  // near-zero ⇒ well-calibrated (ok); large skew ⇒ bad.
  const accent = mag < 8 ? 'var(--ok)' : mag < 20 ? 'var(--warn)' : 'var(--bad)'
  const dir = v > 0 ? 'low' : v < 0 ? 'high' : 'on'
  const label = mag < 1 ? 'on target' : `${mag.toFixed(0)}% ${dir}`
  return { label, mag, accent, dir, signed: v }
}

/**
 * Prettify a cohortKey for display.
 *   global              → "Overall"
 *   repo:<id>           → repo fullName (if resolvable) else "repo <id>"
 *   type:fix            → "Fixes"   (type:<x> → titlecase plural-ish)
 *   area:auth           → "auth"
 *   repo:<id>|area:auth → "<repo> · auth"
 */
function prettyCohort(key, repoById) {
  if (!key || key === 'global') return 'Overall'
  const parts = key.split('|').map(seg => {
    const [kind, ...rest] = seg.split(':')
    const val = rest.join(':')
    if (kind === 'repo') {
      const r = repoById?.get(val)
      const full = r?.fullName || r?.name
      if (full) return full.includes('/') ? full.split('/').slice(-1)[0] : full
      return `repo ${val}`
    }
    if (kind === 'type') {
      const map = { fix: 'Fixes', feat: 'Features', feature: 'Features', chore: 'Chores', refactor: 'Refactors' }
      return map[val] || (val ? val[0].toUpperCase() + val.slice(1) : seg)
    }
    if (kind === 'area') return val
    return seg
  })
  return parts.join(' · ')
}

// ── bias bar ──────────────────────────────────────────────────────────────────

/**
 * A centered bias indicator: a track with a centre baseline; the fill grows
 * left (runs high / over-estimates) or right (runs low / under-estimates) from
 * centre, proportional to |underPct| (clamped at 50%).
 */
function BiasBar({ underPct }) {
  const view = biasView(underPct)
  const v = view.signed
  if (v == null || !Number.isFinite(v)) {
    return <span className="text-[var(--text-faint)] font-mono text-xs">—</span>
  }
  const pct = Math.min(50, Math.abs(v)) // half-width %
  const right = v >= 0 // low ⇒ grows right
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="relative flex-1 h-1.5 rounded-full bg-[var(--bg-surface3)] overflow-hidden min-w-[64px]">
        {/* centre baseline */}
        <span className="absolute left-1/2 top-0 bottom-0 w-px bg-[var(--border2)] -translate-x-1/2 z-10" />
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: view.accent,
            width: `${pct}%`,
            ...(right ? { left: '50%' } : { right: '50%' }),
          }}
        />
      </div>
      <span className="font-mono tabular-nums text-xs w-[58px] text-right" style={{ color: view.accent }}>
        {view.label}
      </span>
    </div>
  )
}

// ── headline cards ──────────────────────────────────────────────────────────────

function HeadlineCards({ global, cohortsWithData }) {
  const bias = biasView(global?.underPct)
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Bias" accent={bias.accent} icon={<Target size={14} />}
        value={global ? bias.label : '—'}
        sublabel={global ? 'estimate vs actual (overall)' : 'no merged history yet'}
      />
      <StatCard
        label="Mean error" accent="var(--chart-2)" icon={<Ruler size={14} />}
        value={global?.maeSecs == null ? '—' : `±${fmtSecs(global.maeSecs)}`}
        sublabel="avg miss per estimate"
      />
      <StatCard
        label="Samples" accent="var(--chart-1)" icon={<Hash size={14} />}
        value={global?.n == null ? '—' : Number(global.n).toLocaleString()}
        sublabel="estimates scored (overall)"
      />
      <StatCard
        label="Cohorts" accent="var(--chart-5)" icon={<Layers size={14} />}
        value={String(cohortsWithData)}
        sublabel={`with n ≥ ${MIN_N} samples`}
      />
    </div>
  )
}

// ── per-cohort accuracy table ───────────────────────────────────────────────────

function CohortTable({ rows, repoById }) {
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Gauge size={22} className="text-[var(--text-faint)] mb-2" />
        <p className="text-sm text-[var(--text-dim)]">Not enough scored estimates yet.</p>
        <p className="text-[11px] text-[var(--text-faint)] mt-1 max-w-sm">
          Cohort accuracy needs at least {MIN_N} estimates with a known actual time.
          As issues with effort estimates get merged, the worst-calibrated areas surface here.
        </p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-[var(--text-faint)]">
            <th className="text-left font-mono uppercase tracking-wider font-medium px-2 py-2">Cohort</th>
            <th className="text-right font-mono uppercase tracking-wider font-medium px-2 py-2">n</th>
            <th className="text-left font-mono uppercase tracking-wider font-medium px-2 py-2 min-w-[140px]">Bias</th>
            <th className="text-right font-mono uppercase tracking-wider font-medium px-2 py-2">MAE</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cohortKey} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface2)] transition-colors">
              <td className="px-2 py-2.5">
                <span className="font-mono text-[var(--text-dim)] truncate max-w-[220px] inline-block align-middle" title={r.cohortKey}>
                  {prettyCohort(r.cohortKey, repoById)}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right font-mono tabular-nums text-[var(--text-muted)]">{Number(r.n).toLocaleString()}</td>
              <td className="px-2 py-2.5"><BiasBar underPct={r.underPct} /></td>
              <td className="px-2 py-2.5 text-right font-mono tabular-nums text-[var(--text-dim)]">
                {r.maeSecs == null ? '—' : `±${fmtSecs(r.maeSecs)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── calibration curve ───────────────────────────────────────────────────────────

function CalibrationCurve({ buckets }) {
  // buckets: rows for one cohort, each {difficultyBucket, medianSecs, p25Secs, p75Secs, ...}
  const sorted = useMemo(
    () => [...(buckets || [])]
      .filter(b => b?.difficultyBucket != null && b.medianSecs != null)
      .sort((a, b) => a.difficultyBucket - b.difficultyBucket),
    [buckets],
  )

  if (sorted.length < 2) {
    return (
      <LineChart
        points={[]}
        width={760} height={220}
        emptyIcon={<Activity size={20} className="text-[var(--text-faint)]" />}
        emptyText="Not enough merged history to plot the difficulty → time curve yet."
      />
    )
  }

  const hasBand = sorted.some(b => b.p25Secs != null && b.p75Secs != null)
  const series = [
    { name: 'median', color: 'var(--chart-1)', points: sorted.map(b => ({ x: b.difficultyBucket, y: Number(b.medianSecs), raw: b })) },
  ]
  if (hasBand) {
    series.unshift(
      { name: 'p25', color: 'var(--chart-2)', points: sorted.map(b => ({ x: b.difficultyBucket, y: b.p25Secs == null ? Number(b.medianSecs) : Number(b.p25Secs), raw: b })) },
      { name: 'p75', color: 'var(--chart-3)', points: sorted.map(b => ({ x: b.difficultyBucket, y: b.p75Secs == null ? Number(b.medianSecs) : Number(b.p75Secs), raw: b })) },
    )
  }

  return (
    <LineChart
      series={series}
      width={760} height={220}
      xLabel={p => `D${p.x}`}
      yLabel={v => fmtSecs(v)}
    />
  )
}

// ── panel ───────────────────────────────────────────────────────────────────────

export function CalibrationPanel({ accuracy = [], calibration = [], loading, repos = [] }) {
  const repoById = useMemo(() => {
    const m = new Map()
    for (const r of repos || []) m.set(String(r.id), r)
    return m
  }, [repos])

  const global = useMemo(() => (accuracy || []).find(a => a.cohortKey === 'global') || null, [accuracy])

  // Trusted cohorts, sorted worst-calibrated first (|bias| desc), global last-ish.
  const cohortRows = useMemo(() => {
    return (accuracy || [])
      .filter(a => (a.n ?? 0) >= MIN_N)
      .slice()
      .sort((a, b) => Math.abs(b.underPct ?? 0) - Math.abs(a.underPct ?? 0))
  }, [accuracy])

  // Cohorts present in the calibration curve data, for the picker.
  const curveCohorts = useMemo(() => {
    const counts = new Map()
    for (const b of calibration || []) {
      counts.set(b.cohortKey, (counts.get(b.cohortKey) || 0) + 1)
    }
    const keys = [...counts.keys()].filter(k => counts.get(k) >= 2)
    // global first, then the rest
    keys.sort((a, b) => (a === 'global' ? -1 : b === 'global' ? 1 : a.localeCompare(b)))
    return keys
  }, [calibration])

  const [selectedCohort, setSelectedCohort] = useState(null)
  const activeCohort = selectedCohort && curveCohorts.includes(selectedCohort)
    ? selectedCohort
    : (curveCohorts.includes('global') ? 'global' : curveCohorts[0] || 'global')

  const curveBuckets = useMemo(
    () => (calibration || []).filter(b => b.cohortKey === activeCohort),
    [calibration, activeCohort],
  )

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[120px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />)}
        </div>
        <div className="h-[260px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <HeadlineCards global={global} cohortsWithData={cohortRows.length} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Per-cohort accuracy */}
        <Card padding="lg" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-4)', background: 'color-mix(in srgb, var(--chart-4) 14%, transparent)' }}>
                <Target size={15} />
              </span> Per-cohort accuracy
            </h2>
            {cohortRows.length > 0 && <span className="text-xs font-mono text-[var(--text-faint)]">{cohortRows.length} cohorts</span>}
          </div>
          <p className="text-[11px] text-[var(--text-faint)] mb-4">
            Worst-calibrated first. Bias grows right when estimates run low, left when they run high.
          </p>
          <CohortTable rows={cohortRows} repoById={repoById} />
        </Card>

        {/* Calibration curve */}
        <Card padding="lg" className="lg:col-span-3">
          <div className="flex items-center justify-between mb-1 gap-3">
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-1)', background: 'color-mix(in srgb, var(--chart-1) 14%, transparent)' }}>
                <Activity size={15} />
              </span> Calibration curve
            </h2>
            {curveCohorts.length > 1 && (
              <select
                value={activeCohort}
                onChange={e => setSelectedCohort(e.target.value)}
                className="bg-[var(--bg)] text-[11px] font-mono text-[var(--text-muted)] rounded-[var(--radius-btn)] px-2.5 py-1.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors cursor-pointer max-w-[180px] truncate"
              >
                {curveCohorts.map(k => (
                  <option key={k} value={k}>{prettyCohort(k, repoById)}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-faint)] mb-4">
            Observed time by estimated difficulty (1–10){curveBuckets.some(b => b.p25Secs != null) ? ' — median with p25–p75 band' : ''}.
          </p>
          <div className="overflow-x-auto">
            <CalibrationCurve buckets={curveBuckets} />
          </div>
        </Card>
      </div>
    </div>
  )
}
