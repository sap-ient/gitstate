/**
 * CurrencySelector — flag + code dropdown.
 * Shows selected flag + code; expands to show all options.
 *
 * Usage:
 *   <CurrencySelector />
 */
import { useState, useRef, useEffect } from 'react'
import { useCurrency } from '../lib/currency.jsx'
import { CURRENCIES } from '../lib/currencyData.js'

export function CurrencySelector({ className = '' }) {
  const { currencyCode, setCurrency } = useCurrency()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = CURRENCIES.find(c => c.code === currencyCode) ?? CURRENCIES[0]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
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
          role="listbox"
          aria-label="Select currency"
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg shadow-black/30 overflow-hidden"
        >
          {CURRENCIES.map(c => (
            <button
              key={c.code}
              role="option"
              aria-selected={c.code === currencyCode}
              onClick={() => { setCurrency(c.code); setOpen(false) }}
              className={[
                'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors duration-100 cursor-pointer',
                c.code === currencyCode
                  ? 'bg-[var(--bg-surface2)] text-[var(--brand-teal)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface2)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <span className="text-base leading-none">{c.flag}</span>
              <span className="font-mono font-medium">{c.code}</span>
              <span className="text-[var(--text-faint)] ml-auto">{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
