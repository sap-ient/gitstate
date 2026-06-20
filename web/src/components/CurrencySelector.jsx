/**
 * CurrencySelector — flag + code dropdown.
 * Shows selected flag + code; expands to a scrollable, searchable list.
 *
 * Usage:
 *   <CurrencySelector />
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { useCurrency } from '../lib/currency.jsx'
import { CURRENCIES } from '../lib/currencyData.js'

export function CurrencySelector({ className = '' }) {
  const { currencyCode, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  const selected = CURRENCIES.find(c => c.code === currencyCode) ?? CURRENCIES[0]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CURRENCIES
    return CURRENCIES.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.symbol.toLowerCase().includes(q)
    )
  }, [query])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  // Focus the search input when the menu opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  function toggleOpen() {
    if (!open) setQuery('') // clear stale search each time we open
    setOpen(v => !v)
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={ref} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        onClick={toggleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface3)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border2)] transition-all duration-150 text-xs font-mono cursor-pointer"
      >
        <span className="text-base leading-none">{selected.flag}</span>
        <span>{selected.code}</span>
        <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M8 10.5L2 4.5h12L8 10.5z"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg shadow-black/30 overflow-hidden"
        >
          <div className="p-2 border-b border-[var(--border)]">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search currency…"
              aria-label="Search currency"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface3)] text-[var(--text)] placeholder:text-[var(--text-faint)] text-xs outline-none focus:border-[var(--border2)]"
            />
          </div>

          <div
            role="listbox"
            aria-label="Select currency"
            className="max-h-[280px] overflow-y-auto py-1"
          >
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-[var(--text-faint)] text-center">No matches</div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.code}
                  role="option"
                  aria-selected={c.code === currencyCode}
                  onClick={() => { setCurrency(c.code); setOpen(false) }}
                  className={[
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors duration-100 cursor-pointer text-left',
                    c.code === currencyCode
                      ? 'bg-[var(--bg-surface2)] text-[var(--brand-teal)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface2)] hover:text-[var(--text)]',
                  ].join(' ')}
                >
                  <span className="text-base leading-none">{c.flag}</span>
                  <span className="font-mono font-medium w-9 shrink-0">{c.code}</span>
                  <span className="text-[var(--text-faint)] truncate">{c.label}</span>
                  <span className="font-mono text-[var(--text-faint)] ml-auto shrink-0">{c.symbol}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
