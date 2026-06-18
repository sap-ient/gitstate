/**
 * Theme system — dark | light | system
 * Persists to localStorage. Applies class to <html>.
 * Default: dark.
 *
 * Usage:
 *   import { ThemeProvider, useTheme } from './lib/theme.jsx'
 *   const { theme, setTheme, resolved } = useTheme()
 *   // theme: 'dark' | 'light' | 'system'
 *   // resolved: 'dark' | 'light'  (what's actually rendered)
 */
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeCtx = createContext(null)

const STORAGE_KEY = 'gs-theme'

function getStored() {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

function applyTheme(resolved) {
  const html = document.documentElement
  if (resolved === 'light') {
    html.classList.add('light')
    html.style.colorScheme = 'light'
  } else {
    html.classList.remove('light')
    html.style.colorScheme = 'dark'
  }
}

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return theme
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const stored = getStored()
    return stored === 'light' || stored === 'system' ? stored : 'dark'
  })

  const resolved = resolveTheme(theme)

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  // Watch system preference changes when in 'system' mode
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => applyTheme(resolveTheme('system'))
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function setTheme(next) {
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
    setThemeState(next)
  }

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeCtx)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
