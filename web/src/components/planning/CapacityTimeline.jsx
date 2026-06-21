/**
 * CapacityTimeline — responsive SVG of effective person-days per upcoming week.
 *
 * Each week is a stacked bar against the team's total *available* person-days:
 *   • the solid base is *effective* capacity (available − approved leave),
 *     coloured by health — healthy weeks use the teal/indigo brand, weeks that
 *     lose a meaningful slice to leave shade toward `--warn`, and weeks the
 *     backend flags `understaffed` (leave-heavy) are flagged `--bad`;
 *   • the muted cap on top is the *leave dip* — capacity lost to approved leave;
 *   • a dashed baseline marks the typical (median) effective week so dips read
 *     at a glance, and an OOO dot flags weeks with fully-out members.
 *
 * Fully fluid: the SVG is rendered at the container's measured width (via
 * ResizeObserver) so it fills the card with no fixed-width dead space — matching
 * the refreshed LineChart. Presentational only; all data wiring/props preserved.
 */
import { useMemo, useState, useRef, useLayoutEffect } from 'react'
import { CalendarClock } from 'lucide-react'

const PAD = { top: 22, right: 16, bottom: 32, left: 40 }

function fmtWeek(iso) {
  // iso = YYYY-MM-DD → "Jun 23"
  const d = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function median(xs) {
  const v = xs.filter(n => n > 0).sort((a, b) => a - b)
  if (!v.length) return 0
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2
}

// Per-week health → semantic colour for the effective-capacity body.
//   understaffed (backend flag)            → --bad
//   ≥ ~18% of capacity lost to leave        → --warn
//   otherwise                               → brand gradient (healthy)
function weekTone(w) {
  if (w.understaffed) return 'bad'
  const avail = w.availableDays ?? 0
  const leave = w.leaveDays ?? 0
  if (avail > 0 && leave / avail >= 0.18) return 'warn'
  return 'ok'
}

const TONE_FILL = {
  ok: 'url(#capFillHealthy)',
  warn: 'var(--warn)',
  bad: 'var(--bad)',
}

export function CapacityTimeline({ weeks = [], height = 248 }) {
  const [hover, setHover] = useState(null)

  // Responsive width — render at the container's actual width so the chart fills
  // the card (no fixed viewBox dead space). `cw` falls back to a sane default.
  const wrapRef = useRef(null)
  const [cw, setCw] = useState(720)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width)
      if (w > 0) setCw(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view = useMemo(() => {
    const maxAvail = Math.max(1, ...weeks.map(w => w.availableDays ?? 0))
    const med = median(weeks.map(w => w.effectiveDays ?? 0))
    const flagged = weeks.filter(w => weekTone(w) !== 'ok').length
    return { maxAvail, med, flagged }
  }, [weeks])

  // Empty state — tasteful dashed well, matches LineChart's empty treatment.
  if (!weeks.length) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] text-center"
        style={{ height, background: 'var(--bg-surface2)' }}
      >
        <CalendarClock size={22} className="text-[var(--text-faint)]" />
        <p className="text-sm text-[var(--text)]">No upcoming capacity to chart</p>
        <p className="text-xs text-[var(--text-faint)] max-w-[70%]">
          Set member availability and approve leave to build a weekly capacity timeline.
        </p>
      </div>
    )
  }

  const W = cw
  const H = height
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const slot = plotW / weeks.length
  const barW = Math.min(46, Math.max(10, slot * 0.62))
  const baseY = PAD.top + plotH

  const yFor = v => PAD.top + plotH - (v / view.maxAvail) * plotH
  const ticks = 4
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (view.maxAvail / ticks) * i)
  const medianY = yFor(view.med)

  const hw = hover != null ? weeks[hover] : null

  return (
    <div className="w-full">
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          className="select-none"
          style={{ display: 'block' }}
          role="img"
          aria-label="Weekly capacity timeline"
        >
          <defs>
            <linearGradient id="capFillHealthy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity="0.78" />
            </linearGradient>
          </defs>

          {/* Y gridlines + ticks — LineChart chrome (solid baseline, dashed rest) */}
          {tickVals.map((tv, i) => {
            const y = yFor(tv)
            return (
              <g key={i}>
                <line
                  x1={PAD.left} y1={y.toFixed(1)} x2={W - PAD.right} y2={y.toFixed(1)}
                  stroke="var(--chart-grid)" strokeWidth="1" shapeRendering="crispEdges"
                  strokeDasharray={i === 0 ? undefined : '2 4'}
                />
                <text
                  x={PAD.left - 9} y={y.toFixed(1)} textAnchor="end" dominantBaseline="middle"
                  fontSize="10" className="font-mono" fill="var(--chart-axis)"
                >
                  {Math.round(tv)}
                </text>
              </g>
            )
          })}

          {/* Typical (median) baseline — label tucked at the left over a small
              surface chip so it never collides with the rightmost bar. */}
          {view.med > 0 && (
            <g>
              <line
                x1={PAD.left} y1={medianY.toFixed(1)} x2={W - PAD.right} y2={medianY.toFixed(1)}
                stroke="var(--chart-1)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6"
              />
              <rect
                x={PAD.left + 4} y={(medianY - 14).toFixed(1)} width="86" height="13" rx="3"
                fill="var(--bg-surface)" opacity="0.92"
              />
              <text
                x={PAD.left + 8} y={(medianY - 4).toFixed(1)} textAnchor="start"
                fontSize="9.5" className="font-mono" fill="var(--chart-1)"
              >
                typical {view.med.toFixed(1)}d
              </text>
            </g>
          )}

          {/* Bars */}
          {weeks.map((w, i) => {
            const cx = PAD.left + slot * i + slot / 2
            const x = cx - barW / 2
            const avail = w.availableDays ?? 0
            const eff = w.effectiveDays ?? 0
            const tone = weekTone(w)
            const yAvail = yFor(avail)
            const yEff = yFor(eff)
            const isHover = hover === i
            const hasLeave = avail - eff > 0.05
            return (
              <g
                key={w.weekStart ?? i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* full-slot hit area */}
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={plotH} fill="transparent" />

                {/* hover wash behind the active bar */}
                {isHover && (
                  <rect
                    x={cx - slot / 2 + 1} y={PAD.top} width={slot - 2} height={plotH}
                    fill="var(--text-faint)" opacity="0.06" rx="6"
                  />
                )}

                {/* track — full available capacity (faint inset) */}
                <rect
                  x={x} y={yAvail.toFixed(1)} width={barW} height={Math.max(0, baseY - yAvail).toFixed(1)}
                  fill="var(--bg-surface3)" opacity="0.5" rx="3"
                />

                {/* leave dip — capacity lost to approved leave, sits on top */}
                {hasLeave && (
                  <rect
                    x={x} y={yAvail.toFixed(1)} width={barW} height={Math.max(0, yEff - yAvail).toFixed(1)}
                    fill="var(--warn)" opacity={tone === 'warn' || tone === 'bad' ? 0.4 : 0.32} rx="3"
                  />
                )}

                {/* effective capacity body — coloured by health */}
                <rect
                  x={x} y={yEff.toFixed(1)} width={barW} height={Math.max(0, baseY - yEff).toFixed(1)}
                  fill={TONE_FILL[tone]}
                  opacity={isHover ? 1 : 0.94}
                  rx="3"
                />

                {/* crisp top edge on the effective body */}
                <rect
                  x={x} y={yEff.toFixed(1)} width={barW} height="2"
                  fill={tone === 'ok' ? 'var(--chart-1)' : TONE_FILL[tone]} rx="1" opacity="0.9"
                />

                {/* x label */}
                <text
                  x={cx} y={H - PAD.bottom + 16} textAnchor="middle"
                  fontSize="9.5" className="font-mono"
                  fill={isHover ? 'var(--text-muted)' : 'var(--chart-axis)'}
                >
                  {fmtWeek(w.weekStart)}
                </text>

                {/* OOO marker */}
                {(w.oooCount ?? 0) > 0 && (
                  <circle cx={cx} cy={PAD.top - 9} r="3" fill="var(--bad)" />
                )}
              </g>
            )
          })}
        </svg>

        {/* Tooltip — anchored to the hovered week, follows the bar. */}
        {hw && (
          <div
            className="pointer-events-none absolute z-10"
            style={{
              left: `${Math.min(Math.max((PAD.left + slot * hover + slot / 2) / W * 100, 12), 88)}%`,
              top: 0,
              translate: '-50% 0',
            }}
          >
            <div className="rounded-[var(--radius-btn)] border border-[var(--border2)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-[var(--shadow-float)] whitespace-nowrap">
              <div className="font-semibold text-[var(--text)] mb-1.5">Week of {fmtWeek(hw.weekStart)}</div>
              <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums">
                <span className="text-[var(--text-faint)]">effective</span>
                <span className="text-right text-[var(--text)] font-semibold">{(hw.effectiveDays ?? 0).toFixed(1)}d</span>
                <span className="text-[var(--text-faint)]">available</span>
                <span className="text-right text-[var(--text-muted)]">{(hw.availableDays ?? 0).toFixed(1)}d</span>
                {(hw.leaveDays ?? 0) > 0.05 && (
                  <>
                    <span style={{ color: 'var(--warn)' }}>on leave</span>
                    <span className="text-right" style={{ color: 'var(--warn)' }}>−{hw.leaveDays.toFixed(1)}d</span>
                  </>
                )}
              </div>
              {((hw.oooCount ?? 0) > 0 || hw.understaffed) && (
                <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] flex flex-wrap items-center gap-2 text-[10.5px]">
                  {hw.understaffed && (
                    <span style={{ color: 'var(--bad)' }}>leave-heavy week</span>
                  )}
                  {(hw.oooCount ?? 0) > 0 && (
                    <span className="text-[var(--text-faint)]">{hw.oooCount} fully OOO</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'linear-gradient(180deg, var(--chart-1), var(--chart-2))' }} />
          effective capacity
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'var(--warn)', opacity: 0.5 }} />
          lost to leave
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-[3px]" style={{ background: 'var(--bad)' }} />
          leave-heavy week
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--bad)' }} />
          member OOO
        </span>
        {view.med > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="6" aria-hidden="true"><line x1="0" y1="3" x2="14" y2="3" stroke="var(--chart-1)" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
            typical week
          </span>
        )}
      </div>
    </div>
  )
}
