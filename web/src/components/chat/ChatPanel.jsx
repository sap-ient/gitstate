/**
 * ChatPanel — polished AI chat rail for the app shell.
 *
 * A conversational front-end over the NL→report endpoint. Each question is
 * sent to POST /api/reports/query; the assistant reply renders the natural
 * answer plus a collapsible result table and the SQL used (transparency).
 *
 * Theme-aware, uses design tokens. Rendered inside AppShell's right rail.
 */
import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, ArrowUp, Table2, Code2 } from 'lucide-react'
import { useChat } from '../../lib/useChat.js'

const SUGGESTIONS = [
  'Which PRs took longest to merge?',
  'Which issues have been open longest?',
  'Who reviewed the most PRs this month?',
]

function Collapsible({ icon, label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-2 rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors cursor-pointer"
      >
        {icon}
        {label}
        <span className="ml-auto">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-2.5 pb-2.5">{children}</div>}
    </div>
  )
}

function RowsTable({ rows }) {
  const cols = Object.keys(rows[0])
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-[var(--border)]">
            {cols.map(col => (
              <th key={col} className="text-left px-2 py-1.5 text-[var(--text-faint)] font-mono uppercase tracking-wider whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--border)]/60">
              {cols.map(col => (
                <td key={col} className="px-2 py-1.5 text-[var(--text-muted)] font-mono whitespace-nowrap">
                  {row[col] === null || row[col] === undefined ? '—' : String(row[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-[var(--radius-card)] rounded-br-sm px-3.5 py-2 bg-[var(--brand-indigo)]/15 border border-[var(--brand-indigo)]/25 text-sm text-[var(--text)] leading-relaxed">
        {text}
      </div>
    </div>
  )
}

function AssistantBubble({ msg }) {
  return (
    <div className="flex gap-2.5">
      <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] flex items-center justify-center">
        <Sparkles size={12} strokeWidth={2.5} className="text-white" />
      </div>
      <div className="min-w-0 flex-1">
        {msg.error ? (
          <div className="rounded-[var(--radius-badge)] px-3 py-2 text-sm text-red-400 bg-red-500/[0.06] border border-red-500/20">
            {msg.error}
          </div>
        ) : (
          <>
            {msg.text && (
              <p className="text-sm text-[var(--text-dim)] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            )}
            {Array.isArray(msg.rows) && msg.rows.length > 0 && (
              <Collapsible
                icon={<Table2 size={11} strokeWidth={2} />}
                label={`${msg.rows.length} row${msg.rows.length === 1 ? '' : 's'}`}
                defaultOpen
              >
                <RowsTable rows={msg.rows} />
              </Collapsible>
            )}
            {msg.sql && (
              <Collapsible icon={<Code2 size={11} strokeWidth={2} />} label="SQL used">
                <pre className="text-[11px] text-[var(--text-muted)] font-mono whitespace-pre-wrap leading-relaxed overflow-auto">
                  {msg.sql}
                </pre>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5" role="status" aria-label="Assistant is typing">
      <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] flex items-center justify-center">
        <Sparkles size={12} strokeWidth={2.5} className="text-white" />
      </div>
      <div className="flex items-center gap-1 h-6">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-[var(--text-faint)] animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onPick }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] flex items-center justify-center mb-4">
        <Sparkles size={20} strokeWidth={2} className="text-white" />
      </div>
      <p className="text-sm text-[var(--text-dim)] leading-relaxed max-w-[260px]">
        Ask anything about your repos — e.g. <span className="text-[var(--text)]">“which PRs took longest to merge?”</span>
      </p>
      <div className="mt-5 w-full flex flex-col gap-2">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="text-left text-[12px] text-[var(--text-muted)] hover:text-[var(--text)] rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface2)] hover:border-[var(--border2)] px-3 py-2 transition-colors cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatPanel({ onClose }) {
  const { messages, sending, send } = useChat()
  const [input, setInput] = useState('')
  const scrollRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  function submit(e) {
    e?.preventDefault()
    if (!input.trim() || sending) return
    send(input)
    setInput('')
  }

  function pick(text) {
    if (sending) return
    send(text)
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <header className="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-[var(--border)]">
        <Sparkles size={15} strokeWidth={2} className="text-[var(--brand-teal)]" aria-hidden="true" />
        <span className="text-[13px] font-semibold text-[var(--text)] tracking-tight">Ask AI</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          title="Close"
          className="ml-auto flex items-center justify-center w-7 h-7 rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-surface2)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)]"
        >
          <X size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto" aria-live="polite" aria-busy={sending}>
        {isEmpty ? (
          <EmptyState onPick={pick} />
        ) : (
          <div className="px-4 py-5 space-y-5">
            {messages.map(msg =>
              msg.role === 'user'
                ? <UserBubble key={msg.id} text={msg.text} />
                : <AssistantBubble key={msg.id} msg={msg} />
            )}
            {sending && <TypingIndicator />}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="shrink-0 p-3 border-t border-[var(--border)]">
        <div className="flex items-end gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 focus-within:border-[var(--brand-indigo)]/50 transition-colors">
          <textarea
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e)
            }}
            placeholder="Ask about your repos…"
            aria-label="Ask AI about your repos"
            className="flex-1 resize-none bg-transparent text-sm text-[var(--text)] outline-none placeholder-[var(--text-faint)] max-h-32 leading-relaxed"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]"
          >
            <ArrowUp size={15} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  )
}
