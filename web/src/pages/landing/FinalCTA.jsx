/**
 * FinalCTA — dramatic closing section: gradient mesh, ambient glow, strong CTAs.
 */
import { Link } from 'react-router-dom'
import { ArrowRight, GitBranch, Terminal } from 'lucide-react'
import { Reveal } from '../../components/Reveal.jsx'
import {
  Button,
  Badge,
  GradientText,
  Section,
  Container,
  Glow,
  GitGraph,
} from '../../components/ui/index.js'

export default function FinalCTA() {
  return (
    <Section py="2xl" className="relative overflow-hidden border-t border-[var(--border)]">
      {/* Gradient mesh + ambient glow stack */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none ambient-brand" />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 110%, rgba(45,212,191,0.14) 0%, transparent 60%), radial-gradient(ellipse 60% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 55%)',
        }}
      />
      <Glow variant="brand" size={760} className="top-[55%] left-[50%]" />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{ background: 'linear-gradient(to right, transparent, rgba(45,212,191,0.5), rgba(99,102,241,0.5), transparent)' }}
      />
      <GitGraph
        width={260}
        opacity={0.05}
        className="absolute left-1/2 -translate-x-1/2 bottom-6 hidden md:block pointer-events-none"
      />

      <Container size="md" className="relative z-10 text-center">
        <Reveal inView>
          <Badge color="teal" className="mb-8 text-xs">
            Open core · AGPL-3.0 · Free to self-host
          </Badge>
        </Reveal>

        <Reveal inView delay={0.07}>
          <h2 className="font-display text-4xl md:text-6xl font-semibold tracking-[-0.035em] text-[var(--text)] mb-6 leading-[1.05]">
            Stop maintaining the fiction.{' '}
            <GradientText
              as="span"
              className="font-display text-4xl md:text-6xl font-semibold tracking-[-0.035em]"
            >
              Let git tell the truth.
            </GradientText>
          </h2>
        </Reveal>

        <Reveal inView delay={0.13}>
          <p className="text-base md:text-lg text-[var(--text-muted)] max-w-lg mx-auto mb-10 leading-relaxed">
            Connect a repo and gitstate derives your board, metrics, and invoices
            automatically. No setup ceremony, no ticket migration.
          </p>
        </Reveal>

        <Reveal inView delay={0.19}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup">
              <Button
                variant="primary"
                size="xl"
                className="w-full sm:w-auto"
                rightIcon={<ArrowRight size={16} aria-hidden="true" />}
              >
                Get started free
              </Button>
            </Link>
            <Link to="/docs">
              <Button
                variant="outline"
                size="xl"
                className="w-full sm:w-auto"
                leftIcon={<Terminal size={15} aria-hidden="true" />}
              >
                Self-host docs
              </Button>
            </Link>
          </div>
        </Reveal>

        {/* Command preview chip */}
        <Reveal inView delay={0.24}>
          <div className="flex justify-center mt-10">
            <code
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-mono text-[13px] text-[var(--text-dim)] border border-[var(--border)]"
              style={{
                background: 'var(--bg-surface)',
                boxShadow: 'inset 0 0 0 1px rgba(45,212,191,0.08), 0 4px 16px rgba(0,0,0,0.25)',
              }}
            >
              <GitBranch size={14} color="#2DD4BF" strokeWidth={2} aria-hidden="true" />
              <span className="text-[var(--text-faint)]">$</span>
              gitstate connect{' '}
              <span className="text-[var(--brand-teal)]">./my-repo</span>
            </code>
          </div>
        </Reveal>

        <Reveal inView delay={0.29}>
          <p className="mt-6 text-xs font-mono text-[var(--text-faint)]">
            Free plan · No credit card required · Deploy anywhere
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}
