/**
 * Landing — the gitstate marketing landing page.
 * "The project tracker nobody updates by hand."
 *
 * Sections:
 *   1. Hero          — headline + git-graph motif + derived-not-entered visual
 *   2. Disciplines   — the three honest constraints
 *   3. Derived visual — ticket vs diff side-by-side
 *   4. Feature grid  — six key capabilities
 *   5. Stat strip    — four proof numbers
 *   6. ICP callout   — client-billing dev shops
 *   7. Compare teaser
 *   8. Final CTA
 */
import { Link } from 'react-router-dom'
import { Reveal, RevealList } from '../components/Reveal.jsx'
import {
  Button,
  Card,
  Badge,
  Pill,
  GradientText,
  Section,
  Container,
  Glow,
  GitGraph,
  DiffBlock,
} from '../components/ui/index.js'
import MarketingLayout from '../components/marketing/MarketingLayout.jsx'

// ── Shared mini-primitives ──────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--brand-teal)] mb-4">
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
      {children}
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
    </span>
  )
}

// ── 1. Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <Section py="2xl" className="relative overflow-hidden">
      {/* Glows */}
      <Glow variant="teal" size={900} className="top-[-10%] left-[20%]" />
      <Glow variant="indigo" size={700} className="top-[40%] right-[-5%]" />

      <Container size="xl" className="relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-20">
          {/* Left: copy */}
          <div className="flex-1 max-w-2xl">
            <Reveal delay={0}>
              <div className="flex items-center gap-2.5 mb-7">
                <Pill color="indigo">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                  </svg>
                  GitHub + GitLab
                </Pill>
                <Pill color="teal">open core · AGPL-3.0</Pill>
              </div>
            </Reveal>

            <Reveal delay={0.07}>
              <h1 className="font-display text-5xl md:text-6xl lg:text-[4.25rem] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--text)] mb-5">
                The project tracker{' '}
                <GradientText as="span" className="font-display text-5xl md:text-6xl lg:text-[4.25rem] font-semibold leading-[1.05] tracking-[-0.03em]">
                  nobody updates by hand.
                </GradientText>
              </h1>
            </Reveal>

            <Reveal delay={0.14}>
              <p className="text-lg md:text-xl text-[var(--text-muted)] leading-relaxed mb-8 max-w-xl">
                gitstate reads your repos and{' '}
                <span className="text-[var(--text)] font-medium">derives</span>
                {' '}true project state, effort, and evidence-backed invoices from git itself — built for a world where agents write the code and humans supervise.
              </p>
            </Reveal>

            <Reveal delay={0.2}>
              <div className="flex flex-col sm:flex-row items-start gap-3">
                <Link to="/signup">
                  <Button variant="primary" size="lg">
                    Get started free
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4"/>
                    </svg>
                  </Button>
                </Link>
                <Link to="/compare">
                  <Button variant="outline" size="lg">
                    See vs Linear / Jira
                  </Button>
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.26}>
              <p className="mt-5 text-xs font-mono text-[var(--text-faint)]">
                Free stakeholder seats · 1 binary to self-host · 0 tickets to maintain
              </p>
            </Reveal>
          </div>

          {/* Right: animated git-graph hero visual */}
          <div className="flex-1 flex items-center justify-center w-full max-w-lg lg:max-w-none">
            <Reveal delay={0.1} className="w-full">
              <HeroVisual />
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  )
}

