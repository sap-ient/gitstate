/**
 * TopBar — shows current section title, live sync pill, theme toggle.
 */
import { useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle.jsx'

const TITLES = {
  '/dashboard':          'Dashboard',
  '/board':              'Board',
  '/projects':           'Projects',
  '/repos':              'Repositories',
  '/cycle-time':         'Cycle Time',
  '/involvement':        'Involvement',
  '/capacity':           'Capacity',
  '/settings':           'Settings',
  '/settings/members':   'Members',
  '/settings/billing':   'Billing',
  '/home':               'Home',
}

function Breadcrumb() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? pathname.replace(/^\//, '').replace(/-/g, ' ')
  return (
    <h1 className="text-[14px] font-semibold text-[var(--text)] tracking-tight capitalize">
      {title}
    </h1>
  )
}

export function TopBar() {
  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-sm flex items-center px-6 gap-4 sticky top-0 z-20">
      <Breadcrumb />
      <div className="flex-1" />

      {/* Live sync pill */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-surface2)] border border-[var(--border)] text-[11px] font-mono text-[#2DD4BF]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-pulse" />
        synced
      </div>

      {/* Theme toggle */}
      <ThemeToggle />
    </header>
  )
}
