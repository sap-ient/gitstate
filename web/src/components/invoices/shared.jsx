/**
 * Shared invoicing primitives — status badge, spinner, evidence chips, money fmt.
 * Theme-aware (uses --bg/--text/--border tokens), currency-aware via useCurrency.
 */
import { Loader2, GitMerge, GitCommit, FolderGit2, Calendar, GitBranch, Receipt } from 'lucide-react'
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
      {evidence.map((e, i) => {
        // Tolerate both the rich shape ({prTitle, sha, mergedAt}) and the
        // contract's minimal shape ({type, ref, repo}).
        const label = e.prTitle || e.title || e.ref || (e.type ? e.type : 'Merged work')
        const sha = e.sha || (e.type === 'commit' ? e.ref : null)
        return (
        <div
          key={i}
          className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-badge)]"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
        >
          <GitMerge size={13} className="shrink-0" style={{ color: 'var(--brand-teal)' }} />
          <span className="flex-1 min-w-0 truncate text-xs text-[var(--text-dim)]">
            {label}
          </span>
          {e.repo && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] shrink-0">
              <FolderGit2 size={11} />{e.repo}
            </span>
          )}
          {sha && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'rgba(45,212,191,0.1)', color: '#0d9488', border: '1px solid rgba(45,212,191,0.22)' }}
            >
              <GitCommit size={10} />{sha.slice(0, 7)}
            </span>
          )}
          {e.mergedAt && (
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-[var(--text-faint)] shrink-0">
              <Calendar size={10} />{fmtDate(e.mergedAt)}
            </span>
          )}
        </div>
        )
      })}
    </div>
  )
}

// ── Git-line badge ───────────────────────────────────────────────────────────────

/** Small "git" badge that marks a line as git-derived. */
export function GitBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
      style={{ background: 'rgba(45,212,191,0.12)', color: 'var(--brand-teal)', border: '1px solid rgba(45,212,191,0.28)' }}
      title="Derived from merged git work"
    >
      <GitBranch size={9} /> git
    </span>
  )
}

// ── Accounting provider brand marks + metadata ───────────────────────────────────
//
// Inline SVGs (no extra deps) for the five supported providers. PROVIDER_META is
// the single source of truth used by both the editor and the detail view.

function XeroMark({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#13B5EA" />
      <path d="M8.6 12l-1.9-1.9a.7.7 0 1 1 1-1l1.9 1.9 1.9-1.9a.7.7 0 0 1 1 1L10.6 12l1.9 1.9a.7.7 0 0 1-1 1l-1.9-1.9-1.9 1.9a.7.7 0 1 1-1-1L8.6 12z" fill="#fff" />
      <circle cx="15.4" cy="12" r="1.15" fill="#fff" />
    </svg>
  )
}
function QuickBooksMark({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#2CA01C" />
      <path d="M12 5.5a6.5 6.5 0 0 0-1 12.92V11.7a1.5 1.5 0 0 1 1.5-1.5h.6V6.6h-.6A1.1 1.1 0 0 0 12 5.5z" fill="#fff" opacity=".45" />
      <path d="M13 5.58V12.3a1.5 1.5 0 0 1-1.5 1.5h-.6v3.6h.6A1.1 1.1 0 0 0 13 18.5 6.5 6.5 0 0 0 13 5.58z" fill="#fff" />
    </svg>
  )
}
function SageMark({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#00D639" />
      <path d="M15.5 8.6c-1-.7-2.3-1.1-3.6-1.1-2.8 0-4.7 1.6-4.7 3.6 0 1.7 1.3 2.6 3.4 3 1.6.3 2.1.6 2.1 1.2 0 .6-.7 1-1.7 1-1.2 0-2.4-.5-3.3-1.2l-.001 2c1 .6 2.2.9 3.4.9 2.9 0 4.8-1.5 4.8-3.7 0-1.8-1.4-2.6-3.5-3-1.5-.3-2-.6-2-1.1 0-.5.6-.9 1.6-.9 1 0 2.1.4 3 1z" fill="#fff" />
    </svg>
  )
}
function ZohoMark({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#E42527" />
      <path d="M7 9h6l-4.2 6H13v1.6H6.4l4.2-6H7V9z" fill="#fff" />
    </svg>
  )
}
function FreshBooksMark({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#0E80CD" />
      <path d="M9 7.5h6V9.4h-4v2.1h3.5v1.9H11v3.6H9V7.5z" fill="#fff" />
    </svg>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const PROVIDER_META = {
  xero:        { label: 'Xero',        Mark: XeroMark,        accent: '#13B5EA' },
  quickbooks:  { label: 'QuickBooks',  Mark: QuickBooksMark,  accent: '#2CA01C' },
  sage:        { label: 'Sage',        Mark: SageMark,        accent: '#00B23A' },
  zoho_books:  { label: 'Zoho Books',  Mark: ZohoMark,        accent: '#E42527' },
  freshbooks:  { label: 'FreshBooks',  Mark: FreshBooksMark,  accent: '#0E80CD' },
}

/** Resolve provider meta with a graceful fallback so unknown providers still render. */
// eslint-disable-next-line react-refresh/only-export-components
export function providerMeta(provider) {
  return (
    PROVIDER_META[provider] ?? {
      label: String(provider || 'Accounting').replace(/_/g, ' '),
      Mark: ({ size = 15 }) => <Receipt size={size} />,
      accent: 'var(--brand-teal)',
    }
  )
}

