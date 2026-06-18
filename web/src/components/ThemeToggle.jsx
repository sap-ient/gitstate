/**
 * ThemeToggle — dark / light / system selector.
 * Compact pill with three icons; active mode is highlighted.
 *
 * Usage:
 *   <ThemeToggle />
 */
import { useTheme } from '../lib/theme.jsx'

const options = [
  {
    value: 'dark',
    label: 'Dark',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'System',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
    ),
  },
  {
    value: 'light',
    label: 'Light',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="5"/>
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" fill="none"/>
      </svg>
    ),
  },
]

export function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-surface3)] border border-[var(--border)] ${className}`}
    >
      {options.map(opt => {
        const active = theme === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => setTheme(opt.value)}
            title={opt.label}
            className={[
              'flex items-center justify-center w-7 h-6 rounded-md transition-all duration-150 cursor-pointer',
              active
                ? 'bg-[var(--bg-surface)] text-[var(--brand-teal)] shadow-sm'
                : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]',
            ].join(' ')}
          >
            {opt.icon}
          </button>
        )
      })}
    </div>
  )
}
