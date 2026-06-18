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
import { CURRENCIES } from './currencyData.js'

const CurrencyCtx = createContext(null)
const STORAGE_KEY = 'gs-currency'

function getStored() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

function findCurrency(code) {
  return CURRENCIES.find(c => c.code === code) ?? CURRENCIES[0]
}

export function CurrencyProvider({ children }) {
  const [currencyCode, setCurrencyCode] = useState(() => {
    const stored = getStored()
    return CURRENCIES.find(c => c.code === stored) ? stored : 'USD'
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
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
