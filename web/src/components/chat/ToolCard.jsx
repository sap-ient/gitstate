/**
 * ToolCard — a compact, Claude-Code-style card for a single tool invocation
 * inside an assistant turn. Shows the tool name + a spinner while running, then
 * collapses to a one-line summary that expands to the raw args/result JSON.
 */
import { useState } from 'react'
import { Loader2, Check, AlertTriangle, Wrench, ChevronRight } from 'lucide-react'

function pretty(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

/** One-line summary of a tool result for the collapsed header. */
function summarize(result) {
  if (result == null) return ''
  if (typeof result === 'string') return result.length > 60 ? result.slice(0, 60) + '…' : result
  if (Array.isArray(result)) return `${result.length} item${result.length === 1 ? '' : 's'}`
  if (typeof result === 'object') {
    const keys = Object.keys(result)
    return keys.length ? `{ ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''} }` : '{}'
  }
  return String(result)
}

export function ToolCard({ part }) {
  const { name, args, status, result, error } = part
  const [open, setOpen] = useState(false)
  const running = status === 'running'
  const failed = status === 'error'

  const hasDetail = args != null || result != null || error != null

  return (
    <div className="my-2 rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--bg-surface)]/70 overflow-hidden">
      <button
        type="button"
        onClick={() => hasDetail && setOpen(v => !v)}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${hasDetail ? 'cursor-pointer hover:bg-[var(--bg-surface2)]/60' : 'cursor-default'} transition-colors`}
      >
        <span className="shrink-0 text-[var(--text-faint)]">
          {running ? <Loader2 size={13} className="animate-spin text-[var(--brand-teal)]" />
            : failed ? <AlertTriangle size={13} className="text-red-400" />
            : <Wrench size={12} />}
        </span>
        <span className="font-mono text-[11.5px] text-[var(--text-dim)] truncate">
          {running ? <span className="text-[var(--text-muted)]">running </span> : null}
          <span className="font-semibold text-[var(--text)]">{name}</span>
          {!running && !failed && result != null && (
            <span className="text-[var(--text-faint)]"> · {summarize(result)}</span>
          )}
          {failed && <span className="text-red-400"> · failed</span>}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {!running && !failed && <Check size={12} className="text-[var(--brand-teal)]" />}
          {hasDetail && (
            <ChevronRight size={13} className={`text-[var(--text-faint)] transition-transform ${open ? 'rotate-90' : ''}`} />
          )}
        </span>
      </button>

      {open && hasDetail && (
        <div className="border-t border-[var(--border)] px-2.5 py-2 space-y-2">
          {args != null && (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-faint)]">args</div>
              <pre className="overflow-x-auto rounded bg-[var(--bg)] p-2 font-mono text-[10.5px] leading-snug text-[var(--text-muted)] whitespace-pre-wrap">{pretty(args)}</pre>
            </div>
          )}
          {error != null && (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-red-400">error</div>
              <pre className="overflow-x-auto rounded bg-red-500/[0.06] p-2 font-mono text-[10.5px] leading-snug text-red-300 whitespace-pre-wrap">{pretty(error)}</pre>
            </div>
          )}
          {result != null && (
            <div>
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[var(--text-faint)]">result</div>
              <pre className="overflow-x-auto rounded bg-[var(--bg)] p-2 font-mono text-[10.5px] leading-snug text-[var(--text-muted)] whitespace-pre-wrap">{pretty(result)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
