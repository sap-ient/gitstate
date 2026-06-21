/**
 * enghealth/format.js — pure formatters + tiny helpers for the Engineering
 * Health dashboard (no JSX, so HMR fast-refresh stays happy).
 */

export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString())

export function fmtPct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  const v = Number(n) * 100
  return `${v.toFixed(v < 10 ? 1 : 0)}%`
}

export function fmtHours(h) {
  if (h == null) return '—'
  const n = Number(h)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n === 0) return '0h'
  if (n < 1) return `${Math.round(n * 60)}m`
  if (n < 48) return `${n.toFixed(1)}h`
  return `${(n / 24).toFixed(1)}d`
}

/** Humanize a duration in seconds → "45s" / "30m" / "2.4h" / "1.3d". */
export function fmtSecs(s) {
  if (s == null) return '—'
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 60) return `${Math.round(n)}s`
  const m = n / 60
  if (m < 60) return `${Math.round(m)}m`
  const h = m / 60
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

export function fmtRate(n, unit) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toFixed(1)} ${unit}`.trim()
}

export function fmtDate(s, opts = { month: 'short', day: 'numeric' }) {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, opts)
}

// Short author label from an email/identity.
export function authorLabel(s = '') {
  if (!s) return 'unknown'
  const at = s.indexOf('@')
  return at > 0 ? s.slice(0, at) : s
}

// Deterministic hue for an avatar / bar tint.
export function hueFromStr(str = '') {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h % 360
}
