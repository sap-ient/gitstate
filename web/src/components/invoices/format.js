/** Invoicing date helpers (kept in a .js module so component files stay fast-refresh clean). */

export function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function periodLabel(start, end) {
  if (!start || !end) return '—'
  return `${fmtDate(start)} – ${fmtDate(end)}`
}
