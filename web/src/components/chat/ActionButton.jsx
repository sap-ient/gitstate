/**
 * ActionButton — a confirmable, assistant-proposed action.
 *
 * When the stream emits an `action` event the assistant is *proposing* something
 * with side effects (upgrade plan, sync a repo, generate an invoice, exclude a
 * contributor). We NEVER auto-fire it: the human must click. On click useChat
 * calls the action's own endpoint with the user's session. For a plan_upgrade the
 * response is a Paystack checkout and the page redirects; everything else shows an
 * inline success/result and disables the button.
 */
import { Loader2, Check, AlertTriangle, Sparkles, ArrowUpRight } from 'lucide-react'

function resultSummary(type, result) {
  if (result == null) return 'Done.'
  if (typeof result === 'string') return result
  if (type === 'plan_upgrade') return 'Redirecting to secure checkout…'
  if (result.message) return result.message
  if (result.id) return `Created (${result.id}).`
  return 'Done.'
}

export function ActionButton({ part, onConfirm }) {
  const { action, status, result, error } = part
  const label = action?.label || 'Confirm'
  const isUpgrade = action?.type === 'plan_upgrade'
  const running = status === 'running'
  const done = status === 'done'
  const failed = status === 'error'

  return (
    <div className="my-2.5 rounded-[var(--radius-card)] border border-[var(--brand-teal)]/25 bg-gradient-to-br from-[var(--brand-teal)]/[0.06] to-[var(--brand-indigo)]/[0.06] p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles size={11} strokeWidth={2.5} className="text-[var(--brand-teal)]" />
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-[var(--text-faint)]">
          The assistant proposed this — you confirm
        </span>
      </div>

      {done ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--text-dim)]">
          <Check size={15} className="shrink-0 text-[var(--brand-teal)]" />
          <span>{resultSummary(action?.type, result)}</span>
        </div>
      ) : failed ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[13px] text-red-400">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{error || 'Action failed.'}</span>
          </div>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-[var(--border2)] px-3 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--brand-teal)] transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onConfirm}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-[var(--radius-btn)] bg-gradient-to-r from-[var(--brand-teal)] to-[var(--brand-indigo)] px-3.5 py-2 text-[13px] font-semibold text-[#0B1120] shadow-sm hover:opacity-90 hover:shadow-[0_0_18px_rgba(45,212,191,0.3)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
        >
          {running
            ? <Loader2 size={14} className="animate-spin" />
            : isUpgrade ? <ArrowUpRight size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={2.5} />}
          {running ? 'Working…' : label}
        </button>
      )}
    </div>
  )
}
