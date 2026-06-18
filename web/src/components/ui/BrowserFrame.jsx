/**
 * BrowserFrame — tasteful browser-chrome mockup wrapping a product screenshot.
 *
 * Usage:
 *   <BrowserFrame src="/shots/dashboard.png" alt="gitstate dashboard" />
 *   <BrowserFrame url="app.gitstate.dev/dashboard">
 *     <MyComponent />
 *   </BrowserFrame>
 */

export function BrowserFrame({ src, alt = '', url = 'app.gitstate.dev', children, className = '' }) {
  return (
    <div
      className={['relative rounded-[14px] overflow-hidden', className].join(' ')}
      style={{
        /* Gradient border via box-shadow + subtle outline */
        boxShadow: [
          '0 0 0 1px rgba(45,212,191,0.18)',
          '0 0 0 1px rgba(99,102,241,0.12)',
          '0 2px 4px rgba(0,0,0,0.5)',
          '0 8px 32px rgba(0,0,0,0.45)',
          '0 24px 64px rgba(0,0,0,0.35)',
          '0 0 80px rgba(45,212,191,0.05)',
        ].join(', '),
        background: 'var(--bg-surface)',
      }}
    >
      {/* Gradient border inset ring */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[14px] pointer-events-none z-20"
        style={{
          background: 'linear-gradient(135deg, rgba(45,212,191,0.15) 0%, rgba(99,102,241,0.08) 50%, rgba(45,212,191,0.04) 100%)',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          padding: '1px',
        }}
      />

      {/* Chrome bar */}
      <div
        className="relative flex items-center gap-3 px-4 h-10 border-b border-[var(--border)]"
        style={{ background: 'var(--bg-surface3)' }}
      >
        {/* Traffic-light dots */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: '#FF5F57', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.3)' }}
            aria-hidden="true"
          />
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: '#FEBC2E', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.3)' }}
            aria-hidden="true"
          />
          <span
            className="w-3 h-3 rounded-full"
            style={{ background: '#28C840', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.3)' }}
            aria-hidden="true"
          />
        </div>

        {/* URL pill — centred */}
        <div className="flex-1 flex justify-center">
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-mono text-[var(--text-faint)] max-w-[260px] truncate"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
            }}
          >
            {/* Lock icon */}
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="2" y="5.5" width="8" height="5.5" rx="1.2" fill="currentColor" opacity="0.5"/>
              <path d="M4 5.5V4a2 2 0 1 1 4 0v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.5"/>
            </svg>
            {url}
          </div>
        </div>

        {/* Right spacer — mirrors traffic lights width */}
        <div className="w-[54px] shrink-0" aria-hidden="true" />
      </div>

      {/* Viewport content */}
      <div className="relative overflow-hidden">
        {src ? (
          <img
            src={src}
            alt={alt}
            className="w-full h-auto block"
            draggable={false}
          />
        ) : (
          children
        )}

        {/* Subtle top reflection gradient */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-24 pointer-events-none z-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.025) 0%, transparent 100%)',
          }}
        />
      </div>
    </div>
  )
}
