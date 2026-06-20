/**
 * Currency system — display-only USD→X conversion.
 * Real charge rate comes from backend; this is for UI display only.
 *
 * Usage:
 *   import { CurrencyProvider, useCurrency } from './lib/currency.jsx'
 *   const { currency, setCurrency, format } = useCurrency()
 *   format(9.99)  // "$9.99" | "R183.35" | "£7.84" | "€9.17"
 */
import { createContext, useContext, useState } from 'react'
import { CURRENCIES, CURRENCY_BY_CODE } from './currencyData.js'

const CurrencyCtx = createContext(null)
const STORAGE_KEY = 'gs-currency'

function getStored() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

function findCurrency(code) {
  return CURRENCY_BY_CODE[code] ?? CURRENCIES[0]
}

/**
 * Best-effort default currency from the browser locale's region.
 * e.g. "en-ZA" → ZAR, "pt-BR" → BRL. Falls back to USD when the region's
 * currency isn't in our list or can't be resolved.
 */
function detectDefaultCurrency() {
  try {
    const locales = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const loc of locales) {
      if (!loc) continue
      // Exact locale match (e.g. "en-ZA" → ZAR), then fall back to the
      // region subtag (e.g. any "*-BR" → BRL).
      const exact = CURRENCIES.find(c => c.locale.toLowerCase() === loc.toLowerCase())
      if (exact) return exact.code
      const region = loc.split('-')[1]?.toUpperCase()
      if (region) {
        const byRegion = CURRENCIES.find(c => c.locale.split('-')[1]?.toUpperCase() === region)
        if (byRegion) return byRegion.code
      }
    }
  } catch { /* ignore */ }
  return 'USD'
}

export function CurrencyProvider({ children }) {
  const [currencyCode, setCurrencyCode] = useState(() => {
    const stored = getStored()
    if (CURRENCY_BY_CODE[stored]) return stored
    return detectDefaultCurrency()
  })

  const currency = findCurrency(currencyCode)

  function setCurrency(code) {
    try { localStorage.setItem(STORAGE_KEY, code) } catch { /* ignore */ }
    setCurrencyCode(code)
  }

  /**
   * Format a USD amount in the selected currency.
   * @param {number} usdAmount
   * @param {object} [opts]  extra Intl.NumberFormat options
   */
  function format(usdAmount, opts = {}) {
    const amount = usdAmount * currency.rate
    const decimals = currency.decimals ?? 2
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      ...opts,
    }).format(amount)
  }

  return (
    <CurrencyCtx.Provider value={{ currency, currencyCode, setCurrency, format, currencies: CURRENCIES }}>
      {children}
    </CurrencyCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrency() {
  const ctx = useContext(CurrencyCtx)
  if (!ctx) throw new Error('useCurrency must be used inside CurrencyProvider')
  return ctx
}
