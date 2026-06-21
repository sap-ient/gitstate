/**
 * DoraRow — the DORA-style metric row for Engineering Health.
 *
 * Restyled onto the gitstate design system (StatCard + multi-series LineChart):
 *   • Change Failure Rate is the HERO stat — powered by REAL SZZ data
 *     (bug_introductions). Tagged "live · SZZ", with a semantic ok/warn/bad ramp.
 *   • The four DORA metrics (deploy freq, lead p50/p90, MTTR) are StatCards,
 *     each with its own --chart-* accent, icon chip and (where a series exists)
 *     a sparkline + trend delta. MTTR / change-failure carry --bad/--ok meaning.
 *   • Change-failure-over-time is a two-series LineChart (merged vs SZZ bug-fixes)
 *     with the categorical palette + legend.
 *
 * Both themes, all via semantic var(--…) tokens.
 */
import { useMemo } from 'react'
import { Card, StatCard } from '../ui/index.js'
import {
  AlertOctagon, Timer, Rocket, Wrench, GitMerge, Bug, TrendingUp,
} from 'lucide-react'
import { LineChart } from '../LineChart.jsx'
import { fmtPct, fmtHours, fmtRate, fmtNum, fmtDate } from './format.js'
import { ProvenanceTag } from './shared.jsx'

// Percent delta vs the prior-window mean of a numeric series; null without
// enough signal. `goodWhenDown` flips ok/bad — for lead time, lower is better.
function trendDelta(values, { goodWhenDown = false } = {}) {
  const xs = (values || []).filter(v => typeof v === 'number' && isFinite(v))
  if (xs.length < 4) return null
  const last = xs[xs.length - 1]
  const prior = xs.slice(0, -1)
  const base = prior.reduce((a, b) => a + b, 0) / prior.length
  if (!base) return null
  const pct = Math.round(((last - base) / base) * 100)
  if (pct === 0) return null
  return { value: pct, dir: pct > 0 ? 'up' : 'down', goodWhenDown, title: `vs prior avg ${base.toFixed(1)}` }
}

