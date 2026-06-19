/**
 * BacklogVsCapacity — "what fits": effective person-days over the horizon vs the
 * sized remaining backlog, with the share that realistically lands.
 */
import { Layers, Users, PieChart } from 'lucide-react'
import { Card } from '../ui/index.js'

function Bar({ label, value, max, color, Icon }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
          <Icon size={12} /> {label}
        </span>
        <span className="font-mono tabular-nums text-[var(--text)]">{Math.round(value)}d</span>
      </div>
      <div className="h-2.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

export function BacklogVsCapacity({ whatFits }) {
  const wf = whatFits ?? {}
  const max = Math.max(1, wf.capacityDays ?? 0, wf.backlogDays ?? 0)
  const fitsPct = Math.round(wf.fitsPct ?? 0)
  const overflow = (wf.backlogDays ?? 0) - (wf.fitsDays ?? 0)

  return (
    <Card padding="md" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] flex items-center gap-1.5">
          <PieChart size={11} /> What fits in {wf.horizonWeeks ?? 0} weeks
        </span>
        <span className="text-sm font-display font-semibold gradient-text tabular-nums">{fitsPct}%</span>
      </div>

      <div className="flex flex-col gap-3">
        <Bar label="Effective capacity" value={wf.capacityDays ?? 0} max={max} color="var(--brand-teal)" Icon={Users} />
        <Bar label="Sized backlog" value={wf.backlogDays ?? 0} max={max} color="var(--brand-indigo)" Icon={Layers} />
      </div>

      <p className="text-xs text-[var(--text-muted)] leading-relaxed pt-1 border-t border-[var(--border)]">
        {(wf.backlogDays ?? 0) <= 0 ? (
          'No sized backlog to land in this window.'
        ) : overflow > 0.5 ? (
          <>
            About <span className="text-[var(--text)] font-medium">{Math.round(wf.fitsDays ?? 0)}d</span> of the{' '}
            <span className="text-[var(--text)] font-medium">{Math.round(wf.backlogDays ?? 0)}d</span> backlog realistically lands —{' '}
            <span className="text-amber-400 font-medium">~{Math.round(overflow)}d spills past the horizon.</span>
          </>
        ) : (
          <>The full backlog fits inside the {wf.horizonWeeks ?? 0}-week capacity window with room to spare.</>
        )}
        {(wf.understaffedWeeks ?? 0) > 0 && (
          <> <span className="text-amber-400">{wf.understaffedWeeks} leave-heavy week{wf.understaffedWeeks === 1 ? '' : 's'}</span> drag the total down.</>
        )}
      </p>
    </Card>
  )
}
