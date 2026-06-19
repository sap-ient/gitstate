/**
 * WarningsPanel — over-allocation / OOO / understaffed-week / thin-data flags
 * surfaced from the planning payload. Grouped by kind, "warn" before "info".
 */
import { AlertTriangle, Plane, CalendarX, Info, CircleSlash, ShieldCheck } from 'lucide-react'
import { Card } from '../ui/index.js'

const KIND = {
  over_allocation: { Icon: AlertTriangle, tone: 'warn', label: 'Over-allocation' },
  understaffed: { Icon: CalendarX, tone: 'warn', label: 'Understaffed week' },
  ooo: { Icon: Plane, tone: 'info', label: 'Out of office' },
  no_velocity: { Icon: CircleSlash, tone: 'warn', label: 'No velocity' },
  thin_data: { Icon: Info, tone: 'info', label: 'Thin data' },
}

const TONE = {
  warn: { border: 'border-amber-500/25', bg: 'bg-amber-500/[0.05]', icon: 'text-amber-400' },
  info: { border: 'border-[var(--border)]', bg: 'bg-[var(--bg)]', icon: 'text-[var(--text-muted)]' },
}

export function WarningsPanel({ warnings = [] }) {
  const sorted = [...warnings].sort((a, b) => {
    const order = { warn: 0, info: 1 }
    return (order[a.level] ?? 1) - (order[b.level] ?? 1)
  })

  if (!sorted.length) {
    return (
      <Card padding="md" className="flex items-center gap-3 border-emerald-500/20 bg-emerald-500/[0.04]">
        <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm text-[var(--text)] font-medium">All clear</p>
          <p className="text-xs text-[var(--text-faint)]">No over-allocation, OOO conflicts, or understaffed weeks in this horizon.</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sorted.map((wn, i) => {
        const meta = KIND[wn.kind] ?? { Icon: Info, tone: wn.level ?? 'info', label: 'Note' }
        const tone = TONE[wn.level] ?? TONE[meta.tone] ?? TONE.info
        const Icon = meta.Icon
        return (
          <div key={i} className={`flex items-start gap-2.5 rounded-[var(--radius-btn)] border px-3.5 py-2.5 ${tone.border} ${tone.bg}`}>
            <Icon size={15} className={`shrink-0 mt-0.5 ${tone.icon}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">{meta.label}</span>
                {wn.week && <span className="text-[10px] font-mono text-[var(--text-faint)]">· {wn.week}</span>}
              </div>
              <p className="text-sm text-[var(--text-dim)] leading-snug mt-0.5">{wn.message}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