function HeroVisual() {
  // A "git timeline" card showing commits → derived state
  const commits = [
    { sha: 'a1b2c3d', msg: 'feat: add payment webhook handler', branch: 'feature/payments', time: '2h ago', status: 'merged', linesAdd: 142, linesDel: 8 },
    { sha: 'e4f5a6b', msg: 'fix: resolve race condition in sync worker', branch: 'fix/sync-race', time: '5h ago', status: 'merged', linesAdd: 23, linesDel: 41 },
    { sha: 'c7d8e9f', msg: 'chore: update deps + lock file', branch: 'main', time: '8h ago', status: 'in-progress', linesAdd: 6, linesDel: 6 },
  ]

  return (
    <div className="relative">
      {/* Outer glow halo */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: '0 0 80px rgba(45,212,191,0.08), 0 0 40px rgba(99,102,241,0.06)',
        }}
      />

      <Card padding="none" glow className="overflow-hidden w-full">
        {/* Terminal-style header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-surface3)] border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="font-mono text-xs text-[var(--text-faint)]">gitstate · project state</span>
          <Badge color="teal">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand-teal)] animate-pulse mr-1" aria-hidden="true" />
            live
          </Badge>
        </div>

        {/* Git graph + commit list */}
        <div className="flex">
          {/* Graph rail */}
          <div className="px-3 py-4 flex flex-col items-center gap-0 border-r border-[var(--border)] bg-[var(--bg-surface)]/60">
            <GitGraph variant="compact" width={60} opacity={0.7} />
          </div>

          {/* Commits */}
          <div className="flex-1 divide-y divide-[var(--border)]">
            {commits.map((c) => (
              <div key={c.sha} className="px-4 py-3 flex flex-col gap-1 group hover:bg-[var(--bg-surface2)] transition-colors duration-100">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-medium text-[var(--text)] leading-snug line-clamp-1 group-hover:text-[var(--brand-teal)] transition-colors duration-150">
                    {c.msg}
                  </span>
                  <Badge color={c.status === 'merged' ? 'teal' : 'indigo'} className="shrink-0">
                    {c.status === 'merged' ? 'merged' : 'open'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2.5 text-[11px] font-mono text-[var(--text-faint)]">
                  <span className="text-[var(--brand-teal)]/70">{c.sha}</span>
                  <span>·</span>
                  <span>{c.branch}</span>
                  <span>·</span>
                  <span>{c.time}</span>
                  <span className="ml-auto flex gap-1.5">
                    <Badge color="add">+{c.linesAdd}</Badge>
                    <Badge color="del">−{c.linesDel}</Badge>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Derived summary footer */}
        <div className="px-4 py-3 bg-[var(--bg-surface3)] border-t border-[var(--border)] grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Status</span>
            <span className="text-xs font-semibold text-[var(--brand-teal)]">In Progress</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Effort</span>
            <span className="text-xs font-semibold text-[var(--text)]">~3.4d <span className="text-[var(--text-faint)] font-normal">(LLM)</span></span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Invoice</span>
            <span className="text-xs font-semibold text-[var(--text)]">$1,620 <span className="text-green-400 font-normal">✓ evidenced</span></span>
          </div>
        </div>
      </Card>

      {/* Floating "no ticket created" annotation */}
      <div
        className="absolute -bottom-4 -right-4 md:-right-8 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg shadow-black/30 text-xs font-mono"
        aria-label="Zero tickets were manually updated"
      >
        <span className="text-green-400">✓</span>
        <span className="text-[var(--text-muted)]">0 tickets updated by hand</span>
      </div>
    </div>
  )
}

// ── 2. Disciplines ─────────────────────────────────────────────────────────────

const DISCIPLINES = [
  {
    n: '01',
    title: 'Derived, not entered',
    body: 'State comes from git. Merged PR = done. Open PR = in progress. Nobody maintains tickets — not ever.',
    color: 'teal',
  },
  {
    n: '02',
    title: 'Measure work, not workers',
    body: 'Involvement is texture across multiple dimensions including review — never a single score, never a bonus formula.',
    color: 'indigo',
  },
  {
    n: '03',
    title: 'Evidence with visible gaps',
    body: 'Invoices are backed by commit SHAs and PRs. Work git can\'t see is flagged for a human — never silently invented.',
    color: 'teal',
  },
]

function Disciplines() {
  return (
    <Section py="xl" className="border-t border-[var(--border)]">
      <Container size="lg">
        <Reveal inView>
          <div className="text-center mb-12">
            <SectionLabel>Three disciplines</SectionLabel>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--text)] tracking-[-0.02em]">
              Constraints that make it honest.
            </h2>
          </div>
        </Reveal>

        <RevealList className="grid grid-cols-1 md:grid-cols-3 gap-5" staggerDelay={0.1} inView>
          {DISCIPLINES.map(d => (
            <Card key={d.n} padding="lg" hoverable>
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-mono font-bold"
                  style={{
                    background: d.color === 'teal' ? 'rgba(45,212,191,0.1)' : 'rgba(99,102,241,0.1)',
                    color: d.color === 'teal' ? '#2DD4BF' : '#6366F1',
                  }}
                >
                  {d.n}
                </span>
                <div
                  className="h-px flex-1"
                  style={{
                    background: d.color === 'teal'
                      ? 'linear-gradient(to right, rgba(45,212,191,0.4), transparent)'
                      : 'linear-gradient(to right, rgba(99,102,241,0.4), transparent)',
                  }}
                />
              </div>
              <h3 className="font-display text-lg font-semibold text-[var(--text)] mb-2">
                {d.title}
              </h3>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">{d.body}</p>
            </Card>
          ))}
        </RevealList>
      </Container>
    </Section>
  )
}

