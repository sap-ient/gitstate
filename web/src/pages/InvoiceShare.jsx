/**
 * InvoiceShare — the public, read-only, client-facing invoice (route /i/:token).
 *
 * Fetched from /api/public/invoices/{token} with NO authentication. Clean,
 * print-friendly presentation: logo, line items, git-evidence "delivered work",
 * and the total. The org is resolved server-side from the token, so only this
 * one invoice is ever exposed.
 */
import { useParams } from 'react-router-dom'
import { GitMerge, GitCommit, FolderGit2, Calendar, ShieldCheck } from 'lucide-react'
import { LogoFull } from '../components/Logo.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { CurrencySelector } from '../components/CurrencySelector.jsx'
import { usePublicInvoice } from '../lib/useInvoices.js'
import { InvoiceStatusBadge, Spinner } from '../components/invoices/shared.jsx'
import { fmtDate, periodLabel } from '../components/invoices/format.js'

function EvidenceRow({ e }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-badge)]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <GitMerge size={13} className="shrink-0" style={{ color: 'var(--brand-teal)' }} />
      <span className="flex-1 min-w-0 truncate text-xs text-[var(--text-dim)]">{e.prTitle || 'Merged work'}</span>
      {e.repo && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)] shrink-0">
          <FolderGit2 size={11} />{e.repo}
        </span>
      )}
      {e.sha && (
        <span className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: 'rgba(45,212,191,0.1)', color: '#0d9488', border: '1px solid rgba(45,212,191,0.22)' }}>
          <GitCommit size={10} />{e.sha.slice(0, 7)}
        </span>
      )}
      {e.mergedAt && (
        <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-[var(--text-faint)] shrink-0">
          <Calendar size={10} />{fmtDate(e.mergedAt)}
        </span>
      )}
    </div>
  )
}

function ShareLine({ line }) {
  const { format } = useCurrency()
  const ev = line.evidence ?? []
  return (
    <div className="rounded-[var(--radius-card)] p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">{line.description}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1 flex items-center gap-1.5">
            <GitMerge size={11} style={{ color: 'var(--brand-teal)' }} />
            {(line.effortPoints ?? 0).toFixed(1)} effort pts × {format((line.unitRateCents ?? 0) / 100)}
          </p>
        </div>
        <span className="text-base font-bold text-[var(--text)] shrink-0">{format((line.amountCents ?? 0) / 100)}</span>
      </div>
      {ev.length > 0 && (
        <div className="space-y-1.5">
          {ev.map((e, i) => <EvidenceRow key={i} e={e} />)}
        </div>
      )}
    </div>
  )
}

export default function InvoiceShare() {
  const { token } = useParams()
  const { invoice, loading, error } = usePublicInvoice(token)
  const { format } = useCurrency()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex items-center gap-3 text-sm text-[var(--text-faint)]"><Spinner /> Loading invoice…</div>
      </div>
    )
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
        <div className="text-center max-w-sm">
          <LogoFull height={32} className="mx-auto mb-6 opacity-80" />
          <p className="text-base font-semibold text-[var(--text)] mb-1">Invoice unavailable</p>
          <p className="text-sm text-[var(--text-faint)]">{error ?? 'This link is invalid or has been revoked.'}</p>
        </div>
      </div>
    )
  }

  const inv = invoice
  const lines = inv.lines ?? []

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Top bar */}
      <div className="border-b border-[var(--border)] sticky top-0 z-10 backdrop-blur-md" style={{ background: 'color-mix(in srgb, var(--bg) 80%, transparent)' }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <LogoFull height={26} />
          <CurrencySelector />
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        {/* Invoice header */}
        <div className="rounded-[var(--radius-card)] px-7 py-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest font-semibold mb-1">Invoice</p>
              <h1 className="text-3xl font-bold text-[var(--text)] font-display font-mono">{inv.number}</h1>
              {inv.clientName && <p className="text-sm text-[var(--text-muted)] mt-2">Billed to <span className="text-[var(--text)] font-medium">{inv.clientName}</span></p>}
              <p className="text-xs text-[var(--text-faint)] mt-1">Period: {periodLabel(inv.periodStart, inv.periodEnd)}</p>
              {inv.issuedAt && <p className="text-xs text-[var(--text-faint)] mt-0.5">Issued {fmtDate(inv.issuedAt)}</p>}
            </div>
            <div className="text-right">
              <InvoiceStatusBadge status={inv.status} />
              <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest font-semibold mt-4 mb-1">Total due</p>
              <p className="text-3xl font-bold gradient-text">{format((inv.totalCents ?? 0) / 100)}</p>
            </div>
          </div>
          {inv.notes && <p className="text-xs text-[var(--text-muted)] mt-5 pt-4 border-t border-[var(--border)] leading-relaxed">{inv.notes}</p>}
        </div>

        {/* Trust banner */}
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] px-5 py-3.5" style={{ background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.16)' }}>
          <ShieldCheck size={18} style={{ color: 'var(--brand-teal)' }} className="shrink-0" />
          <p className="text-xs text-[var(--text-muted)]">
            <span className="text-[var(--text)] font-semibold">Every line is backed by merged pull requests.</span> The commit and PR references below are the verifiable record of work delivered.
          </p>
        </div>

        {/* Delivered work */}
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)] mb-3 px-1">Delivered work</h2>
          {lines.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] text-center py-6">No line items on this invoice.</p>
          ) : (
            <div className="space-y-3">
              {lines.map((l, i) => <ShareLine key={l.id ?? i} line={l} />)}
            </div>
          )}
        </div>

        {/* Total */}
        <div className="rounded-[var(--radius-card)] px-7 py-5 flex items-center justify-between" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border2)' }}>
          <span className="text-sm font-semibold text-[var(--text-muted)]">Total due</span>
          <span className="text-2xl font-bold text-[var(--text)]">{format((inv.totalCents ?? 0) / 100)}</span>
        </div>

        {/* Footer */}
        <div className="text-center pt-4">
          <p className="text-[11px] text-[var(--text-faint)] flex items-center justify-center gap-1.5">
            Generated with <LogoFull height={14} className="inline-block opacity-70" /> — invoices derived from git.
          </p>
        </div>
      </div>
    </div>
  )
}