// Hero card for the change-failure rate — the page's anchor stat.
function HeroChangeFailure({ dora, loading }) {
  const cfr = dora?.changeFailureRate
  const pct = cfr == null ? null : cfr * 100
  // semantic ramp: <15% ok, <30% warn, else bad.
  const accent = pct == null ? 'var(--text-faint)'
    : pct < 15 ? 'var(--ok)' : pct < 30 ? 'var(--warn)' : 'var(--bad)'

  return (
    <Card padding="lg" className="relative overflow-hidden lg:col-span-2"
      style={{ background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-surface2))' }}>
      <div
        className="absolute -right-8 -top-8 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between relative">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-6 h-6 rounded-[6px] shrink-0"
            style={{ color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>
            <AlertOctagon size={14} />
          </span>
          <span className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-[var(--text-faint)]">Change failure rate</span>
        </div>
        <ProvenanceTag kind="live" note="Real signal: distinct SZZ bug-fix commits ÷ merged PRs in window." />
      </div>

      {loading ? (
        <div className="mt-4 h-12 w-32 rounded bg-[var(--bg-surface3)] animate-pulse" />
      ) : (
        <div className="mt-3 flex items-end gap-4">
          <div className="font-display text-5xl font-semibold tracking-tight tabular-nums" style={{ color: accent }}>
            {pct == null ? '—' : `${pct.toFixed(pct < 10 ? 1 : 0)}%`}
          </div>
          <div className="pb-1.5 text-[11px] font-mono text-[var(--text-faint)] leading-tight">
            <div className="flex items-center gap-1"><Bug size={11} className="text-[var(--text-faint)]" /> {fmtNum(dora?.bugFixChanges)} bug-fix changes</div>
            <div className="flex items-center gap-1"><GitMerge size={11} className="text-[var(--text-faint)]" /> {fmtNum(dora?.mergedPrs)} merged PRs</div>
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-[var(--text-faint)] leading-relaxed relative">
        Derived from SZZ blame — the share of shipped changes a later fix had to repair.
        This is gitstate's real defect signal, not a CI guess.
      </p>
      {dora?.hasCiData && (
        <div className="mt-2 flex items-center gap-2 relative">
          <ProvenanceTag kind="live" note="Real: failed deployments ÷ total deployments in window (CI-grounded)." />
          <span className="text-[11px] font-mono text-[var(--text-faint)]">
            CI change-failure {fmtPct(dora.ciChangeFailureRate)} · {fmtNum(dora.ciDeployFailures)}/{fmtNum(dora.ciDeploys)} deploys
          </span>
        </div>
      )}
    </Card>
  )
}

// Change-failure-over-time as two lines (merged vs SZZ bug-fixes), categorical
// palette + legend. Failure-rate per week is surfaced in the tooltip.
function ChangeFailureTrend({ trend }) {
  const pts = useMemo(() => (trend || []).filter(p => p?.week), [trend])

  if (!pts.length) {
    return (
      <LineChart
        series={[{ name: 'merged', points: [] }]}
        width={760} height={200}
        emptyIcon={<Bug size={20} className="text-[var(--text-faint)]" />}
        emptyText="No delivery data in this range."
      />
    )
  }

  const rateByIdx = pts.map(p => (p.rate == null ? null : p.rate))
  const series = [
    { name: 'merged', color: 'var(--chart-1)', points: pts.map(p => ({ x: p.week, y: p.merged || 0, raw: p })) },
    { name: 'bug-fixes', color: 'var(--bad)', points: pts.map(p => ({ x: p.week, y: p.bugFixes || 0, raw: p })) },
  ]

  return (
    <LineChart
      series={series}
      width={760}
      height={200}
      xLabel={p => fmtDate(p.x, { month: 'short', day: 'numeric' })}
      yLabel={v => `${Math.round(v)}`}
      tooltip={p => {
        const i = pts.findIndex(x => x.week === p.x)
        const r = i >= 0 ? rateByIdx[i] : null
        return `${fmtDate(p.x, { month: 'short', day: 'numeric', year: '2-digit' })} · rate ${r == null ? '—' : fmtPct(r)}`
      }}
    />
  )
}

export function DoraRow({ dora, loading }) {
  const d = dora ?? {}
  const leadTrend = useMemo(() => (d.leadTimeTrend || []).map(p => p.medianHours).filter(v => typeof v === 'number'), [d.leadTimeTrend])
  const cfTrendRates = useMemo(
    () => (d.changeFailureTrend || []).map(p => p?.rate).filter(v => typeof v === 'number'),
    [d.changeFailureTrend],
  )

  // p90 uses the same weekly-median lead trend as a tasteful shape proxy.
  const leadSpark = leadTrend.length >= 2 ? leadTrend.slice(-16) : null
  const cfSpark = cfTrendRates.length >= 2 ? cfTrendRates.slice(-16).map(r => r * 100) : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <HeroChangeFailure dora={d} loading={loading} />

        <StatCard
          label="Lead time p50" accent="var(--chart-2)" icon={<Timer size={14} />}
          value={fmtHours(d.leadTimeP50Hours)} sublabel="commit → merge · live"
          spark={leadSpark}
          delta={leadSpark ? trendDelta(leadSpark, { goodWhenDown: true }) : null}
        />
        <StatCard
          label="Lead time p90" accent="var(--chart-3)" icon={<TrendingUp size={14} />}
          value={fmtHours(d.leadTimeP90Hours)} sublabel="slowest 10% · live"
          spark={leadSpark}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Deploy frequency"
          accent="var(--chart-1)" icon={<Rocket size={14} />}
          value={d.deployFrequency?.value == null ? '—' : fmtRate(d.deployFrequency.value, '')}
          sublabel={`${d.deployFrequency?.unit || 'merges/week'} · ${d.deployFrequency?.real ? 'live' : 'proxy'}`}
        />
        <StatCard
          label="Change failure" accent="var(--bad)" icon={<AlertOctagon size={14} />}
          value={d.changeFailureRate == null ? '—' : fmtPct(d.changeFailureRate)}
          sublabel="shipped changes a fix repaired"
          spark={cfSpark}
          delta={cfSpark ? trendDelta(cfSpark, { goodWhenDown: true }) : null}
        />
        <StatCard
          label="MTTR"
          accent={d.mttr?.real ? 'var(--ok)' : 'var(--text-faint)'} icon={<Wrench size={14} />}
          value={d.mttr?.real ? fmtHours(d.mttr?.value) : '—'}
          sublabel={d.mttr?.real ? (d.mttr?.open > 0 ? `${d.mttr.open} open · live` : 'time to restore · live') : 'needs CI / incident data'}
        />
      </div>

      <Card padding="lg">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0"
              style={{ color: 'var(--bad)', background: 'color-mix(in srgb, var(--bad) 14%, transparent)' }}>
              <AlertOctagon size={15} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Change failure over time</h2>
              <p className="text-xs text-[var(--text-faint)] mt-0.5">Merged PRs vs SZZ-implicated bug-fixes, per week — rate in tooltip.</p>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="h-[200px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />
        ) : (
          <div className="overflow-x-auto">
            <ChangeFailureTrend trend={d.changeFailureTrend} />
          </div>
        )}
      </Card>
    </div>
  )
}
