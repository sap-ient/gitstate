/**
 * CompareTeaser — compact comparison matrix: gitstate vs Jira vs Linear.
 */
import { Check, X, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal } from '../../components/Reveal.jsx'
import {
  Button,
  GradientText,
  Section,
  Container,
} from '../../components/ui/index.js'

function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--brand-teal)] mb-4">
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
      {children}
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
    </span>
  )
}

const COMPARE_ROWS = [
  { feature: 'State derives from git',  gs: true,  jira: false, linear: false },
  { feature: 'Free stakeholder seats',  gs: true,  jira: false, linear: false },
  { feature: 'Evidence billing',        gs: true,  jira: false, linear: false },
  { feature: 'LLM effort sizing',       gs: true,  jira: false, linear: false },
  { feature: 'Self-host (1 binary)',    gs: true,  jira: false, linear: false },
  { feature: 'Agent-native tracking',   gs: true,  jira: false, linear: false },
]

function MarkCell({ val, primary = false }) {
  return (
    <div className="px-3 py-3.5 flex items-center justify-center">
      {val ? (
        primary ? (
          <span
            className="inline-flex items-center justify-center w-6 h-6 rounded-full"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.18), rgba(99,102,241,0.18))',
              color: 'var(--brand-teal)',
            }}
          >
            <Check size={14} strokeWidth={3} aria-label="Yes" />
          </span>
        ) : (
          <span className="text-[var(--text-faint)]">
            <Check size={15} strokeWidth={2.5} aria-label="Yes" />
          </span>
        )
      ) : (
        <span className="text-[var(--text-faint)]/40">
          <X size={14} strokeWidth={2} aria-label="No" />
        </span>
      )}
    </div>
  )
}

export default function CompareTeaser() {
  return (
    <Section py="2xl" className="relative overflow-hidden border-t border-[var(--border)]">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none ambient-teal opacity-60" />

      <Container size="md" className="relative z-10">
        <Reveal inView>
          <div className="text-center mb-10">
            <div className="flex justify-center">
              <SectionLabel>How it stacks up</SectionLabel>
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--text)] tracking-[-0.025em] mb-3">
              Built differently.
            </h2>
            <p className="text-base text-[var(--text-muted)] max-w-md mx-auto">
              Not a Jira clone with a dark mode. A fundamentally different premise.
            </p>
          </div>
        </Reveal>

        <Reveal inView delay={0.1}>
          <div
            className="relative rounded-[16px] p-px overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.25), rgba(99,102,241,0.12) 50%, var(--border))' }}
          >
            <div
              className="relative rounded-[15px] overflow-hidden"
              style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-card)' }}
            >
              {/* Highlighted gitstate column backdrop (cols 3 of 5 in the 5-col grid) */}
              <div
                aria-hidden="true"
                className="absolute inset-y-0 z-0 hidden sm:block border-glow-teal"
                style={{
                  left: '40%',
                  width: '20%',
                  background: 'linear-gradient(to bottom, rgba(45,212,191,0.07), rgba(45,212,191,0.02))',
                }}
              />

              {/* Header */}
              <div className="relative z-10 grid grid-cols-5 border-b border-[var(--border)] bg-[var(--bg-surface3)]">
                <div className="col-span-2 px-5 py-3.5">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Capability</span>
                </div>
                <div className="px-3 py-3 text-center">
                  <GradientText as="span" className="text-xs font-semibold font-mono">gitstate</GradientText>
                </div>
                <div className="px-3 py-3 text-center">
                  <span className="text-xs font-semibold font-mono text-[var(--text-faint)]">Jira</span>
                </div>
                <div className="px-3 py-3 text-center">
                  <span className="text-xs font-semibold font-mono text-[var(--text-faint)]">Linear</span>
                </div>
              </div>

              {/* Rows */}
              {COMPARE_ROWS.map((row, i) => (
                <div
                  key={row.feature}
                  className={[
                    'relative z-10 grid grid-cols-5 border-b border-[var(--border)] last:border-0',
                    'group transition-colors duration-100',
                    i % 2 === 0 ? '' : 'bg-[var(--bg-surface2)]/40',
                  ].join(' ')}
                >
                  <div className="col-span-2 px-5 py-3.5 text-sm text-[var(--text-dim)] group-hover:text-[var(--text)] transition-colors">
                    {row.feature}
                  </div>
                  <MarkCell val={row.gs} primary />
                  <MarkCell val={row.jira} />
                  <MarkCell val={row.linear} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal inView delay={0.15}>
          <div className="flex justify-center mt-8">
            <Link to="/compare">
              <Button variant="outline" size="md" rightIcon={<ArrowRight size={14} aria-hidden="true" />}>
                See the full comparison
              </Button>
            </Link>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
