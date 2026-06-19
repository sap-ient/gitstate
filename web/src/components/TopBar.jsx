/**
 * TopBar — shows current section title, live sync pill, Ask-AI chat toggle, theme toggle.
 */
import { useLocation } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle.jsx'
import { useChatPanel } from './AppShell.jsx'

const TITLES = {
  '/dashboard':          'Dashboard',
  '/board':              'Board',
  '/projects':           'Projects',
  '/repos':              'Repositories',
  '/analytics':          'Analytics',
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
  const { chatOpen, toggleChat } = useChatPanel()

  return (
    <header className="h-14 border-b border-[var(--border)] bg-[var(--bg-surface)]/80 backdrop-blur-sm flex items-center px-6 gap-4 sticky top-0 z-20">
      <Breadcrumb />
      <div className="flex-1" />

      {/* Live sync pill */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-surface2)] border border-[var(--border)] text-[11px] font-mono text-[#2DD4BF]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-pulse" />
        synced
      </div>

      {/* Ask AI / chat toggle */}
      <button
        type="button"
        onClick={toggleChat}
        aria-pressed={chatOpen}
        title="Ask AI about your repos"
        className={[
          'flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[12px] font-medium transition-all duration-150 cursor-pointer',
          chatOpen
            ? 'bg-[var(--brand-teal)]/10 border-[var(--brand-teal)]/40 text-[var(--brand-teal)]'
            : 'bg-[var(--bg-surface3)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border2)]',
        ].join(' ')}
      >
        <Sparkles size={14} strokeWidth={2} />
        Ask AI
      </button>

      {/* Theme toggle */}
      <ThemeToggle />
    </header>
  )
}
