/**
 * Invoices — client invoicing derived from git.
 *
 * List of invoices (number, client, period, total, status) · a "Generate from
 * git" flow (merged-PR effort → line items with evidence → draft) · an invoice
 * detail view (expandable line evidence, totals, status actions, share link).
 *
 * This is the "…and the invoice" half of the wedge: a defensible invoice
 * straight from git. Currency-aware, both themes, lucide icons.
 */
import { useState, useCallback } from 'react'
import {
  Sparkles, Users, FileText, Plus, ChevronRight, ChevronDown, ArrowLeft,
  Link2, Check, Send, CircleDollarSign, Ban, Trash2, X, GitMerge,
} from 'lucide-react'
import { useCurrency } from '../lib/currency.jsx'
import { useProjects } from '../lib/useProjects.js'
import {
  useClients, useInvoiceList, useInvoiceDetail,
  patchInvoice, deleteInvoice,
} from '../lib/useInvoices.js'
import GenerateModal from '../components/invoices/GenerateModal.jsx'
import {
  InvoiceStatusBadge, LoadingCenter, ErrorBanner, EvidenceList, Spinner,
} from '../components/invoices/shared.jsx'
import { fmtDate, periodLabel } from '../components/invoices/format.js'

// ── List row ────────────────────────────────────────────────────────────────────

function InvoiceRow({ inv, onClick }) {
  const { format } = useCurrency()
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--bg-surface-2)] transition-colors text-left group"
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--bg-surface-2)' }}>
        <FileText size={16} className="text-[var(--text-faint)] group-hover:text-[var(--brand-teal)] transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text)] truncate group-hover:text-[var(--brand-teal)] transition-colors font-mono">
          {inv.number}
        </p>
        <p className="text-xs text-[var(--text-faint)] mt-0.5 truncate">
          {inv.clientName || 'No client'} · {periodLabel(inv.periodStart, inv.periodEnd)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-[var(--text)]">{format((inv.totalCents ?? 0) / 100)}</p>
        <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{fmtDate(inv.issuedAt ?? inv.createdAt)}</p>
      </div>
      <InvoiceStatusBadge status={inv.status} />
      <ChevronRight size={15} className="text-[var(--text-faint)] shrink-0" />
    </button>
  )
}

// ── Detail view ─────────────────────────────────────────────────────────────────

const SHARE_BASE = typeof window !== 'undefined' ? window.location.origin : ''

