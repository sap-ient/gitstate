/**
 * enghealth/shared.jsx — reusable presentational bits for the Engineering
 * Health dashboard. Pure formatters live in ./format.js (re-exported here for
 * convenient single-import); the components below are hand-rolled, lucide-only.
 */
import { Info } from 'lucide-react'
import { hueFromStr } from './format.js'

export function Avatar({ name, size = 26 }) {
  const initials = (name || '?')
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase() || '?'
  const hue = hueFromStr(name)
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-[var(--bg)] select-none shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hue} 70% 60%), hsl(${(hue + 50) % 360} 70% 55%))`,
      }}
    >
      {initials}
    </div>
  )
}

/** A small "proxy" / "needs CI" / "live" provenance chip with a tooltip note. */
export function ProvenanceTag({ kind = 'live', note }) {
  const styles = {
    live:   'bg-[#2DD4BF]/12 text-[#2DD4BF] border-[#2DD4BF]/25',
    proxy:  'bg-yellow-500/12 text-yellow-400 border-yellow-500/30',
    needsCI:'bg-[var(--bg-surface3)] text-[var(--text-faint)] border-[var(--border)]',
  }
  const label = { live: 'live · SZZ', proxy: 'proxy', needsCI: 'needs CI' }[kind] ?? kind
  return (
    <span
      title={note || ''}
      className={[
        'inline-flex items-center gap-1 px-1.5 py-px rounded-[var(--radius-badge)]',
        'text-[9px] font-mono font-medium border uppercase tracking-wide cursor-help',
        styles[kind] ?? styles.needsCI,
      ].join(' ')}
    >
      {kind !== 'live' && <Info size={9} />}{label}
    </span>
  )
}

export function SectionHeading({ icon, children, hint }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[11px] font-mono uppercase tracking-[0.18em] text-[var(--text-faint)]">{children}</h2>
      </div>
      {hint && <span className="text-[10px] font-mono text-[var(--text-faint)]/70">{hint}</span>}
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
  )
}

/**
 * Sparkline — a compact line over `values` with an optional gradient fill.
 * values: number[]. Returns an inline SVG sized to width×height.
 */
export function Sparkline({ values = [], width = 160, height = 40, color = '#2DD4BF', fill = true }) {
  const pts = (values || []).filter(v => typeof v === 'number' && Number.isFinite(v))
  if (pts.length < 2) {
    return (
      <div className="flex items-center justify-center text-[10px] font-mono text-[var(--text-faint)]" style={{ width, height }}>
        not enough data
      </div>
    )
  }
  const max = Math.max(...pts, 0.0001)
  const min = Math.min(...pts, 0)
  const span = max - min || 1
  const pad = 3
  const xFor = (i) => pad + (i / (pts.length - 1)) * (width - pad * 2)
  const yFor = (v) => pad + (1 - (v - min) / span) * (height - pad * 2)
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(' ')
  const id = `spk-${color.replace('#', '')}`
  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {fill && (
        <path d={`${line} L ${xFor(pts.length - 1).toFixed(1)} ${height - pad} L ${xFor(0).toFixed(1)} ${height - pad} Z`} fill={`url(#${id})`} />
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
