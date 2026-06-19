/**
 * ForecastCard — "at this rate, the current backlog finishes ~<date>".
 *
 * Shows the projected completion date with an optimistic/pessimistic band, the
 * sized backlog it's based on, and the assumptions (kept honest — fallbacks are
 * labelled). Degrades gracefully when velocity is unknown.
 */
import { CalendarClock, Flag, Info, Layers } from 'lucide-react'
import { Card, Badge } from '../ui/index.js'

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function ForecastCard({ forecast, backlog, assumptions }) {
  const f = forecast ?? {}
  const b = backlog ?? {}
  const a = assumptions ?? {}

  return (
    <Card padding="lg" className="relative overflow-hidden flex flex-col gap-4">
      <div
        className="pointer-events-none absolute -top-16 -right-12 w-48 h-48 rounded-full blur-3xl opacity-20"
        style={{ background: 'radial-gradient(circle, var(--brand-indigo), transparent 70%)' }}
      />

      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
        <CalendarClock size={12} /> Forecast
      </div>

      {!f.feasible ? (
        <div className="flex flex-col gap-2 py-2">
          <span className="text-lg font-display font-semibold text-[var(--text)]">Not enough signal yet</span>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.summary}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--text-faint)]">Backlog completes around</span>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-3xl font-display font-semibold gradient-text leading-none">
                {fmtDate(f.completionDate)}
              </span>
              {f.weeksToComplete > 0 && (
                <span className="text-sm text-[var(--text-faint)] font-mono">~{f.weeksToComplete} wks</span>
              )}
            </div>
          </div>

          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.summary}</p>

          {/* confidence band */}
          {(f.optimisticDate || f.pessimisticDate) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--radius-btn)] border border-[var(--border)] px-3 py-2 bg-[var(--bg)]">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] flex items-center gap-1">
                  <Flag size={10} className="text-emerald-400" /> Optimistic
                </div>
                <div className="text-sm font-semibold text-[var(--text)] mt-0.5">{fmtDate(f.optimisticDate)}</div>
              </div>
              <div className="rounded-[var(--radius-btn)] border border-[var(--border)] px-3 py-2 bg-[var(--bg)]">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] flex items-center gap-1">
                  <Flag size={10} className="text-amber-400" /> Pessimistic
                </div>
                <div className="text-sm font-semibold text-[var(--text)] mt-0.5">{fmtDate(f.pessimisticDate)}</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* backlog basis */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <Badge color="indigo"><Layers size={10} /> {b.openCount ?? 0} open</Badge>
        <Badge>{Math.round(b.totalEffortDays ?? 0)}d effort</Badge>
        {(b.estimatedCount ?? 0) > 0 && <Badge color="teal">{b.estimatedCount} estimated</Badge>}
        {b.usedFallback && (
          <Badge color="yellow" title="Issues without an effort estimate use the median (or a flat medium) as a fallback">
            {b.unestimatedCount} fallback-sized
          </Badge>
        )}
      </div>

      {/* honest assumptions */}
      <div className="rounded-[var(--radius-btn)] bg-[var(--bg)] border border-[var(--border)] px-3 py-2.5 flex gap-2">
        <Info size={13} className="text-[var(--text-faint)] shrink-0 mt-0.5" />
        <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
          {a.notes ??
            'Velocity blends merged PRs and closed issues. Effort sized from model-judged difficulty; unestimated issues use a labelled fallback. Band is ±velocity.'}
          {a.confidenceSpread != null && (
            <> Band = ±{Math.round((a.confidenceSpread ?? 0.25) * 100)}% on the weekly rate.</>
          )}
        </p>
      </div>
    </Card>
  )
}