function LineItem({ line }) {
  const { format } = useCurrency()
  const [open, setOpen] = useState(false)
  const count = line.evidence?.length ?? 0
  return (
    <div className="rounded-[var(--radius-badge)]" style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <ChevronDown size={14} className={`shrink-0 text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text)] truncate">{line.description}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-0.5 flex items-center gap-1.5">
            <GitMerge size={11} style={{ color: 'var(--brand-teal)' }} />
            {(line.effortPoints ?? 0).toFixed(1)} effort pts × {format((line.unitRateCents ?? 0) / 100)}
            {count > 0 && <span className="text-[var(--text-muted)]">· {count} PR{count !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <span className="text-sm font-bold text-[var(--text)] shrink-0">{format((line.amountCents ?? 0) / 100)}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 pl-11">
          <EvidenceList evidence={line.evidence} />
        </div>
      )}
    </div>
  )
}

function StatusAction({ icon: Icon, label, onClick, busy, tone = 'default' }) {
  const tones = {
    default: { border: 'var(--border2)', text: 'var(--text)' },
    teal: { border: 'rgba(45,212,191,0.4)', text: 'var(--brand-teal)' },
    green: { border: 'rgba(34,197,94,0.4)', text: '#22c55e' },
    red: { border: 'rgba(239,68,68,0.35)', text: '#ef4444' },
  }
  const t = tones[tone]
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-3 py-1.5 rounded-[var(--radius-btn)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 hover:brightness-110"
      style={{ border: `1px solid ${t.border}`, color: t.text, background: 'var(--bg)' }}
    >
      {busy ? <Spinner size={12} /> : <Icon size={13} />} {label}
    </button>
  )
}

function InvoiceDetail({ id, onBack, onChanged }) {
  const { invoice, loading, error, refetch } = useInvoiceDetail(id)
  const { format } = useCurrency()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [actionError, setActionError] = useState(null)

  const setStatus = useCallback(async (status) => {
    setBusy(true); setActionError(null)
    try {
      await patchInvoice(id, { status })
      await refetch()
      onChanged?.()
    } catch (e) {
      setActionError(e.message ?? 'Could not update status')
    } finally {
      setBusy(false)
    }
  }, [id, refetch, onChanged])

  const remove = useCallback(async () => {
    if (!window.confirm('Delete this invoice? This cannot be undone.')) return
    setBusy(true); setActionError(null)
    try {
      await deleteInvoice(id)
      onChanged?.()
      onBack()
    } catch (e) {
      setActionError(e.message ?? 'Could not delete')
      setBusy(false)
    }
  }, [id, onBack, onChanged])

  if (loading) return <LoadingCenter label="Loading invoice…" />
  if (error) return <ErrorBanner msg={error} />
  if (!invoice) return null

  const inv = invoice
  const lines = inv.lines ?? []
  const shareLink = inv.shareToken ? `${SHARE_BASE}/i/${inv.shareToken}` : null

  async function copyShare() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
        <ArrowLeft size={14} /> Back to invoices
      </button>

      {/* Header card */}
      <div className="rounded-[var(--radius-card)] px-6 py-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest font-semibold mb-1">Invoice</p>
            <h2 className="text-2xl font-bold text-[var(--text)] font-display font-mono">{inv.number}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1.5">
              {inv.clientName || 'No client'}
              {inv.projectName ? ` · ${inv.projectName}` : ''}
            </p>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">{periodLabel(inv.periodStart, inv.periodEnd)}</p>
          </div>
          <InvoiceStatusBadge status={inv.status} />
        </div>

        <div className="rounded-[var(--radius-badge)] p-4 flex items-end justify-between" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
          <span className="text-sm text-[var(--text-muted)]">Total due</span>
          <span className="text-2xl font-bold gradient-text">{format((inv.totalCents ?? 0) / 100)}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          {inv.status === 'draft' && <StatusAction icon={Send} label="Mark sent & share" tone="teal" busy={busy} onClick={() => setStatus('sent')} />}
          {inv.status === 'sent' && <StatusAction icon={CircleDollarSign} label="Mark paid" tone="green" busy={busy} onClick={() => setStatus('paid')} />}
          {(inv.status === 'sent' || inv.status === 'paid') && <StatusAction icon={FileText} label="Back to draft" busy={busy} onClick={() => setStatus('draft')} />}
          {inv.status !== 'void' && <StatusAction icon={Ban} label="Void" tone="red" busy={busy} onClick={() => setStatus('void')} />}
          <StatusAction icon={Trash2} label="Delete" tone="red" busy={busy} onClick={remove} />
        </div>

        {actionError && <p className="text-xs text-red-400 mt-3">{actionError}</p>}

        {/* Share link */}
        {shareLink && (
          <div className="mt-4 flex items-center gap-2 rounded-[var(--radius-badge)] px-3 py-2.5" style={{ background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.18)' }}>
            <Link2 size={14} style={{ color: 'var(--brand-teal)' }} className="shrink-0" />
            <span className="flex-1 min-w-0 truncate text-xs font-mono text-[var(--text-dim)]">{shareLink}</span>
            <button
              onClick={copyShare}
              className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors"
              style={{ background: 'rgba(45,212,191,0.12)', color: 'var(--brand-teal)' }}
            >
              {copied ? <><Check size={12} /> Copied</> : <>Copy link</>}
            </button>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="rounded-[var(--radius-card)] p-6" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Delivered work</h3>
          <span className="text-[11px] text-[var(--text-faint)] font-mono">{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
        </div>
        {lines.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)] text-center py-6">No line items on this invoice.</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, i) => <LineItem key={l.id ?? i} line={l} />)}
          </div>
        )}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-[var(--border)]">
          <span className="text-sm font-semibold text-[var(--text-muted)]">Total</span>
          <span className="text-lg font-bold text-[var(--text)]">{format((inv.totalCents ?? 0) / 100)}</span>
        </div>
      </div>

      <p className="text-[10px] text-[var(--text-faint)] flex items-center gap-1.5 px-1">
        <GitMerge size={11} style={{ color: 'var(--brand-teal)' }} />
        Every line is backed by merged pull requests — expand a line to see the git evidence.
      </p>
    </div>
  )
}

// ── Clients drawer ──────────────────────────────────────────────────────────────

function ClientsModal({ clients, onClose, createClient }) {
  const { format } = useCurrency()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [rate, setRate] = useState(150)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function add() {
    if (!name.trim()) return
    setBusy(true); setError(null)
    try {
      await createClient({ name: name.trim(), contactEmail: email.trim(), rateCents: Math.round(Number(rate) * 100) })
      setName(''); setEmail(''); setRate(150)
    } catch (e) {
      setError(e.message ?? 'Could not add client')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10 px-4" style={{ background: 'rgba(2,6,16,0.72)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-[var(--radius-card)] overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border2)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <Users size={16} style={{ color: 'var(--brand-indigo)' }} />
            <h2 className="text-sm font-semibold text-[var(--text)] font-display">Clients</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)]"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Add new */}
          <div className="rounded-[var(--radius-badge)] p-4 space-y-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">Add a client</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client name" className="w-full bg-[var(--bg-surface)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50" />
            <div className="grid grid-cols-2 gap-3">
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Billing email" className="bg-[var(--bg-surface)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50" />
              <input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Rate / pt" className="bg-[var(--bg-surface)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50" />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button onClick={add} disabled={busy || !name.trim()} className="w-full py-2 rounded-[var(--radius-btn)] text-xs font-bold text-[#04121a] disabled:opacity-40 flex items-center justify-center gap-1.5" style={{ background: 'linear-gradient(135deg, var(--brand-teal), var(--brand-indigo))' }}>
              {busy ? <Spinner size={13} /> : <Plus size={13} />} Add client
            </button>
          </div>

          {/* Existing */}
          <div className="space-y-1.5">
            {clients.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)] text-center py-3">No clients yet.</p>
            ) : clients.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-badge)]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{c.name}</p>
                  {c.contactEmail && <p className="text-[11px] text-[var(--text-faint)] truncate">{c.contactEmail}</p>}
                </div>
                <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">{format(c.rateCents / 100)}/pt</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page root ───────────────────────────────────────────────────────────────────

export default function Invoices() {
  const { invoices, loading, error, refetch } = useInvoiceList()
  const { clients, createClient, refetch: refetchClients } = useClients()
  const { projects } = useProjects()

  const [selectedId, setSelectedId] = useState(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showClients, setShowClients] = useState(false)

  if (selectedId) {
    return (
      <div className="w-full">
        <InvoiceDetail id={selectedId} onBack={() => setSelectedId(null)} onChanged={refetch} />
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text)] tracking-tight font-display">Invoices</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">Client invoices derived from merged delivery — every line backed by git.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowClients(true)}
            className="px-3.5 py-2 rounded-[var(--radius-btn)] text-xs font-semibold text-[var(--text)] border border-[var(--border2)] hover:border-[var(--brand-indigo)]/50 transition-colors flex items-center gap-1.5"
          >
            <Users size={14} /> Clients
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="px-4 py-2 rounded-[var(--radius-btn)] text-xs font-bold text-[#04121a] transition-all flex items-center gap-1.5"
            style={{ background: 'linear-gradient(135deg, var(--brand-teal), var(--brand-indigo))' }}
          >
            <Sparkles size={14} /> Generate from git
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingCenter label="Loading invoices…" />
      ) : error ? (
        <ErrorBanner msg={error} />
      ) : invoices.length === 0 ? (
        <EmptyState onGenerate={() => setShowGenerate(true)} />
      ) : (
        <div className="rounded-[var(--radius-card)] overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} onClick={() => setSelectedId(inv.id)} />
            ))}
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          clients={clients}
          projects={projects}
          onClose={() => setShowGenerate(false)}
          onCreated={(inv) => {
            setShowGenerate(false)
            refetch()
            if (inv?.id) setSelectedId(inv.id)
          }}
        />
      )}
      {showClients && (
        <ClientsModal
          clients={clients}
          createClient={async (b) => { await createClient(b); await refetchClients() }}
          onClose={() => setShowClients(false)}
        />
      )}
    </div>
  )
}

function EmptyState({ onGenerate }) {
  return (
    <div className="rounded-[var(--radius-card)] px-6 py-16 text-center" style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.12), rgba(99,102,241,0.12))' }}>
        <Sparkles size={22} style={{ color: 'var(--brand-teal)' }} />
      </div>
      <p className="text-sm font-semibold text-[var(--text)] mb-1">No invoices yet</p>
      <p className="text-xs text-[var(--text-faint)] max-w-sm mx-auto mb-5">
        Generate your first invoice straight from git: pick a client and date range, and gitstate turns merged-PR effort into priced line items with evidence.
      </p>
      <button
        onClick={onGenerate}
        className="px-4 py-2 rounded-[var(--radius-btn)] text-xs font-bold text-[#04121a] inline-flex items-center gap-1.5"
        style={{ background: 'linear-gradient(135deg, var(--brand-teal), var(--brand-indigo))' }}
      >
        <Sparkles size={14} /> Generate from git
      </button>
    </div>
  )
}
