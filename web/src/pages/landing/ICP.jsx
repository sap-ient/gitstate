/**
 * ICP — Ideal Customer Profile callout for client-billing dev shops.
 */
import { Briefcase, Receipt, ShieldCheck, GitCommitHorizontal } from 'lucide-react'
import { Reveal } from '../../components/Reveal.jsx'
import {
  Badge,
  Section,
  Container,
  Glow,
  BrowserFrame,
} from '../../components/ui/index.js'

function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--brand-teal)] mb-4">
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
      {children}
    </span>
  )
}

const PROOF_POINTS = [
  {
    icon: Receipt,
    color: '#2DD4BF',
    title: 'Defensible invoices',
    body: 'Every line item ships with the commit SHAs and PRs behind it. No reconstructing timesheets from memory on Friday.',
  },
  {
    icon: ShieldCheck,
    color: '#6366F1',
    title: 'Evidence your clients trust',
    body: 'Clients see exactly what was built, when, and by whom — directly from the repo, not a status field someone updated.',
  },
  {
    icon: GitCommitHorizontal,
    color: '#2DD4BF',
    title: 'Scales past the wedge',
    body: 'Multi-repo teams in an agent-native world: AI writes the code, a human PM gets real visibility — not a board nobody believes.',
  },
]

export default function ICP() {
  return (
    <Section py="2xl" className="relative overflow-hidden border-t border-[var(--border)]">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none ambient-brand opacity-70" />
      <Glow variant="teal" size={520} className="top-0 left-[15%]" />
      <Glow variant="indigo" size={520} className="bottom-0 right-[10%]" />

      <Container size="lg" className="relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy column */}
          <div>
            <Reveal inView>
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 border-glow-teal"
                style={{ background: 'rgba(45,212,191,0.08)' }}
              >
                <Briefcase size={22} color="#2DD4BF" strokeWidth={1.6} aria-hidden="true" />
              </div>
              <SectionLabel>The wedge</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--text)] tracking-[-0.025em] mb-4 leading-[1.1]">
                Built for client-billing dev shops
              </h2>
              <p className="text-base md:text-lg text-[var(--text-muted)] leading-relaxed mb-8 max-w-md">
                Agencies and consultancies have an acute pain: defensible invoices.
                gitstate generates evidence-backed invoices straight from git activity —
                so the work always matches the bill.
              </p>
            </Reveal>

            <div className="flex flex-col gap-px rounded-[var(--radius-card)] overflow-hidden border border-[var(--border)] bg-[var(--bg-surface)]/60">
              {PROOF_POINTS.map((p, i) => {
                const Icon = p.icon
                return (
                  <Reveal inView delay={0.08 + i * 0.07} key={p.title}>
                    <div className="group flex items-start gap-4 p-4 md:p-5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface2)] transition-colors duration-150">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105"
                        style={{ background: `${p.color}14`, color: p.color }}
                      >
                        <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-semibold text-[var(--text)] mb-1">
                          {p.title}
                        </h3>
                        <p className="text-sm text-[var(--text-muted)] leading-relaxed">{p.body}</p>
                      </div>
                    </div>
                  </Reveal>
                )
              })}
            </div>

            <Reveal inView delay={0.3}>
              <div className="flex flex-wrap gap-2 mt-6">
                {['Agencies', 'Consultancies', 'Fractional teams', 'Agent-native shops'].map(tag => (
                  <Badge key={tag} color="default">{tag}</Badge>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Product shot column */}
          <Reveal inView delay={0.12}>
            <div className="relative">
              <Glow variant="brand" size={480} className="top-1/2 left-1/2" />
              <div className="relative lg:rotate-[0.6deg] lg:hover:rotate-0 transition-transform duration-500">
                <BrowserFrame
                  src="/shots/billing.png"
                  alt="gitstate evidence-backed billing — invoice line items linked to commit SHAs"
                  url="app.gitstate.dev/billing"
                />
              </div>
              {/* Floating proof chip */}
              <div
                className="hidden md:flex absolute -bottom-4 -left-4 items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--border2)] z-30"
                style={{
                  background: 'var(--bg-surface)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(45,212,191,0.1)',
                }}
              >
                <Receipt size={15} color="#2DD4BF" strokeWidth={2} aria-hidden="true" />
                <span className="text-xs font-mono text-[var(--text-dim)]">
                  every line ⟶ a commit
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
