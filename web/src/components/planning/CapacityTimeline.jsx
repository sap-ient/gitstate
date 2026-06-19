/**
 * CapacityTimeline — hand-rolled SVG of effective person-days per upcoming week.
 *
 * Each week is a bar: the full height is *available* person-days; the filled
 * portion is *effective* (available − approved leave); the hatched cap is the
 * leave dip. Understaffed weeks (leave-heavy) are tinted amber. A baseline line
 * marks the median effective week so dips read at a glance.
 */
import { useMemo, useState } from 'react'

const PAD = { top: 18, right: 14, bottom: 30, left: 36 }

function fmtWeek(iso) {
  // iso = YYYY-MM-DD → "Jun 23"
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function CapacityTimeline({ weeks = [], height = 220 }) {
  const [hover, setHover] = useState(null)

  const view = useMemo(() => {
    const n = weeks.length
    const maxAvail = Math.max(1, ...weeks.map(w => w.availableDays ?? 0))
    const effs = weeks.map(w => w.effectiveDays ?? 0).filter(v => v > 0).sort((a, b) => a - b)
    const median = effs.length
      ? (effs.length % 2 ? effs[(effs.length - 1) / 2] : (effs[effs.length / 2 - 1] + effs[effs.length / 2]) / 2)
      : 0
    return { n, maxAvail, median }
  }, [weeks])

  if (!weeks.length) return null

  const W = 640
  const H = height
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / view.n
  const barW = Math.min(40, slot * 0.6)

  const yFor = v => PAD.top + plotH - (v / view.maxAvail) * plotH
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (view.maxAvail / ticks) * i)
  const medianY = yFor(view.median)

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="overflow-visible select-none" role="img" aria-label="Weekly capacity timeline">
        <defs>
          <linearGradient id="capFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-teal)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--brand-indigo)" stopOpacity="0.65" />
          </linearGradient>
          <pattern id="leaveHatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--text-faint)" strokeWidth="1.4" opacity="0.5" />
          </pattern>
        </defs>

        {/* gridlines + y ticks */}
        {tickVals.map((tv, i) => {
          const y = yFor(tv)
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.left - 7} y={y + 3} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-faint)">
                {Math.round(tv)}
              </text>
            </g>
          )
        })}

        {/* median baseline */}
        {view.median > 0 && (
          <g>
            <line
              x1={PAD.left} y1={medianY} x2={W - PAD.right} y2={medianY}
              stroke="var(--brand-teal)" strokeWidth="1" strokeDasharray="3 4" opacity="0.55"
            />
            <text x={W - PAD.right} y={medianY - 4} textAnchor="end" fontSize="8.5" fontFamily="var(--font-mono)" fill="var(--brand-teal)" opacity="0.8">
              typical {view.median.toFixed(1)}d
            </text>
          </g>
        )}

        {/* bars */}
        {weeks.map((w, i) => {
          const cx = PAD.left + slot * i + slot / 2
          const x = cx - barW / 2
          const avail = w.availableDays ?? 0
          const eff = w.effectiveDays ?? 0
          const yAvail = yFor(avail)
          const yEff = yFor(eff)
          const baseY = PAD.top + plotH
          const understaffed = w.understaffed
          const isHover = hover === i
          return (
            <g
              key={w.weekStart ?? i}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* hit area */}
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {/* leave dip (available → effective), hatched */}
              {avail - eff > 0.05 && (
                <rect x={x} y={yAvail} width={barW} height={Math.max(0, yEff - yAvail)} fill="url(#leaveHatch)" rx="2" />
              )}
              {/* effective fill */}
              <rect
                x={x} y={yEff} width={barW} height={Math.max(0, baseY - yEff)}
                fill={understaffed ? '#f59e0b' : 'url(#capFill)'}
                opacity={understaffed ? 0.85 : isHover ? 1 : 0.92}
                rx="2"
              />
              {/* outline of full available */}
              <rect x={x} y={yAvail} width={barW} height={Math.max(0, baseY - yAvail)} fill="none" stroke="var(--border2)" strokeWidth="1" rx="2" />
              {/* x label */}
              <text x={cx} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill={isHover ? 'var(--text)' : 'var(--text-faint)'}>
                {fmtWeek(w.weekStart)}
              </text>
              {/* OOO marker */}
              {w.oooCount > 0 && (
                <circle cx={cx} cy={PAD.top - 7} r="3.2" fill="#f59e0b" />
              )}
            </g>
          )
        })}
      </svg>

      {/* tooltip */}
      {hover != null && weeks[hover] && (
        <div className="pointer-events-none absolute -top-1 left-0 right-0 flex justify-center">
          <div className="rounded-[var(--radius-btn)] border border-[var(--border2)] bg-[var(--bg-surface2)] px-3 py-2 text-xs shadow-lg">
            <div className="font-semibold text-[var(--text)] mb-1">Week of {fmtWeek(weeks[hover].weekStart)}</div>
            <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
              <span className="text-[var(--brand-teal)]">{(weeks[hover].effectiveDays ?? 0).toFixed(1)}d effective</span>
              <span className="text-[var(--text-faint)]">{(weeks[hover].availableDays ?? 0).toFixed(1)}d available</span>
            </div>
            {(weeks[hover].leaveDays ?? 0) > 0.05 && (
              <div className="mt-0.5 text-[11px] text-amber-400 font-mono">−{weeks[hover].leaveDays.toFixed(1)}d leave · {weeks[hover].oooCount} OOO</div>
            )}
            {weeks[hover].understaffed && (
              <div className="mt-0.5 text-[11px] text-amber-400">leave-heavy week</div>
            )}
          </div>
        </div>
      )}

      {/* legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-faint)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'linear-gradient(var(--brand-teal), var(--brand-indigo))' }} /> effective person-days
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px] border border-[var(--border2)]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, var(--text-faint) 0 1.4px, transparent 1.4px 5px)' }} /> leave dip
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px] bg-amber-500" /> understaffed week
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-amber-500" /> OOO member
        </span>
      </div>
    </div>
  )
}
