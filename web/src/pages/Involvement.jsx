/**
 * Involvement page — /involvement
 * Renders each person as a multi-dimension card.
 * Explicitly NOT a ranked leaderboard. NOT a single score.
 * Caption: "involvement across dimensions — not a productivity score."
 *
 * Data from GET /api/metrics/involvement?project=&period=
 */
import { useState } from 'react'
import { useInvolvement } from '../lib/useInvolvement.js'
import { useProjects } from '../lib/useProjects.js'
import { Card, Badge, Button } from '../components/ui/index.js'

function Spinner() {
  return (
    <svg className="animate-spin shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
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

function DimBar({ label, value, max, color, icon }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-[var(--text-faint)] w-28 shrink-0 flex items-center gap-1 font-mono">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-mono text-[var(--text-muted)] w-8 text-right shrink-0">{value}</span>
    </div>
  )
}

function ActivityDot({ active, lastActive }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: active ? '#22c55e' : 'var(--border2)' }}
        title={active ? 'Active recently' : 'Dormant'}
      />
      <span className="text-[10px] text-[var(--text-faint)]">
        {active ? 'active' : 'dormant'}
        {lastActive ? ` · last ${new Date(lastActive).toLocaleDateString()}` : ''}
      </span>
    </div>
  )
}

function InvolvementCard({ member, maxes }) {
  const {
    name, email,
    featuresShipped = 0,
    reviewsDone = 0,
    areasOwned = [],
    activeRecently = false,
    lastActive,
  } = member

  return (
    <Card padding="md" className="flex flex-col gap-4">
      {/* Identity row */}
      <div className="flex items-start gap-3">
        <Initials name={name} email={email} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--text)] truncate">{name ?? email}</span>
            <ActivityDot active={activeRecently} lastActive={lastActive} />
          </div>
          {name && email && (
            <span className="text-xs text-[var(--text-faint)] truncate block">{email}</span>
          )}
        </div>
      </div>

      {/* Multi-dimension bars — the "texture" view, never a single score */}
      <div className="space-y-2.5">
        <DimBar
          label="Features shipped"
          value={featuresShipped}
          max={maxes.featuresShipped}
          color="var(--brand-teal)"
          icon={
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          }
        />
        <DimBar
          label="Reviews done"
          value={reviewsDone}
          max={maxes.reviewsDone}
          color="var(--brand-indigo)"
          icon={
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          }
        />
      </div>

      {/* Areas owned */}
      {areasOwned.length > 0 && (
        <div>
          <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest mb-1.5 block font-mono">Areas owned</span>
          <div className="flex flex-wrap gap-1.5">
            {areasOwned.map(area => (
              <Badge key={area} color="indigo">{area}</Badge>
            ))}
          </div>
        </div>
      )}
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
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Involvement</h1>
        {/* Honest caption — not a score */}
        <p className="text-sm text-[var(--text-faint)] mt-1">
          Involvement across dimensions — not a productivity score.
        </p>
      </div>

      {/* Principle callout — texture, not a number */}
      <Card className="border-[var(--brand-indigo)]/15 bg-gradient-to-r from-[var(--brand-indigo)]/[0.03] to-[var(--brand-teal)]/[0.03]" padding="md">
        <div className="flex items-start gap-3">
          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="var(--brand-indigo)" strokeWidth="1.8" className="mt-0.5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            This view shows <strong className="text-[#c7d2fe]">texture across multiple dimensions</strong> — features shipped, review load, areas owned, and activity — so seniors, mentors, and reviewers are visible alongside feature authors. No single number, no ranking, no formula.
          </p>
        </div>
      </Card>

      {/* Filters */}
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
            className="bg-[var(--bg)] text-xs text-[var(--text-muted)] rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors"
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
          leftIcon={loading ? <Spinner /> : (
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
        >
          Refresh
        </Button>

        {!loading && members.length > 0 && (
          <span className="text-xs text-[var(--text-faint)] font-mono ml-auto">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/[0.04]">
          <p className="text-sm text-red-400">{error} — the backend may not be running yet.</p>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !members.length && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-card)] p-5 h-40 animate-pulse bg-[var(--bg-surface)] border border-[var(--border)]"
            />
          ))}
        </div>
      )}

      {/* Cards */}
      {!loading && members.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {members.map(m => (
            <InvolvementCard key={m.userId ?? m.email} member={m} maxes={maxes} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && members.length === 0 && (
        <Card padding="xl" className="border-dashed text-center">
          <div className="w-12 h-12 rounded-[var(--radius-card)] flex items-center justify-center mx-auto mb-4 bg-[var(--brand-indigo)]/[0.06] border border-[var(--brand-indigo)]/15">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--brand-indigo)" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
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
