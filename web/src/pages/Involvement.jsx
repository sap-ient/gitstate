/**
 * Involvement page — /involvement
 * Renders each person as a multi-dimension card.
 * Explicitly NOT a ranked leaderboard. NOT a single score.
 * Caption: "involvement across dimensions — not a productivity score."
 *
 * Data from GET /api/metrics/involvement?project=&period=
 */
import { useState, useMemo } from 'react'
import { RefreshCw, Info, Users, GitMerge, Eye, FolderGit2, AlertTriangle, RotateCw, Activity, Layers, GitCommit, Bot } from 'lucide-react'
import { useInvolvement } from '../lib/useInvolvement.js'
import { useProjects } from '../lib/useProjects.js'
import { Card, Button, StatCard } from '../components/ui/index.js'
import { Reveal, RevealList } from '../components/Reveal.jsx'

// Section header in the Dashboard idiom: accent icon chip + title + faint subtitle.
function SectionHeader({ icon, accent = 'var(--brand-teal)', title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <span
          className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0"
          style={{ color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)` }}
        >
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--text-faint)] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function Initials({ name, email }) {
  const text = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email ?? '?').slice(0, 2).toUpperCase()
  return (
    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] flex items-center justify-center text-[12px] font-bold text-[#0B1120] select-none shrink-0">
      {text}
    </div>
  )
}

function DimBar({ label, value, max, color, icon: Icon }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-[var(--text-faint)] w-28 shrink-0 flex items-center gap-1.5 font-mono">
        {Icon && <Icon size={11} className="opacity-80" style={{ color }} />}
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-surface3)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, color-mix(in srgb, ${color} 72%, transparent), ${color})`,
          }}
        />
      </div>
      <span className="text-[11px] font-mono text-[var(--text-dim)] w-8 text-right shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

function ActivityDot({ active, lastActive }) {
  return (
    <div className="flex items-center gap-1.5" title={active ? 'Active recently' : 'Dormant'}>
      <span className="relative flex w-2 h-2 shrink-0">
        {active && <span className="absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping" style={{ background: 'var(--ok)' }} />}
        <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: active ? 'var(--ok)' : 'var(--border2)' }} />
      </span>
      <span className="text-[10px] text-[var(--text-faint)]">
        {active ? 'active' : 'dormant'}
        {lastActive ? ` · ${new Date(lastActive).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
      </span>
    </div>
  )
}

function InvolvementCard({ member, maxes }) {
  const {
    name, email,
    featuresShipped = 0,
    reviewsDone = 0,
    areasOwned = 0,
    activeRecently = false,
    lastActive,
    isAgent = false,
    dimensions = {},
  } = member

  const commits = dimensions.commitCount ?? 0
  const added = dimensions.linesAdded ?? 0
  const deleted = dimensions.linesDeleted ?? 0

  return (
    <Card padding="md" hoverable className="flex flex-col gap-4">
      {/* Identity row */}
      <div className="flex items-start gap-3">
        <Initials name={name} email={email} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--text)] truncate">{name || email}</span>
            {isAgent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--brand-indigo)]/10 text-[var(--brand-indigo)] border border-[var(--brand-indigo)]/20">
                <Bot size={10} /> agent
              </span>
            )}
            <ActivityDot active={activeRecently} lastActive={lastActive} />
          </div>
          {name && email && (
            <span className="text-xs text-[var(--text-faint)] truncate block">{email}</span>
          )}
        </div>
      </div>

      {/* Multi-dimension bars — the "texture" view, never a single score.
          One categorical --chart-* color per dimension. */}
      <div className="space-y-2.5">
        <DimBar label="Features shipped" value={featuresShipped} max={maxes.featuresShipped} color="var(--chart-1)" icon={GitMerge} />
        <DimBar label="Reviews done" value={reviewsDone} max={maxes.reviewsDone} color="var(--chart-2)" icon={Eye} />
        <DimBar label="Areas owned" value={areasOwned} max={maxes.areasOwned} color="var(--chart-5)" icon={FolderGit2} />
      </div>

      {/* Commit-volume texture — an independent fact, not summed into any score. */}
      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-faint)] pt-1 border-t border-[var(--border)]">
        <span className="flex items-center gap-1"><GitCommit size={10} /> {commits.toLocaleString()} commits</span>
        <span className="tabular-nums">
          <span className="text-[var(--ok)]">+{added.toLocaleString()}</span>
          {' / '}
          <span className="text-[var(--bad)]">-{deleted.toLocaleString()}</span>
        </span>
      </div>
    </Card>
  )
}

const PERIODS = [
  { id: '7d',  label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
]

export default function Involvement() {
  const { projects } = useProjects()
  const [project, setProject] = useState('')
  const [period, setPeriod] = useState('30d')

  const { members, loading, error, refetch } = useInvolvement({ project, period })

  // Compute per-dimension maxes for relative bars — never a composite score
  const maxes = {
    featuresShipped: Math.max(1, ...members.map(m => m.featuresShipped ?? 0)),
    reviewsDone:     Math.max(1, ...members.map(m => m.reviewsDone ?? 0)),
    areasOwned:      Math.max(1, ...members.map(m => m.areasOwned ?? 0)),
  }

  // Cohort headline numbers — derived purely from the fetched roster, no new metrics.
  const totals = useMemo(() => {
    let shipped = 0, reviews = 0, active = 0, areas = 0
    for (const m of members) {
      shipped += m.featuresShipped ?? 0
      reviews += m.reviewsDone ?? 0
      if (m.activeRecently) active += 1
      // areas_owned is a per-person breadth count; the cohort figure is the widest.
      areas = Math.max(areas, m.areasOwned ?? 0)
    }
    return { shipped, reviews, active, areas }
  }, [members])

  const hasData = !loading && members.length > 0

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <Reveal>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-[var(--radius-btn)] bg-[var(--brand-indigo)]/10 border border-[var(--brand-indigo)]/20 shrink-0">
            <Users size={17} className="text-[var(--brand-indigo)]" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Involvement</h1>
            {/* Honest caption — not a score */}
            <p className="text-sm text-[var(--text-faint)] mt-1">
              Involvement across dimensions — not a productivity score.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Principle callout — texture, not a number */}
      <Reveal delay={0.05}>
        <Card className="border-[var(--brand-indigo)]/15 bg-gradient-to-r from-[var(--brand-indigo)]/[0.04] to-[var(--brand-teal)]/[0.03]" padding="md">
          <div className="flex items-start gap-3">
            <Info size={15} className="mt-0.5 shrink-0 text-[var(--brand-indigo)]" />
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              This view shows <strong className="text-[var(--brand-indigo)] font-semibold">texture across multiple dimensions</strong> — features shipped, review load, areas owned, and activity — so seniors, mentors, and reviewers are visible alongside feature authors. No single number, no ranking, no formula.
            </p>
          </div>
        </Card>
      </Reveal>

      {/* Filters */}
      <Reveal delay={0.08}>
        <div className="flex flex-wrap gap-4 items-center">
          {/* Period */}
          <div className="flex items-center rounded-[var(--radius-btn)] p-0.5 gap-0.5 bg-[var(--bg)] border border-[var(--border)]">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={[
                  'px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all duration-150',
                  period === p.id
                    ? 'bg-[var(--bg-surface2)] text-[var(--brand-teal)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]',
                ].join(' ')}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Project filter */}
          {projects.length > 0 && (
            <select
              className="bg-[var(--bg)] text-xs text-[var(--text-muted)] rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50 transition-colors cursor-pointer"
              value={project}
              onChange={e => setProject(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            disabled={loading}
            leftIcon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
          >
            Refresh
          </Button>

          {!loading && members.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-faint)] font-mono ml-auto">
              <Users size={13} /> {members.length} member{members.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
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

      {/* Cohort headline — texture totals, never a ranking */}
      {hasData && (
        <Reveal delay={0.1}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Active members" value={`${totals.active}/${members.length}`}
              sublabel="contributed in this window"
              accent="var(--chart-1)" icon={<Activity size={14} />}
            />
            <StatCard
              label="Features shipped" value={totals.shipped.toLocaleString()}
              sublabel="merged across the team"
              accent="var(--chart-1)" icon={<GitMerge size={14} />}
            />
            <StatCard
              label="Reviews done" value={totals.reviews.toLocaleString()}
              sublabel="code reviews given"
              accent="var(--chart-2)" icon={<Eye size={14} />}
            />
            <StatCard
              label="Widest ownership" value={totals.areas.toLocaleString()}
              sublabel="most areas owned by one person"
              accent="var(--chart-5)" icon={<Layers size={14} />}
            />
          </div>
        </Reveal>
      )}

      {/* Loading skeleton */}
      {loading && !members.length && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] p-5 h-44 animate-pulse bg-[var(--bg-surface)] border border-[var(--border)]"
            />
          ))}
        </div>
      )}

      {/* Cards */}
      {hasData && (
        <Reveal delay={0.12}>
          <section>
            <SectionHeader
              icon={<Users size={15} />} accent="var(--brand-indigo)"
              title="Across the team"
              subtitle="Each person as a multi-dimension card — never reduced to one number."
            />
            <RevealList className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" staggerDelay={0.04}>
              {members.map(m => (
                <InvolvementCard key={m.userId ?? m.email} member={m} maxes={maxes} />
              ))}
            </RevealList>
          </section>
        </Reveal>
      )}

      {/* Empty */}
      {!loading && !error && members.length === 0 && (
        <Card padding="xl" className="border-dashed text-center">
          <div className="w-12 h-12 rounded-[var(--radius-card)] flex items-center justify-center mx-auto mb-4 bg-[var(--brand-indigo)]/[0.06] border border-[var(--brand-indigo)]/15">
            <Users size={22} className="text-[var(--brand-indigo)]" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-1">No involvement data yet</h3>
          <p className="text-xs text-[var(--text-faint)] max-w-xs mx-auto">
            Sync a repository to derive feature shipping and review activity across your team.
          </p>
        </Card>
      )}
    </div>
  )
}