// ── 3. Derived vs Entered visual ───────────────────────────────────────────────

const DIFF_SAMPLE = `-// TODO: Update Jira ticket GS-418 status to "In Review"
-// TODO: Add time log entry: 4.5h on GS-418
-// TODO: Ping #project-tracker with progress update
+// [gitstate reads this commit automatically]
+// Status  → "In Review"   (PR opened against main)
+// Effort  → 4.2d          (LLM diff-difficulty)
+// Invoice → $2,100        (evidenced: PR #312, commits a1b2c, e4f5a)`

function DerivedVsEntered() {
  return (
    <Section py="xl" className="relative overflow-hidden">
      <Glow variant="brand" size={700} className="top-[50%] left-[50%]" />
      <Container size="lg" className="relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Copy */}
          <Reveal inView className="flex-1 max-w-lg">
            <div>
              <SectionLabel>Derived, not entered</SectionLabel>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--text)] tracking-[-0.02em] mb-5">
                The ticket was a{' '}
                <GradientText as="span" className="font-display text-3xl md:text-4xl font-semibold">
                  side effect of the commit.
                </GradientText>
              </h2>
              <p className="text-base text-[var(--text-muted)] leading-relaxed mb-6">
                Every status update, every time log, every "ping the team" — all of that is manual overhead that git already made redundant. gitstate eliminates the middleman and reads the source of truth directly.
              </p>
              <p className="text-base text-[var(--text-muted)] leading-relaxed">
                Estimates are ~30% wrong and have been for 40 years. Velocity is gamed the moment it becomes a target. Timesheets are reconstructed from memory on Friday.{' '}
                <span className="text-[var(--text)] font-medium">Git is the real ledger.</span>
              </p>
            </div>
          </Reveal>

          {/* Diff visual */}
          <Reveal inView delay={0.1} className="flex-1 w-full">
            <DiffBlock filename="The old way → the gitstate way">
              {DIFF_SAMPLE}
            </DiffBlock>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}

// ── 4. Feature grid ────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
      </svg>
    ),
    color: '#2DD4BF',
    label: 'Core engine',
    title: 'Git engine, not a wrapper',
    body: 'Deep git reading: walk history, diff, blame, cycle time, DORA metrics. Derived from the repo itself — no webhook magic required.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 0 0 2.25-2.25V6a2.25 2.25 0 0 0-2.25-2.25H6A2.25 2.25 0 0 0 3.75 6v2.25A2.25 2.25 0 0 0 6 10.5Zm0 9.75h2.25A2.25 2.25 0 0 0 10.5 18v-2.25a2.25 2.25 0 0 0-2.25-2.25H6a2.25 2.25 0 0 0-2.25 2.25V18A2.25 2.25 0 0 0 6 20.25Zm9.75-9.75H18a2.25 2.25 0 0 0 2.25-2.25V6A2.25 2.25 0 0 0 18 3.75h-2.25A2.25 2.25 0 0 0 13.5 6v2.25a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    color: '#6366F1',
    label: 'Integrations',
    title: 'GitHub + GitLab, unified',
    body: 'Connect both platforms. Issues sync two-way. Your board derives state from real git activity — not sprint ceremonies or status fields.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
      </svg>
    ),
    color: '#f59e0b',
    label: 'AI sizing',
    title: 'LLM diff-difficulty sizing',
    body: 'Effort sizing from an LLM reading the actual diff — not story-point poker. Calibrated from your observed cycle time, not vibes.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    color: '#22c55e',
    label: 'Billing',
    title: 'Evidence-backed invoices',
    body: 'Every invoice line links to a commit SHA or PR. Work git can\'t see — meetings, research — is flagged for you to fill in, never invented.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    color: '#2DD4BF',
    label: 'Access model',
    title: 'Free stakeholder seats',
    body: 'Pricing is per builder — devs and PMs. Clients, stakeholders, and read-only viewers are always free. The seat-tax killer incumbents can\'t match.',
  },
  {
    icon: (
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
    color: '#6366F1',
    label: 'Platform',
    title: 'Agent-native from day one',
    body: 'Built for a world where AI writes the code and humans supervise. Agent runs are tracked, attributed, and billed just like human commits.',
  },
]

