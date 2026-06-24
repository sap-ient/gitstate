/**
 * ModelSelector — the model picker in the chat header.
 *
 * Lists the managed-AI catalogue grouped by provider, each row showing the
 * provider brand mark, the display name, and a tiny per-million price hint. The
 * chosen model id is lifted to useChat (which persists it to localStorage and
 * passes it to /api/chat). Closes on outside-click / Escape.
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { PROVIDER_META, ProviderMark } from '../pricing/ProviderLogos.jsx'

const PROVIDER_ORDER = ['anthropic', 'openai', 'google']

/** "$3.15/M in" — our input rate, the number the customer actually pays. */
function priceHint(m) {
  const inRate = m.ourInputUsdPerMTok ?? m.inputUsdPerMTok
  if (inRate == null) return null
  const n = inRate >= 10 ? inRate.toFixed(0) : inRate.toFixed(2)
  return `$${n}/M in`
}

function groupByProvider(models) {
  const groups = {}
  for (const m of models) (groups[m.provider] ??= []).push(m)
  const ordered = []
  for (const p of PROVIDER_ORDER) if (groups[p]) ordered.push([p, groups[p]])
  for (const [p, list] of Object.entries(groups)) if (!PROVIDER_ORDER.includes(p)) ordered.push([p, list])
  return ordered
}

export function ModelSelector({ models, modelId, selectedModel, onChoose, disabled }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (!models?.length) {
    return (
      <span className="text-[11px] font-mono text-[var(--text-faint)]">no models</span>
    )
  }

  const label = selectedModel?.displayName ?? 'Select model'
  const provider = selectedModel?.provider

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface2)] px-2 py-1 text-[12px] text-[var(--text-dim)] hover:border-[var(--border2)] hover:text-[var(--text)] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)]"
      >
        {provider && <ProviderMark provider={provider} size={13} />}
        <span className="max-w-[120px] truncate font-medium">{label}</span>
        <ChevronDown size={13} strokeWidth={2} className={`text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-30 mt-1.5 w-[268px] max-h-[60vh] overflow-y-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-xl shadow-black/30 p-1"
        >
          {groupByProvider(models).map(([prov, list]) => {
            const meta = PROVIDER_META[prov]
            return (
              <div key={prov} className="mb-1 last:mb-0">
                <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-1">
                  <ProviderMark provider={prov} size={12} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
                    {meta?.label ?? prov}
                  </span>
                </div>
                {list.map(m => {
                  const active = m.id === modelId
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => { onChoose(m.id); setOpen(false) }}
                      className={`group flex w-full items-center gap-2 rounded-[var(--radius-badge)] px-2 py-1.5 text-left transition-colors ${active ? 'bg-[var(--brand-indigo)]/10' : 'hover:bg-[var(--bg-surface2)]'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-[var(--text)]">{m.displayName}</span>
                        <span className="block text-[10.5px] text-[var(--text-faint)] font-mono">{priceHint(m)}</span>
                      </span>
                      {active && <Check size={13} className="shrink-0 text-[var(--brand-teal)]" />}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
