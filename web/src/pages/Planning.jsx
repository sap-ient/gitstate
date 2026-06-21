/**
 * Planning — /planning
 *
 * Capacity-aware planning & forecasting. Connects the pieces gitstate already
 * tracks — availability, approved leave, throughput/velocity, and effort
 * estimates — into one honest answer: "what can we realistically ship by date X,
 * and who is over-allocated or on leave?"
 *
 * Sections:
 *   • Headline stats   — team effective days, velocity, backlog, projected finish
 *   • Capacity timeline — person-days per upcoming week with leave/OOO dips (SVG)
 *   • Forecast card     — backlog-completes-~date with the assumptions shown
 *   • Velocity readout  — recent delivery rate + trend (sparkline)
 *   • What-fits         — backlog vs horizon capacity
 *   • Warnings          — over-allocation / OOO / understaffed-week / thin-data
 *
 * Data: GET /api/planning?weeks=N&project=  (see usePlanning.js).
 */
import { useMemo, useState } from 'react'
import {
  CalendarRange, AlertCircle, Users, Gauge, Layers, CalendarClock, RotateCw, Loader2,
} from 'lucide-react'
import { usePlanning } from '../lib/usePlanning.js'
import { useProjects } from '../lib/useProjects.js'
import { Card, Button, StatCard } from '../components/ui/index.js'
import { Reveal, RevealList } from '../components/Reveal.jsx'
import {
  CapacityTimeline, VelocityReadout, ForecastCard, WarningsPanel, BacklogVsCapacity,
} from '../components/planning/index.js'

const HORIZONS = [
  { id: 4, label: '4 wks' },
  { id: 8, label: '8 wks' },
  { id: 12, label: '12 wks' },
]

