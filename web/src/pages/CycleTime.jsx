/**
 * CycleTime page — /cycle-time
 * Chart of lead-time over time from GET /api/metrics/cycle-time?repo=&from=&to=
 * Hand-rolled SVG via <LineChart>. Includes repo/date filters.
 */
import { useState } from 'react'
import { Timer, GitMerge, AlertTriangle, RotateCw, Gauge, Activity, TrendingUp, Zap, Hourglass } from 'lucide-react'
import { useCycleTime } from '../lib/useCycleTime.js'
import { useRepos } from '../lib/useRepos.js'
import { LineChart } from '../components/LineChart.jsx'
import { Card, Button, StatCard } from '../components/ui/index.js'
import { Reveal, RevealList } from '../components/Reveal.jsx'

function Spinner() {
  return (
    <svg className="animate-spin shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function computeStats(points) {
  const ys = points.map(p => p.days).filter(n => typeof n === 'number' && !Number.isNaN(n))
  if (!ys.length) return null
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length
  const sorted = [...ys].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length * 0.5)]
  const p90 = sorted[Math.floor(sorted.length * 0.9)]
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  return { avg, p50, p90, min, max }
}

const filterInputCls = "bg-[var(--bg)] text-xs text-[var(--text-muted)] rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors cursor-pointer"

// Skeleton matching StatCard's shape, shown during the initial load.
function StatCardSkeleton() {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-20 rounded bg-[var(--bg-surface3)] animate-pulse" />
        <div className="h-8 w-14 rounded bg-[var(--bg-surface3)] animate-pulse" />
        <div className="h-3 w-24 rounded bg-[var(--bg-surface3)] animate-pulse" />
      </div>
    </div>
  )
}

// Percent delta + direction between the last value and the prior-window mean of
// a numeric series. Returns null without enough signal. `goodWhenDown` flips the
// ok/bad semantics — for lead time, lower is better.
function trendDelta(values, { goodWhenDown = false } = {}) {
  const xs = (values || []).filter(v => typeof v === 'number' && isFinite(v))
  if (xs.length < 4) return null
  const last = xs[xs.length - 1]
  const prior = xs.slice(0, -1)
  const base = prior.reduce((a, b) => a + b, 0) / prior.length
  if (!base) return null
  const pct = Math.round(((last - base) / base) * 100)
  if (pct === 0) return null
  return { value: pct, dir: pct > 0 ? 'up' : 'down', goodWhenDown, title: `vs prior avg ${base.toFixed(1)}d` }
}

