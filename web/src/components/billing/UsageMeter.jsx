/**
 * UsageMeter — a horizontal progress meter for a billing quota.
 *
 * Premium SaaS console aesthetic: label + value on top, a subtle inset track
 * with a teal→indigo gradient fill that animates in on mount. When usage exceeds
 * the limit the fill turns amber (near cap) / red (over), and an over-limit note
 * appears. `limit == null` renders an "unmetered" meter (value only, faint full
 * track) so unlimited tiers still read cleanly.
 */
import { useEffect, useState } from 'react'

/** Map a 0–1 ratio to a fill style. Over → red, ≥0.85 → amber, else brand gradient. */
function fillFor(ratio, over) {
  if (over) return { background: 'linear-gradient(90deg,#f87171,#ef4444)', glow: 'rgba(239,68,68,0.35)' }
  if (ratio >= 0.85) return { background: 'linear-gradient(90deg,#fbbf24,#f59e0b)', glow: 'rgba(245,158,11,0.3)' }
  return { background: 'linear-gradient(90deg,#2DD4BF,#6366F1)', glow: 'rgba(99,102,241,0.28)' }
}

export function UsageMeter({
  label,
  valueText,            // formatted "current" (e.g. "7" or "$3.40")
  limitText,            // formatted "limit" (e.g. "10" or "$5.00 included") — optional
  ratio,                // 0..1 fill ratio; null/undefined → unmetered
  over = false,         // hard over-limit flag (forces red + note)
  overText,             // custom over-limit note
  hint,                 // subtle helper line under the meter
  icon,
}) {
  const metered = ratio != null && Number.isFinite(ratio)
  const clamped = metered ? Math.max(0, Math.min(1, ratio)) : 0
  const pct = Math.round(clamped * 100)
  const fill = fillFor(clamped, over)

  // Animate the fill from 0 → target on mount.
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(metered ? pct : 100))
    return () => cancelAnimationFrame(id)
  }, [pct, metered])

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">
          {icon && <span className="shrink-0 text-[var(--text-faint)]">{icon}</span>}
          {label}
        </span>
        <span className="font-mono text-sm tabular-nums text-[var(--text)]">
          <span className="font-semibold">{valueText}</span>
          {limitText != null && (
            <span className="text-[var(--text-faint)]"> / {limitText}</span>
          )}
        </span>
      </div>

      <div
        className="relative h-2.5 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-surface3)', border: '1px solid var(--border)' }}
        role="progressbar"
        aria-valuenow={metered ? pct : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {metered ? (
          <div
            className="h-full rounded-full"
            style={{
              width: `${w}%`,
              background: fill.background,
              boxShadow: `0 0 12px ${fill.glow}`,
              transition: 'width 900ms cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        ) : (
          <div
            className="h-full rounded-full opacity-40"
            style={{ width: '100%', background: 'linear-gradient(90deg,#2DD4BF,#6366F1)' }}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-3 min-h-[14px]">
        {hint ? <p className="text-[11px] text-[var(--text-faint)]">{hint}</p> : <span />}
        {over && (
          <p className="text-[11px] font-semibold text-red-400">
            {overText ?? 'Over included allowance'}
          </p>
        )}
        {!over && metered && !hint && (
          <p className="text-[11px] text-[var(--text-faint)] tabular-nums">{pct}% used</p>
        )}
      </div>
    </div>
  )
}
