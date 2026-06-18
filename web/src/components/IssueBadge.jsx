/**
 * IssueBadge — visual differentiator for git-derived vs native (manual) issues.
 * This is the two-truth-modes wedge made visible on every issue card.
 */

/** Small "git" badge for source=git issues. */
export function GitBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-[var(--radius-badge)] border"
      style={{ color: 'var(--brand-teal)', background: 'rgba(45,212,191,0.10)', borderColor: 'rgba(45,212,191,0.25)' }}
      title="State derived from git — merged = done, PR open = in progress"
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.6 10.59L8.38 4.8l1.69 1.7-3.77 3.77 3.77 3.77-1.69 1.7L2.6 10.59zm18.8 0l-5.78-5.79-1.69 1.7 3.77 3.77-3.77 3.77 1.69 1.7 5.78-5.79zM12.97 3L9.5 21.1l1.96.39L14.93 3.4 12.97 3z" />
      </svg>
      git
    </span>
  )
}

/** Small "manual" badge for source=native issues. */
export function NativeBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-[var(--radius-badge)] border"
      style={{ color: 'var(--text-muted)', background: 'var(--bg-surface3)', borderColor: 'var(--border)' }}
      title="Tracked manually — not derived from git"
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
      manual
    </span>
  )
}

/** State chip — colour-coded by state string. */
export function StateChip({ state, derivedState }) {
  const display = derivedState ?? state ?? 'open'

  const map = {
    open:        { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
    in_progress: { color: 'var(--brand-indigo)', bg: 'rgba(99,102,241,0.10)' },
    done:        { color: 'var(--brand-teal)', bg: 'rgba(45,212,191,0.10)' },
    closed:      { color: 'var(--text-faint)', bg: 'var(--bg-surface3)' },
    merged:      { color: 'var(--brand-teal)', bg: 'rgba(45,212,191,0.10)' },
  }

  const s = map[display] ?? map.open
  const label = display.replace('_', ' ')

  return (
    <span
      className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full capitalize"
      style={{ color: s.color, background: s.bg }}
    >
      {label}
    </span>
  )
}

/** Labels list (small pills). */
export function LabelPills({ labels }) {
  if (!labels?.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((l, i) => (
        <span
          key={i}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded-[var(--radius-badge)] border"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-surface3)', borderColor: 'var(--border)' }}
        >
          {l}
        </span>
      ))}
    </div>
  )
}