export default function CycleTime() {
  const { repos } = useRepos()
  const [repo, setRepo] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { points, loading, error, refetch } = useCycleTime({ repo, from, to })

  const stats = computeStats(points)
  const hasData = !loading && points.length > 0
  const isInitialLoad = loading && points.length === 0

  const chartPoints = points.map(pt => ({
    x: pt.date,
    y: typeof pt.days === 'number' ? pt.days : 0,
    label: pt.date,
    title: pt.title,
    repo: pt.repo,
  }))

  // Chronological lead-time series → a real sparkline on the headline tiles, plus
  // a trend delta (lower lead time is the "good" direction).
  const leadSeries = points.map(p => p.days).filter(n => typeof n === 'number' && !Number.isNaN(n))
  const sparkLead = leadSeries.length >= 2 ? leadSeries.slice(-24) : null
  const leadDelta = sparkLead ? trendDelta(sparkLead, { goodWhenDown: true }) : null

  const statTiles = [
    {
      label: 'Avg', accent: 'var(--chart-1)', icon: <Gauge size={14} />,
      value: stats ? `${stats.avg.toFixed(1)}d` : '—', sublabel: 'mean lead time',
      spark: sparkLead, delta: leadDelta,
    },
    {
      label: 'Median (p50)', accent: 'var(--chart-2)', icon: <Activity size={14} />,
      value: stats ? `${stats.p50.toFixed(1)}d` : '—', sublabel: 'typical PR',
    },
    {
      label: 'p90', accent: 'var(--chart-3)', icon: <TrendingUp size={14} />,
      value: stats ? `${stats.p90.toFixed(1)}d` : '—', sublabel: 'slowest 10%',
    },
    {
      label: 'Fastest', accent: 'var(--ok)', icon: <Zap size={14} />,
      value: stats ? `${stats.min.toFixed(1)}d` : '—', sublabel: 'quickest merge',
    },
    {
      label: 'Slowest', accent: 'var(--bad)', icon: <Hourglass size={14} />,
      value: stats ? `${stats.max.toFixed(1)}d` : '—', sublabel: 'longest in range',
    },
  ]

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <Reveal>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-[var(--radius-btn)] bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/20 shrink-0">
            <Timer size={17} className="text-[var(--brand-teal)]" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Cycle Time</h1>
            <p className="text-sm text-[var(--text-faint)] mt-1">
              Lead time from PR open to merge — derived from git, no estimates entered.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Filters */}
      <Reveal delay={0.05}>
        <Card padding="md">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-widest font-mono">Repository</label>
              <select className={filterInputCls} value={repo} onChange={e => setRepo(e.target.value)}>
                <option value="">All repos</option>
                {repos.map(r => <option key={r.id} value={r.name ?? r.fullName ?? r.id}>{r.name ?? r.fullName}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-widest font-mono">From</label>
              <input type="date" className={filterInputCls} value={from} onChange={e => setFrom(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-widest font-mono">To</label>
              <input type="date" className={filterInputCls} value={to} onChange={e => setTo(e.target.value)} />
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={refetch}
              disabled={loading}
              leftIcon={loading ? <Spinner /> : (
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              )}
            >
              Apply
            </Button>
          </div>
        </Card>
      </Reveal>

      {/* Error */}
      {error && (
        <Reveal>
          <Card className="border-red-500/25 bg-red-500/[0.04]">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-400">{error}</p>
                <p className="text-xs text-[var(--text-faint)] mt-0.5">The backend may not be running yet.</p>
              </div>
              <Button variant="outline" size="xs" onClick={refetch} leftIcon={<RotateCw size={12} />}>Retry</Button>
            </div>
          </Card>
        </Reveal>
      )}

      {/* Stats row — skeletons while loading, dashes when empty */}
      {!error && (
        <RevealList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4" staggerDelay={0.04}>
          {statTiles.map(t => (
            isInitialLoad
              ? <StatCardSkeleton key={t.label} />
              : <StatCard key={t.label} {...t} />
          ))}
        </RevealList>
      )}

      {/* Chart */}
      <Reveal delay={0.05} inView>
        <Card padding="lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-1)', background: 'color-mix(in srgb, var(--chart-1) 14%, transparent)' }}>
                <GitMerge size={15} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Lead time per merged PR</h2>
                <p className="text-xs text-[var(--text-faint)] mt-0.5">Days from PR open → merge, chronological</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {loading && <Spinner />}
              {hasData && (
                <span className="text-[11px] font-mono text-[var(--text-faint)] rounded-full px-2.5 py-1 bg-[var(--bg-surface2)] border border-[var(--border)] tabular-nums">{chartPoints.length} PRs</span>
              )}
            </div>
          </div>

          {loading && points.length === 0 ? (
            <div className="h-[220px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />
          ) : (
            <LineChart
              points={chartPoints}
              width={760}
              height={220}
              color="var(--chart-1)"
              xLabel={pt => {
                const d = new Date(pt.x)
                return isNaN(d) ? pt.x : `${d.getMonth() + 1}/${d.getDate()}`
              }}
              yLabel={v => `${Math.round(v)}d`}
              tooltip={pt => {
                const d = new Date(pt.x)
                const dateStr = isNaN(d) ? pt.x : d.toLocaleDateString()
                return [
                  dateStr,
                  `${pt.y.toFixed(1)} days`,
                  pt.title ? `"${pt.title}"` : '',
                  pt.repo ? `@ ${pt.repo}` : '',
                ].filter(Boolean).join(' · ')
              }}
              emptyIcon={<GitMerge size={22} className="text-[var(--text-faint)]" />}
              emptyText="No cycle-time data in this range — connect a repo and run a sync."
            />
          )}
        </Card>
      </Reveal>

      {/* Raw data table */}
      {hasData && (
        <Reveal delay={0.05} inView>
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-2)', background: 'color-mix(in srgb, var(--chart-2) 14%, transparent)' }}>
                  <GitMerge size={15} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text)]">Merged pull requests</h2>
                  <p className="text-xs text-[var(--text-faint)] mt-0.5">Every PR in range, newest first</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-[var(--text-faint)] rounded-full px-2.5 py-1 bg-[var(--bg-surface2)] border border-[var(--border)] tabular-nums">{points.length} rows</span>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-faint)]">
                    <th className="text-left px-2 py-2 font-mono uppercase tracking-wider font-medium">Date</th>
                    <th className="text-right px-2 py-2 font-mono uppercase tracking-wider font-medium">Lead time</th>
                    <th className="text-left px-2 py-2 font-mono uppercase tracking-wider font-medium">PR title</th>
                    <th className="text-left px-2 py-2 font-mono uppercase tracking-wider font-medium hidden sm:table-cell">Repo</th>
                  </tr>
                </thead>
                <tbody>
                  {points.slice().reverse().map((pt, i) => (
                    <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface2)] transition-colors">
                      <td className="px-2 py-2.5 text-[var(--text-faint)] font-mono whitespace-nowrap">{pt.date}</td>
                      <td className="px-2 py-2.5 text-right font-mono tabular-nums text-[var(--chart-1)] whitespace-nowrap">
                        {typeof pt.days === 'number' ? `${pt.days.toFixed(1)}d` : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-[var(--text-muted)] truncate max-w-[280px]">{pt.title || <span className="text-[var(--text-faint)] italic">untitled</span>}</td>
                      <td className="px-2 py-2.5 text-[var(--text-faint)] font-mono hidden sm:table-cell truncate max-w-[180px]">{pt.repo || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      )}
    </div>
  )
}