function FeatureGrid() {
  return (
    <Section py="xl" className="border-t border-[var(--border)]">
      <Container size="lg">
        <Reveal inView>
          <div className="text-center mb-12">
            <SectionLabel>Capabilities</SectionLabel>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--text)] tracking-[-0.02em] mb-3">
              Everything derived from git.{' '}
              <GradientText as="span" className="font-display text-3xl md:text-4xl font-semibold">
                Nothing entered by hand.
              </GradientText>
            </h2>
            <p className="text-base text-[var(--text-muted)] max-w-lg mx-auto">
              Jira, Linear, ClickUp — manually maintained fictions sitting next to git. gitstate eliminates the fiction.
            </p>
          </div>
        </Reveal>

        <RevealList
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          staggerDelay={0.07}
          inView
        >
          {FEATURES.map(f => (
            <Card key={f.title} padding="lg" hoverable className="flex flex-col gap-4 group">
              <div className="flex items-start justify-between">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 group-hover:scale-105"
                  style={{ background: `${f.color}14`, color: f.color }}
                >
                  {f.icon}
                </div>
                <Badge color="default" className="text-[10px]">{f.label}</Badge>
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-[var(--text)] mb-1.5">
                  {f.title}
                </h3>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">{f.body}</p>
              </div>
            </Card>
          ))}
        </RevealList>
      </Container>
    </Section>
  )
}

// ── 5. Stat strip ──────────────────────────────────────────────────────────────

const STATS = [
  { value: '0', label: 'tickets to maintain', sublabel: 'ever' },
  { value: '100%', label: 'git-derived state', sublabel: 'no manual input' },
  { value: 'free', label: 'stakeholder seats', sublabel: 'always' },
  { value: '1', label: 'binary to self-host', sublabel: '+ Postgres' },
]

function StatStrip() {
  return (
    <Section py="lg" className="border-y border-[var(--border)] bg-[var(--bg-surface)]/50">
      <Container size="xl">
        <RevealList
          className="grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12"
          staggerDelay={0.09}
          inView
        >
          {STATS.map((s, i) => (
            <div key={s.label} className="flex flex-col gap-1">
              <span
                className="font-display text-4xl md:text-5xl font-semibold tracking-[-0.03em] tabular-nums"
                style={{ color: i % 2 === 0 ? '#2DD4BF' : '#6366F1' }}
              >
                {s.value}
              </span>
              <span className="text-sm font-medium text-[var(--text)]">{s.label}</span>
              <span className="text-xs font-mono text-[var(--text-faint)]">{s.sublabel}</span>
            </div>
          ))}
        </RevealList>
      </Container>
    </Section>
  )
}

// ── 6. ICP callout ─────────────────────────────────────────────────────────────

