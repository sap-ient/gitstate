/**
 * Billing-status presentation: a status pill + a dunning banner.
 *
 * The subscription endpoint (GET /api/billing/subscription) exposes `status`
 * (active | past_due | canceled). The richer lifecycle state (suspended,
 * dunning_attempts, payment_method_on_file, next_retry_at) is NOT surfaced by
 * any GET endpoint today, so we derive the UI from `status` alone and degrade
 * gracefully — `suspended` is supported here for when the endpoint grows.
 */

const STATUS_META = {
  active:    { label: 'Active',    color: 'teal',  dot: '#2DD4BF' },
  past_due:  { label: 'Past due',  color: 'amber', dot: '#f59e0b' },
  suspended: { label: 'Suspended', color: 'red',   dot: '#ef4444' },
  canceled:  { label: 'Canceled',  color: 'red',   dot: '#ef4444' },
  trialing:  { label: 'Trialing',  color: 'indigo', dot: '#818cf8' },
}

const PILL_STYLE = {
  teal:   { bg: 'rgba(45,212,191,0.1)',  border: 'rgba(45,212,191,0.3)',  text: '#2DD4BF' },
  amber:  { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#fbbf24' },
  red:    { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.32)',  text: '#f87171' },
  indigo: { bg: 'rgba(99,102,241,0.12)', border: 'rgba(99,102,241,0.32)', text: '#a5b4fc' },
}

export function StatusPill({ status }) {
  const meta = STATUS_META[status] ?? { label: status ?? 'Free', color: 'indigo', dot: '#818cf8' }
  const s = PILL_STYLE[meta.color]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: meta.dot, boxShadow: `0 0 6px ${meta.dot}` }}
      />
      {meta.label}
    </span>
  )
}

/**
 * DunningBanner — shown only for past_due / suspended. Prominent, with an
 * "update payment" CTA. `onUpdate` opens the Paystack flow; `deadline` is an
 * optional formatted date string for the suspension warning.
 */
export function DunningBanner({ status, deadline, onUpdate, busy }) {
  if (status !== 'past_due' && status !== 'suspended') return null

  const suspended = status === 'suspended'
  const tone = suspended
    ? { bg: 'rgba(239,68,68,0.07)', border: 'rgba(239,68,68,0.28)', icon: '#f87171', head: '#fca5a5' }
    : { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.28)', icon: '#f59e0b', head: '#fbbf24' }

  return (
    <div
      className="rounded-[var(--radius-card)] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
      style={{ background: tone.bg, border: `1px solid ${tone.border}` }}
    >
      <div className="flex items-start gap-3 flex-1">
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke={tone.icon} strokeWidth="2" className="shrink-0 mt-0.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
        <div>
          <p className="text-sm font-semibold mb-0.5" style={{ color: tone.head }}>
            {suspended ? 'Subscription suspended — payment overdue' : 'Payment failed — we’re retrying your card'}
          </p>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            {suspended ? (
              <>Your workspace is limited until billing is resolved. Update your card to restore full access.</>
            ) : (
              <>
                We couldn’t charge your card on file. Update your payment method to avoid suspension
                {deadline ? <> on <strong className="text-[var(--text)]">{deadline}</strong></> : null}.
              </>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={onUpdate}
        disabled={busy}
        className="shrink-0 self-start sm:self-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[var(--radius-btn)] text-xs font-semibold text-white transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}
      >
        {busy ? 'Opening…' : 'Update payment method'}
      </button>
    </div>
  )
}
