/**
 * Stats — four proof numbers displayed as a striking horizontal band.
 */
import { RevealList } from '../../components/Reveal.jsx'
import { Section, Container, GitGraph } from '../../components/ui/index.js'

const STATS = [
  { value: '0',     label: 'tickets to maintain', sublabel: 'ever',            accent: '#2DD4BF' },
  { value: '100%',  label: 'git-derived state',   sublabel: 'no manual input', accent: '#6366F1' },
  { value: 'free',  label: 'stakeholder seats',   sublabel: 'always',          accent: '#2DD4BF' },
  { value: '1',     label: 'binary to self-host', sublabel: '+ Postgres',      accent: '#6366F1' },
]

export default function Stats() {
  return (
    <Section
      py="lg"
      className="relative overflow-hidden border-y border-[var(--border)] bg-[var(--bg-surface)]/40"
    >
      {/* Ambient backdrop */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none ambient-brand opacity-80" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, rgba(45,212,191,0.4), rgba(99,102,241,0.4), transparent)' }}
      />
      <GitGraph
        variant="compact"
        width={220}
        opacity={0.06}
        className="absolute -right-6 top-1/2 -translate-y-1/2 hidden lg:block pointer-events-none"
      />

      <Container size="xl" className="relative z-10">
        <RevealList
          className="grid grid-cols-2 lg:grid-cols-4"
          staggerDelay={0.09}
          inView
        >
          {STATS.map((s) => (
            <div
              key={s.label}
              className={[
                'group relative flex flex-col gap-1.5 px-6 py-4 md:px-8',
                'border-b border-[var(--border)] lg:border-b-0 lg:border-r',
                'last:border-r-0 [&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r',
                '[&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0',
              ].join(' ')}
            >
              {/* Hover wash */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ background: `radial-gradient(120% 80% at 50% 0%, ${s.accent}10 0%, transparent 70%)` }}
              />

              <span
                className="relative font-display text-5xl md:text-6xl font-semibold leading-none tracking-[-0.04em] tabular-nums"
                style={{
                  background: `linear-gradient(160deg, ${s.accent} 0%, ${s.accent}99 55%, ${s.accent}66 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {s.value}
              </span>
              <span className="relative text-sm font-semibold text-[var(--text)] tracking-tight">
                {s.label}
              </span>
              <span className="relative text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]">
                {s.sublabel}
              </span>
            </div>
          ))}
        </RevealList>
      </Container>
    </Section>
  )
}