function IcpCallout() {
  return (
    <Section py="xl">
      <Container size="md">
        <Reveal inView>
          <Card padding="xl" glow className="relative overflow-hidden">
            {/* Background gradient */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.04) 0%, rgba(99,102,241,0.04) 100%)',
              }}
            />

            <div className="relative z-10 flex flex-col md:flex-row items-start gap-8">
              {/* Icon */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)' }}
              >
                <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#2DD4BF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
              </div>

              {/* Copy */}
              <div className="flex-1">
                <div className="mb-1">
                  <SectionLabel>Built for</SectionLabel>
                </div>
                <h2 className="font-display text-2xl font-semibold text-[var(--text)] mb-3">
                  Client-billing dev shops
                </h2>
                <p className="text-base text-[var(--text-muted)] leading-relaxed mb-5">
                  Agencies and consultancies have an acute pain: defensible invoices. gitstate generates evidence-backed invoices from git activity — your clients see the commit SHAs and PRs behind every line item. No more reconstructing timesheets from memory on Friday.
                </p>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  From there: scaling multi-repo teams running in an agent-native world, where AI writes the code and a human PM needs real visibility — not a Jira board nobody believes.
                </p>
                <div className="flex flex-wrap gap-2 mt-5">
                  {['Agencies', 'Consultancies', 'Fractional dev teams', 'Agent-native shops'].map(tag => (
                    <Badge key={tag} color="default">{tag}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </Reveal>
      </Container>
    </Section>
  )
}

// ── 7. Compare teaser ──────────────────────────────────────────────────────────

const COMPARE_ROWS = [
  { feature: 'State derives from git', gs: true,  jira: false, linear: false },
  { feature: 'Free stakeholder seats', gs: true,  jira: false, linear: false },
  { feature: 'Evidence billing',       gs: true,  jira: false, linear: false },
  { feature: 'LLM effort sizing',      gs: true,  jira: false, linear: false },
  { feature: 'Self-host (1 binary)',   gs: true,  jira: false, linear: false },
  { feature: 'Agent-native tracking',  gs: true,  jira: false, linear: false },
]

function CompareTeaser() {
  return (
    <Section py="xl" className="border-t border-[var(--border)]">
      <Container size="md">
        <Reveal inView>
          <div className="text-center mb-10">
            <SectionLabel>How it stacks up</SectionLabel>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-[var(--text)] tracking-[-0.02em] mb-3">
              Built differently.
            </h2>
            <p className="text-base text-[var(--text-muted)]">
              Not a Jira clone with a dark mode. A fundamentally different premise.
            </p>
          </div>
        </Reveal>

        <Reveal inView delay={0.1}>
          <Card padding="none" className="overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-4 border-b border-[var(--border)] bg-[var(--bg-surface3)]">
              <div className="col-span-2 px-5 py-3">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Feature</span>
              </div>
              {[
                { name: 'gitstate', gradient: true },
                { name: 'Jira' },
                { name: 'Linear' },
              ].map(({ name, gradient }) => (
                <div key={name} className="px-3 py-3 text-center">
                  <span
                    className={[
                      'text-xs font-semibold font-mono',
                      gradient ? 'gradient-text' : 'text-[var(--text-faint)]',
                    ].join(' ')}
                  >
                    {name}
                  </span>
                </div>
              ))}
            </div>

            {/* Rows */}
            {COMPARE_ROWS.map((row, i) => (
              <div
                key={row.feature}
                className={[
                  'grid grid-cols-4 border-b border-[var(--border)] last:border-0',
                  'hover:bg-[var(--bg-surface2)] transition-colors duration-100',
                  i % 2 === 0 ? '' : 'bg-[var(--bg-surface)]/40',
                ].join(' ')}
              >
                <div className="col-span-2 px-5 py-3.5 text-sm text-[var(--text-muted)]">{row.feature}</div>
                <CheckCell val={row.gs} primary />
                <CheckCell val={row.jira} />
                <CheckCell val={row.linear} />
              </div>
            ))}
          </Card>
        </Reveal>

        <Reveal inView delay={0.15}>
          <div className="flex justify-center mt-7">
            <Link to="/compare">
              <Button variant="outline" size="md">
                Full comparison
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4"/>
                </svg>
              </Button>
            </Link>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}

function CheckCell({ val, primary = false }) {
  return (
    <div className="px-3 py-3.5 flex items-center justify-center">
      {val ? (
        <span className={primary ? 'text-[var(--brand-teal)]' : 'text-[var(--text-faint)]'}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
          </svg>
        </span>
      ) : (
        <span className="text-[var(--text-faint)]/40">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </span>
      )}
    </div>
  )
}

// ── 8. Final CTA ───────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <Section py="2xl" className="relative overflow-hidden border-t border-[var(--border)]">
      <Glow variant="brand" size={800} className="top-[50%] left-[50%]" />

      <Container size="sm" className="relative z-10 text-center">
        <Reveal inView>
          <Badge color="teal" className="mb-8 text-xs">
            Open core · AGPL-3.0 · Free to self-host
          </Badge>
        </Reveal>
        <Reveal inView delay={0.07}>
          <h2 className="font-display text-4xl md:text-5xl font-semibold tracking-[-0.03em] text-[var(--text)] mb-5 leading-tight">
            Stop maintaining the fiction.{' '}
            <GradientText as="span" className="font-display text-4xl md:text-5xl font-semibold tracking-[-0.03em]">
              Let git tell the truth.
            </GradientText>
          </h2>
        </Reveal>
        <Reveal inView delay={0.13}>
          <p className="text-base md:text-lg text-[var(--text-muted)] max-w-md mx-auto mb-10 leading-relaxed">
            Connect a repo and gitstate derives your board, metrics, and invoices automatically. No setup ceremony, no ticket migration.
          </p>
        </Reveal>
        <Reveal inView delay={0.19}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/signup">
              <Button variant="primary" size="xl">
                Get started free
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 8h10M9 4l4 4-4 4"/>
                </svg>
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="outline" size="xl">Sign in</Button>
            </Link>
          </div>
        </Reveal>
        <Reveal inView delay={0.24}>
          <p className="mt-6 text-xs font-mono text-[var(--text-faint)]">
            Free plan · No credit card required · Deploy anywhere
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}

// ── Page assembly ──────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <Disciplines />
      <DerivedVsEntered />
      <FeatureGrid />
      <StatStrip />
      <IcpCallout />
      <CompareTeaser />
      <FinalCta />
    </MarketingLayout>
  )
}
