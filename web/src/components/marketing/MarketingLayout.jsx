/**
 * MarketingLayout — shell wrapper for all marketing/public pages.
 * Composes: grain overlay + glow mesh background + MarketingNav + children + MarketingFooter.
 *
 * Usage (orchestrator wires routes like this):
 *   <Route element={<MarketingLayout />}>
 *     <Route path="/" element={<Landing />} />
 *     <Route path="/pricing" element={<Pricing />} />
 *     ...
 *   </Route>
 *
 * Or wrap directly:
 *   <MarketingLayout>
 *     <Pricing />
 *   </MarketingLayout>
 *
 * Export: default function MarketingLayout({ children })
 */
import { Outlet } from 'react-router-dom'
import { MarketingNav } from './MarketingNav.jsx'
import { MarketingFooter } from './MarketingFooter.jsx'

export default function MarketingLayout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] grain relative overflow-x-hidden">
      {/* Persistent ambient mesh — teal top-left, indigo bottom-right */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: [
            'radial-gradient(ellipse 80% 50% at 10% -10%, rgba(45,212,191,0.07) 0%, transparent 60%)',
            'radial-gradient(ellipse 60% 40% at 90% 110%, rgba(99,102,241,0.07) 0%, transparent 60%)',
          ].join(', '),
        }}
      />

      {/* Fine grid texture */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: [
            'linear-gradient(rgba(45,212,191,0.025) 1px, transparent 1px)',
            'linear-gradient(90deg, rgba(45,212,191,0.025) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: '72px 72px',
        }}
      />

      {/* Sticky nav */}
      <MarketingNav />

      {/* Page content — pt-14 clears fixed nav */}
      <main className="relative z-10 flex-1 pt-14">
        {/* Support both children prop (direct wrap) and <Outlet /> (nested route) */}
        {children ?? <Outlet />}
      </main>

      <MarketingFooter />
    </div>
  )
}
