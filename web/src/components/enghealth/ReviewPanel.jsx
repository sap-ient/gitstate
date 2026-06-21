/**
 * ReviewPanel — review-health for Engineering Health.
 *   • median review latency (cycle_times.review_secs) — real
 *   • % merged-without-review (proxy: review_secs null/0) — marked
 *   • reviewer load distribution (reviews_done per member, from involvement)
 *
 * Hand-rolled SVG bars for reviewer load. Both themes, loading/empty states.
 */
import { useMemo } from 'react'
import { Card } from '../ui/index.js'
import { Eye, GitPullRequest, Clock, ShieldAlert, Users } from 'lucide-react'
import { fmtHours, fmtPct, fmtNum, authorLabel } from './format.js'
import { Avatar, ProvenanceTag } from './shared.jsx'

function Mini({ icon, label, value, sub, accent, tag }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
          <span style={{ color: accent }}>{icon}</span>{label}
        </div>
        {tag}
      </div>
      <div className="mt-1 font-display text-xl font-semibold text-[var(--text)] tabular-nums tracking-tight">{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-faint)] mt-0.5">{sub}</div>}
    </div>
  )
}

function ReviewerLoad({ load }) {
  const sorted = useMemo(
    () => [...(load || [])].sort((a, b) => (b.reviewsDone || 0) - (a.reviewsDone || 0)),
    [load]
  )
  const max = sorted.reduce((m, r) => Math.max(m, r.reviewsDone || 0), 0) || 1
  const total = sorted.reduce((a, r) => a + (r.reviewsDone || 0), 0)

  if (!sorted.length) {
    return (
      <div className="py-8 text-center">
        <Users size={20} className="text-[var(--text-faint)] mx-auto mb-2" />
        <p className="text-sm text-[var(--text-faint)]">No reviewer activity recorded in this range.</p>
        <p className="text-[11px] text-[var(--text-faint)]/70 mt-1">Reviews are sourced from involvement texture.</p>
      </div>
    )
  }

  // Concentration: top reviewer's share — a load-imbalance signal.
  const topShare = total ? (sorted[0].reviewsDone || 0) / total : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-mono text-[var(--text-faint)]">{fmtNum(total)} reviews · {sorted.length} reviewers</span>
        {topShare >= 0.5 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--warn)]">
            <ShieldAlert size={11} /> {fmtPct(topShare)} on one reviewer
          </span>
        )}
      </div>
      <div className="space-y-2">
        {sorted.map((r, i) => {
          const name = r.name || authorLabel(r.email)
          const pct = ((r.reviewsDone || 0) / max) * 100
          return (
            <div key={r.email || name || i} className="flex items-center gap-3">
              <Avatar name={name} size={24} />
              <div className="min-w-0 w-28 sm:w-36">
                <div className="text-xs text-[var(--text-dim)] font-medium truncate">{name}</div>
              </div>
              <div className="flex-1 h-2 rounded-full bg-[var(--bg-surface3)] overflow-hidden min-w-[60px]">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,var(--chart-1),var(--chart-2))' }} />
              </div>
              <span className="font-mono tabular-nums text-xs text-[var(--text-dim)] w-8 text-right">{fmtNum(r.reviewsDone)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ReviewPanel({ review, loading }) {
  const d = review ?? {}
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
            <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-1)', background: 'color-mix(in srgb, var(--chart-1) 14%, transparent)' }}>
              <Eye size={15} />
            </span> Review health
          </h2>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">Latency, review coverage, and how review load is spread.</p>
        </div>
        {!loading && <span className="text-xs font-mono text-[var(--text-faint)]">{fmtNum(d.mergedPrs)} merged</span>}
      </div>

      {loading ? (
        <div className="h-[260px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <Mini
              icon={<Clock size={12} />} label="Median latency" accent="var(--chart-1)"
              value={fmtHours(d.medianReviewLatencyHours)} sub="open → merge"
              tag={<ProvenanceTag kind="live" note="Real: cycle_times review_secs." />}
            />
            <Mini
              icon={<ShieldAlert size={12} />} label="Merged w/o review" accent="var(--warn)"
              value={d.withoutReviewRate == null ? '—' : fmtPct(d.withoutReviewRate)}
              sub={`${fmtNum(d.mergedWithoutReview)} of ${fmtNum(d.mergedPrs)} PRs`}
              tag={<ProvenanceTag kind="proxy" note={d.withoutReviewNote || 'proxy: PRs with no recorded review window'} />}
            />
            <Mini
              icon={<GitPullRequest size={12} />} label="Reviewers" accent="var(--chart-2)"
              value={fmtNum((d.reviewerLoad || []).length)} sub="active in range"
            />
          </div>
          <div className="pt-1">
            <h3 className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)] mb-3">Reviewer load distribution</h3>
            <ReviewerLoad load={d.reviewerLoad} />
          </div>
        </>
      )}
    </Card>
  )
}
