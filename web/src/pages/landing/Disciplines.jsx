/**
 * Disciplines — "Constraints that make it honest"
 * Five disciplines rendered as a premium feature-row grid with distinct icons,
 * gradient/glow accents, depth, and Reveal stagger.
 */
import {
  GitCommitHorizontal,
  BarChart3,
  ScanSearch,
  UserCheck,
  Bot,
} from 'lucide-react'
import { Reveal, RevealList } from '../../components/Reveal.jsx'
import { Glow, Section, Container, GradientText } from '../../components/ui/index.js'

function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--brand-teal)] mb-4">
      <span className="w-4 h-px bg-[var(--brand-teal)] opacity-60" aria-hidden="true" />
      {children}
      <span className="w-4 h-px bg-[var(--brand-teal)] opacity-60" aria-hidden="true" />
    </span>
  )
}

const DISCIPLINES = [
  {
    n: '01',
    icon: GitCommitHorizontal,
    title: 'Derived, not entered',
    body: 'State comes from git. Merged PR = done. Open PR = in progress. Nobody maintains tickets — not ever.',
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
  },
  {
    n: '02',
    icon: BarChart3,
    title: 'Measure work, not workers',
    body: 'Involvement is texture across multiple dimensions including review — never a single score, never a bonus formula.',
    accent: '#6366F1',
    accentRgb: '99,102,241',
  },
  {
    n: '03',
    icon: ScanSearch,
    title: 'Evidence with visible gaps',
    body: "Invoices are backed by commit SHAs and PRs. Work git can't see is flagged for a human — never silently invented.",
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
  },
  {
    n: '04',
    icon: UserCheck,
    title: 'Free stakeholders',
    body: 'Clients, executives, and read-only reviewers pay nothing. Pricing is per builder — the people who actually commit code.',
    accent: '#6366F1',
    accentRgb: '99,102,241',
  },
  {
    n: '05',
    icon: Bot,
    title: 'Agent-native',
    body: 'AI commits are tracked, attributed, and billed identically to human commits. The ledger does not care who typed the diff.',
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
  },
]

function DisciplineCard({ d, index }) {
  const Icon = d.icon
  const isEven = index % 2 === 1

  return (
    <div
      className="group relative flex flex-col gap-5 rounded-[var(--radius-card)] p-6 overflow-hidden transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.border = `1px solid rgba(${d.accentRgb},0.22)`
        e.currentTarget.style.boxShadow = `var(--shadow-card-hover), 0 0 0 1px rgba(${d.accentRgb},0.08), 0 0 32px rgba(${d.accentRgb},0.06)`
      }}
      onMouseLeave={e => {
        e.currentTarget.style.border = '1px solid var(--border)'
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Ambient glow layer — top corner, only on hover */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(280px circle at ${isEven ? '85%' : '15%'} -15%, rgba(${d.accentRgb},0.08) 0%, transparent 70%)`,
        }}
      />

      {/* Top row: icon + step number */}
      <div className="relative z-10 flex items-start justify-between">
        {/* Icon with layered treatment */}
        <div
          className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, rgba(${d.accentRgb},0.15) 0%, rgba(${d.accentRgb},0.06) 100%)`,
            boxShadow: `inset 0 0 0 1px rgba(${d.accentRgb},0.2), 0 1px 4px rgba(0,0,0,0.25)`,
            color: d.accent,
          }}
        >
          <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
        </div>

        {/* Step number — mono, faint */}
        <span
          className="font-mono text-[11px] font-semibold tracking-[0.12em] select-none tabular-nums"
          style={{ color: `rgba(${d.accentRgb},0.3)` }}
        >
          {d.n}
        </span>
      </div>

      {/* Hairline accent rule */}
      <div
        aria-hidden="true"
        className="relative z-10 h-px w-full"
        style={{
          background: `linear-gradient(to right, rgba(${d.accentRgb},0.28) 0%, rgba(${d.accentRgb},0.05) 60%, transparent 100%)`,
        }}
      />

      {/* Text content */}
      <div className="relative z-10 flex flex-col gap-2">
        <h3
          className="font-display text-base font-semibold tracking-[-0.02em] leading-snug"
          style={{ color: 'var(--text)' }}
        >
          {d.title}
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {d.body}
        </p>
      </div>

      {/* Subtle corner pip — accent dot bottom-right */}
      <div
        aria-hidden="true"
        className="absolute bottom-3.5 right-3.5 w-1 h-1 rounded-full opacity-20 group-hover:opacity-50 transition-opacity duration-300"
        style={{ background: d.accent }}
      />
    </div>
  )
}

export default function Disciplines() {
  return (
    <Section py="xl" className="relative overflow-hidden border-t border-[var(--border)]">
      {/* Section-level ambient glows */}
      <Glow variant="teal" size={700} className="top-0 left-[15%] opacity-60" />
      <Glow variant="indigo" size={600} className="bottom-0 right-[10%] opacity-50" />

      <Container size="lg" className="relative z-10">
        {/* Header */}
        <Reveal inView>
          <div className="text-center mb-14">
            <SectionLabel>Five disciplines</SectionLabel>
            <h2
              className="font-display text-3xl md:text-4xl font-semibold tracking-[-0.025em] mb-4"
              style={{ color: 'var(--text)' }}
            >
              Constraints that make it{' '}
              <GradientText
                as="span"
                className="font-display text-3xl md:text-4xl font-semibold"
              >
                honest.
              </GradientText>
            </h2>
            <p className="text-base max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Trust in a tool comes from what it refuses to do. These are gitstate&apos;s
              non-negotiables.
            </p>
          </div>
        </Reveal>

        {/* Card grid — 5 items: 2 + 3 breakout */}
        <RevealList
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          staggerDelay={0.09}
          inView
        >
          {DISCIPLINES.map((d, i) => (
            <DisciplineCard key={d.n} d={d} index={i} />
          ))}
        </RevealList>
      </Container>
    </Section>
  )
}