function fmtShort(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function Planning() {
  const [weeks, setWeeks] = useState(8)
  const [project, setProject] = useState('')
  const { projects } = useProjects()
  const { data, loading, error, refetch } = usePlanning({ weeks, project })

  const totals = useMemo(() => {
    const cap = data?.capacity ?? []
    const effDays = cap.reduce((s, w) => s + (w.effectiveDays ?? 0), 0)
    const leaveDays = cap.reduce((s, w) => s + (w.leaveDays ?? 0), 0)
    return {
      effDays: Math.round(effDays),
      leaveDays: Math.round(leaveDays),
      members: (data?.members ?? []).length,
    }
  }, [data])

  const hasCapacity = (data?.capacity?.length ?? 0) > 0
  const f = data?.forecast ?? {}
  const v = data?.velocity ?? {}
  const b = data?.backlog ?? {}

  return (
    <div className="w-full space-y-8">
      {/* Header */}
      <Reveal>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-[var(--radius-btn)] bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/20 shrink-0">
              <CalendarRange size={17} className="text-[var(--brand-teal)]" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Planning &amp; Forecasting</h1>
              <p className="text-sm text-[var(--text-faint)] mt-1 max-w-2xl">
                What can we realistically ship, and who&apos;s over-allocated or on leave? Capacity, velocity,
                and a sized backlog combined into a projected completion date — fallbacks labelled, kept honest.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {projects.length > 0 && (
              <select
                value={project}
                onChange={e => setProject(e.target.value)}
                className="bg-[var(--bg)] text-xs text-[var(--text-muted)] rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors cursor-pointer"
              >
                <option value="">All projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
            <div className="flex items-center rounded-[var(--radius-btn)] p-0.5 gap-0.5 bg-[var(--bg)] border border-[var(--border)]">
              {HORIZONS.map(h => (
                <button
                  key={h.id}
                  onClick={() => setWeeks(h.id)}
                  className={[
                    'px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all duration-150',
                    weeks === h.id ? 'bg-[var(--bg-surface2)] text-[var(--brand-teal)]' : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]',
                  ].join(' ')}
                >
                  {h.label}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={refetch} leftIcon={loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}>
              Refresh
            </Button>
          </div>
        </div>
      </Reveal>

      {error && (
        <Card className="border-red-500/20 bg-red-500/[0.04]">
          <p className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={15} /> {error} — the backend may not be running yet.
          </p>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-[var(--radius-card)] h-24 animate-pulse bg-[var(--bg-surface)] border border-[var(--border)]" />
            ))}
          </div>
          <div className="rounded-[var(--radius-card)] h-72 animate-pulse bg-[var(--bg-surface)] border border-[var(--border)]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && data && !hasCapacity && (
        <Card padding="xl" className="border-dashed text-center">
          <Users size={22} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text)] mb-1">No team to plan around yet</p>
          <p className="text-xs text-[var(--text-faint)]">Invite members and set availability to build a capacity forecast.</p>
        </Card>
      )}

      {data && hasCapacity && (
        <>
          {/* Headline stats */}
          <RevealList className="grid grid-cols-2 md:grid-cols-4 gap-4" staggerDelay={0.04}>
            <StatCard
              icon={<Users size={14} />} label="Team capacity"
              value={<>{totals.effDays}<span className="text-base font-mono text-[var(--text-faint)] ml-1">d</span></>}
              accent="var(--chart-2)"
              sublabel={`${totals.members} member${totals.members === 1 ? '' : 's'} · ${totals.leaveDays}d on leave`}
            />
            <StatCard
              icon={<Gauge size={14} />} label="Velocity"
              value={v.hasData ? <>{v.meanPerWeek}<span className="text-base font-mono text-[var(--text-faint)] ml-1">/wk</span></> : '—'}
              accent="var(--chart-6)"
              sublabel={v.hasData ? `${v.trendLabel} · ${v.sampleWeeks} wks` : 'no recent throughput'}
            />
            <StatCard
              icon={<Layers size={14} />} label="Backlog"
              value={b.openCount ?? 0}
              accent="var(--chart-3)"
              sublabel={`${Math.round(b.totalEffortDays ?? 0)}d sized${b.usedFallback ? ` · ${b.unestimatedCount} est. fallback` : ''}`}
            />
            <StatCard
              icon={<CalendarClock size={14} />} label="Projected finish"
              value={f.feasible ? fmtShort(f.completionDate) : '—'}
              accent="var(--chart-1)"
              sublabel={f.feasible && f.weeksToComplete > 0 ? `~${f.weeksToComplete} wks at current rate` : 'velocity unknown'}
            />
          </RevealList>

          {/* Capacity timeline */}
          <Reveal delay={0.04}>
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-2)', background: 'color-mix(in srgb, var(--chart-2) 14%, transparent)' }}>
                    <CalendarClock size={15} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text)]">Weekly capacity timeline</h2>
                    <p className="text-xs text-[var(--text-faint)] mt-0.5">
                      Effective person-days per upcoming week — availability minus approved leave. Leave-heavy weeks flagged.
                    </p>
                  </div>
                </div>
              </div>
              <CapacityTimeline weeks={data.capacity} />
            </Card>
          </Reveal>

          {/* Forecast + velocity + what-fits */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Reveal delay={0.06} className="lg:col-span-1">
              <ForecastCard forecast={data.forecast} backlog={data.backlog} assumptions={data.assumptions} />
            </Reveal>
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-5 content-start">
              <Reveal delay={0.08}><VelocityReadout velocity={data.velocity} /></Reveal>
              <Reveal delay={0.1}><BacklogVsCapacity whatFits={data.whatFits} /></Reveal>
            </div>
          </div>

          {/* Warnings */}
          <Reveal delay={0.12}>
            <section>
              <div className="flex items-center gap-2.5 mb-3">
                <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 14%, transparent)' }}>
                  <AlertCircle size={15} />
                </span>
                <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                  Over-allocation &amp; understaffed weeks
                  {(data.warnings?.length ?? 0) > 0 && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded-full tabular-nums"
                      style={{ color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 15%, transparent)' }}
                    >
                      {data.warnings.length}
                    </span>
                  )}
                </h2>
              </div>
              <WarningsPanel warnings={data.warnings ?? []} />
            </section>
          </Reveal>
        </>
      )}
    </div>
  )
}
