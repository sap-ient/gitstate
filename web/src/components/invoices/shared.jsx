/**
 * Shared invoicing primitives — status badge, spinner, evidence chips, money fmt.
 * Theme-aware (uses --bg/--text/--border tokens), currency-aware via useCurrency.
 */
import { Loader2, GitMerge, GitCommit, FolderGit2, Calendar } from 'lucide-react'
import { fmtDate } from './format.js'

// ── Status badge ────────────────────────────────────────────────────────────────

const STATUS = {
  draft: { color: 'var(--text-faint)', label: 'Draft' },
  sent:  { color: 'var(--info)',       label: 'Sent' },
  paid:  { color: 'var(--ok)',         label: 'Paid' },
  void:  { color: 'var(--bad)',        label: 'Void' },
}

export function InvoiceStatusBadge({ status }) {
  const s = STATUS[String(status).toLowerCase()] ?? STATUS.draft
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
      style={{
        background: `color-mix(in srgb, ${s.color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${s.color} 30%, transparent)`,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  )
}

// ── Spinner ─────────────────────────────────────────────────────────────────────

export function Spinner({ size = 18 }) {
  return <Loader2 size={size} className="animate-spin" style={{ color: 'var(--brand-teal)' }} />
}

export function LoadingCenter({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center py-16 gap-3">
      <Spinner />
      <span className="text-sm text-[var(--text-faint)]">{label}</span>
    </div>
  )
}

export function ErrorBanner({ msg }) {
  return (
    <div
      className="rounded-[var(--radius-card)] px-5 py-4 text-sm text-red-400"
      style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
    >
      {msg}
    </div>
  )
}

// ── Evidence ────────────────────────────────────────────────────────────────────

export function EvidenceList({ evidence }) {
  if (!evidence || evidence.length === 0) {
    return (
      <p className="text-[11px] text-[var(--text-faint)] italic px-1 py-2">
        No individual PRs recorded for this line.
      </p>
    )
  }
  return (
    <div className="space-y-1.5">
      {evidence.map((e, i) => (
        <div
          key={i}
          className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-badge)]"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <GitMerge size={13} className="shrink-0" style={{ color: 'var(--brand-teal)' }} />
          <span className="flex-1 min-w-0 truncate text-xs text-[var(--text-dim)]">
            {e.prTitle || 'Merged work'}
          </span>
          {e.repo && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] shrink-0">
              <FolderGit2 size={11} />{e.repo}
            </span>
          )}
          {e.sha && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'rgba(45,212,191,0.1)', color: '#0d9488', border: '1px solid rgba(45,212,191,0.22)' }}
            >
              <GitCommit size={10} />{e.sha.slice(0, 7)}
            </span>
          )}
          {e.mergedAt && (
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-[var(--text-faint)] shrink-0">
              <Calendar size={10} />{fmtDate(e.mergedAt)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

