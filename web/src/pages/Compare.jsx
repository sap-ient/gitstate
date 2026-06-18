/**
 * Compare page — gitstate vs Jira, Linear, ClickUp, ZenHub.
 * "The Ledger" aesthetic: dark-first, teal→indigo, monospace accents, grain.
 * Wrapped by MarketingLayout from the orchestrator (no nav/footer here).
 */
import { Link } from 'react-router-dom'
import {
  Check,
  Minus,
  X,
  ArrowRight,
  GitMerge,
  ScanLine,
  GitBranch,
  Receipt,
  Users,
  Layers,
  Bot,
  GitFork,
  MessageSquareText,
  Lock,
  ShieldOff,
} from 'lucide-react'
import { Card, Badge, Pill, GradientText, Section, Container, Glow, BrowserFrame } from '../components/ui'
import { Reveal, RevealList } from '../components/Reveal.jsx'

// ── Data ─────────────────────────────────────────────────────────────────────

// Values: true = full ✓, 'partial' = partial ~, false = ✗
const ROWS = [
  {
    feature: 'State derived from git',
    detail: 'Merged = done. Open PR = in progress. No manual status fields.',
    icon: GitMerge,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: false,
    zenhub: 'partial',
    winner: true,
  },
  {
    feature: 'Effort from reading the diff',
    detail: 'LLM reads the actual diff to judge semantic difficulty — not story-point poker.',
    icon: ScanLine,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: false,
    zenhub: false,
    winner: true,
  },
  {
    feature: 'GitHub + GitLab unified',
    detail: 'Single board spanning both platforms, two-way issue sync.',
    icon: GitBranch,
    gitstate: true,
    jira: 'partial',
    linear: 'partial',
    clickup: 'partial',
    zenhub: false,
    winner: true,
  },
  {
    feature: 'Evidence-based invoicing',
    detail: 'Every invoice line links to a commit SHA or PR. Gaps flagged, not fabricated.',
    icon: Receipt,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: false,
    zenhub: false,
    winner: true,
  },
  {
    feature: 'Free stakeholder seats',
    detail: 'Clients, PMs, and execs can view without driving up your bill.',
    icon: Users,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: 'partial',
    zenhub: false,
    winner: true,
  },
  {
    feature: 'Involvement as texture, not a score',
    detail: 'Multi-dimensional contribution view — review, authorship, scope — never a single number in pay formulas.',
    icon: Layers,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: false,
    zenhub: false,
    winner: true,
  },
  {
    feature: 'Agent-native',
    detail: 'Built for workflows where agents write code and humans supervise. No ticket-update rituals.',
    icon: Bot,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: false,
    zenhub: false,
    winner: true,
  },
  {
    feature: 'Open source + self-host',
    detail: 'AGPL-3.0 core. Run it on your own infra, fork it, own your data.',
    icon: GitFork,
    gitstate: true,
    jira: false,
    linear: false,
    clickup: false,
    zenhub: false,
    winner: true,
  },
  {
    feature: 'Queryable / NL→report',
    detail: 'Ask "show me PRs by contributor last quarter" in plain language. No BI tool needed.',
    icon: MessageSquareText,
    gitstate: true,
    jira: 'partial',
    linear: false,
    clickup: 'partial',
    zenhub: false,
    winner: true,
  },
]

const TOOL_COLS = [
  { key: 'gitstate', label: 'gitstate', isGs: true },
  { key: 'jira', label: 'Jira', isGs: false },
  { key: 'linear', label: 'Linear', isGs: false },
  { key: 'clickup', label: 'ClickUp', isGs: false },
  { key: 'zenhub', label: 'ZenHub', isGs: false },
]

// ── Cell rendering ────────────────────────────────────────────────────────────

function Cell({ value, isGs }) {
  if (value === true) {
    return (
      <span
        className={[
          'inline-flex items-center justify-center w-7 h-7 rounded-full transition-transform duration-150',
          isGs
            ? 'bg-[#2DD4BF]/15 text-[#2DD4BF] shadow-[0_0_14px_rgba(45,212,191,0.35)] group-hover:scale-110'
            : 'bg-green-500/10 text-green-400',
        ].join(' ')}
        aria-label="Yes"
      >
        <Check size={15} strokeWidth={3} />
      </span>
    )
  }
  if (value === 'partial') {
    return (
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-yellow-400/80 bg-yellow-500/[0.08]"
        aria-label="Partial"
      >
        <Minus size={15} strokeWidth={3} />
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--text-faint)]/50 bg-transparent"
      aria-label="No"
    >
      <X size={14} strokeWidth={2.5} />
    </span>
  )
}

// ── Narrative blocks ──────────────────────────────────────────────────────────

const NARRATIVES = [
  {
    heading: 'The problem is structural',
    body: `Jira, Linear, ClickUp, and ZenHub are parallel, hand-maintained records of work that already happened in git. Every sprint ceremony, every story-point estimate, every "please update your ticket" Slack message exists because those tools chose to store a copy of reality rather than read the original.

That copy is unreliable by construction. Estimates have been ~30% wrong for 40 years. Velocity becomes a vanity metric the moment it's a target. Billable hours are reconstructed from memory on Friday afternoon, leaking 15–25% of agency revenue.

These aren't bugs in the tools. They're what happens when you ask a human to invent a number.`,
  },
  {
    heading: 'Why incumbents can\'t copy it',
    body: `Jira and Linear aren't ignoring git because they haven't thought of it. They're structurally blocked.

Their entire data model is the hand-entered ticket. Their revenue model is per-seat — every stakeholder who views progress costs you money. Replacing tickets with git-derived state would invalidate years of customer data and destroy the metric their pricing depends on.

gitstate charges per builder. Stakeholders — clients, PMs, executives — are free. The data model IS the git object graph. There's no parallel record to maintain, no incentive to make tickets the source of truth.`,
  },
  {
    heading: 'What "derived" actually means',
    body: `When a PR merges, gitstate marks it done — automatically, immediately, without anyone touching a board. Cycle time is first-commit-to-merge, the exact DORA definition. Effort is an LLM reading the actual diff and judging semantic difficulty: a 3-line change that restructures an auth flow isn't the same weight as 300 lines of generated test fixtures.

For billing teams: every invoice line links to a commit SHA or pull request. Work git can't see — client calls, architecture sessions — is flagged for you to fill in. It is never silently fabricated.`,
  },
]

// ── Components ────────────────────────────────────────────────────────────────

function NarrativeSection({ heading, body, index }) {
  return (
    <Reveal inView>
      <div className="group relative">
        {/* Numbered node on the timeline */}
        <span
          className="absolute -left-[1.6rem] top-1 w-3 h-3 rounded-full border-2 border-[var(--bg)] z-10"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
          aria-hidden="true"
        />
        <div className="flex items-baseline gap-3 mb-3">
          <span className="font-mono text-xs text-[var(--brand-teal)] tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <h3 className="font-display text-xl font-semibold text-[var(--text)] tracking-tight">
            {heading}
          </h3>
        </div>
        <div className="space-y-3">
          {body.split('\n\n').map((para) => (
            <p key={para.slice(0, 40)} className="text-[var(--text-muted)] leading-relaxed text-[15px]">
              {para}
            </p>
          ))}
        </div>
      </div>
    </Reveal>
  )
}

function MatrixTable() {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse min-w-[720px]" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '40%' }} />
          {TOOL_COLS.map((col) => (
            <col key={col.key} style={{ width: `${60 / TOOL_COLS.length}%` }} />
          ))}
        </colgroup>

        {/* Header */}
        <thead>
          <tr>
            <th className="text-left pb-4 pr-4">
              <span className="text-[11px] font-mono font-medium text-[var(--text-faint)] uppercase tracking-widest">
                feature
              </span>
            </th>
            {TOOL_COLS.map((col) => (
              <th key={col.key} className="pb-4 px-2 text-center">
                {col.isGs ? (
                  <span
                    className="inline-flex font-mono text-sm font-bold px-3 py-1.5 rounded-md"
                    style={{
                      background: 'linear-gradient(135deg, rgba(45,212,191,0.18), rgba(99,102,241,0.16))',
                      border: '1px solid rgba(45,212,191,0.4)',
                      color: '#2DD4BF',
                      boxShadow: '0 0 20px rgba(45,212,191,0.18)',
                    }}
                  >
                    {col.label}
                  </span>
                ) : (
                  <span className="font-mono text-xs font-medium text-[var(--text-faint)]">
                    {col.label}
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr aria-hidden="true">
            <td colSpan={TOOL_COLS.length + 1}>
              <div className="h-px w-full bg-gradient-to-r from-[#2DD4BF]/30 via-[var(--border)] to-transparent mb-1" />
            </td>
          </tr>
        </thead>

        {/* Rows */}
        <tbody>
          {ROWS.map((row) => {
            const Icon = row.icon
            return (
              <tr
                key={row.feature}
                className="group border-b border-[var(--border)] last:border-0 transition-colors duration-150"
              >
                {/* Feature label */}
                <td className="py-3.5 pr-4 align-top group-hover:bg-[var(--bg-surface2)]/40 transition-colors duration-150">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-md bg-[var(--bg-surface3)] text-[var(--text-muted)] shrink-0 group-hover:text-[var(--brand-teal)] transition-colors duration-150">
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium text-[var(--text-dim)] font-display leading-snug">
                        {row.feature}
                      </span>
                      <span className="text-[12px] text-[var(--text-faint)] leading-relaxed hidden sm:block">
                        {row.detail}
                      </span>
                    </div>
                  </div>
                </td>

                {/* Value cells */}
                {TOOL_COLS.map((col) => (
                  <td
                    key={col.key}
                    className={[
                      'py-3.5 px-2 text-center align-middle transition-colors duration-150',
                      col.isGs
                        ? 'bg-[#2DD4BF]/[0.035] group-hover:bg-[#2DD4BF]/[0.07]'
                        : 'group-hover:bg-[var(--bg-surface2)]/40',
                    ].join(' ')}
                  >
                    <Cell value={row[col.key]} isGs={col.isGs} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>

        {/* Footer legend */}
        <tfoot>
          <tr>
            <td colSpan={TOOL_COLS.length + 1} className="pt-5 pb-1">
              <div className="flex flex-wrap items-center gap-5 text-[11px] font-mono text-[var(--text-faint)]">
                <span className="flex items-center gap-1.5">
                  <Check size={13} strokeWidth={3} className="text-[#2DD4BF]" /> full support
                </span>
                <span className="flex items-center gap-1.5">
                  <Minus size={13} strokeWidth={3} className="text-yellow-400/80" /> partial / plugin
                </span>
                <span className="flex items-center gap-1.5">
                  <X size={13} strokeWidth={2.5} className="text-[var(--text-faint)]/60" /> not supported
                </span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function WinCountBanner() {
  const gsWins = ROWS.filter((r) => r.gitstate === true).length
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-[#2DD4BF]/20 px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.06) 0%, rgba(99,102,241,0.04) 100%)' }}
    >
      <Glow variant="teal" size={300} className="-top-10 -left-10" />
      <div className="flex-1 relative z-10">
        <p className="text-sm font-mono text-[var(--text-muted)] leading-relaxed">
          gitstate wins{' '}
          <span className="text-[#2DD4BF] font-bold">
            {gsWins}/{ROWS.length}
          </span>{' '}
          categories above — not by checking more boxes, but because the categories didn't exist before git
          became the source of truth.
        </p>
      </div>
      <Pill color="teal" className="shrink-0 text-xs relative z-10">
        git-derived
      </Pill>
    </div>
  )
}

// ── CTA block ────────────────────────────────────────────────────────────────

function CtaBlock() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[var(--border2)] grain"
      style={{ background: 'var(--bg-surface)' }}
    >
      <Glow variant="brand" size={500} className="top-1/2 left-1/2" />
      <div className="relative z-10 px-8 py-12 text-center">
        <Reveal>
          <div className="inline-flex flex-wrap items-center justify-center gap-2 mb-5">
            <Badge color="teal">open source · AGPL-3.0</Badge>
            <Badge color="indigo">free stakeholder seats</Badge>
          </div>
        </Reveal>
        <Reveal delay={0.08}>
          <GradientText as="h2" className="font-display text-3xl md:text-4xl font-bold mb-3 tracking-tight">
            Stop maintaining the fiction.
          </GradientText>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="text-[var(--text-muted)] max-w-md mx-auto mb-8 text-[15px] leading-relaxed">
            Connect your repos and let git tell the truth. No ticket migrations, no sprint ceremonies, no
            reconstructed timesheets.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/signup"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm text-[#0B1120] transition-all duration-150 hover:opacity-90 hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
            >
              Start for free
              <ArrowRight size={15} strokeWidth={2.5} />
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-[var(--text-dim)] border border-[var(--border)] hover:border-[var(--border2)] hover:text-[var(--text)] transition-all duration-150"
            >
              See pricing
            </Link>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

// ── Structural blockers callout ───────────────────────────────────────────────

const BLOCKERS = [
  {
    tool: 'Jira / ClickUp',
    reason: 'Per-seat pricing on every viewer. Free stakeholder access destroys their revenue model.',
    icon: Lock,
  },
  {
    tool: 'Linear',
    reason: 'Ticket is the atom of truth. Replacing it with a git event invalidates their entire data model.',
    icon: Layers,
  },
  {
    tool: 'ZenHub',
    reason: 'GitHub-only; no GitLab. Derived state is additive, not foundational — tickets still own status.',
    icon: GitBranch,
  },
]

function BlockersSection() {
  return (
    <RevealList className="grid grid-cols-1 md:grid-cols-3 gap-4" staggerDelay={0.07} inView>
      {BLOCKERS.map((b) => {
        const Icon = b.icon
        return (
          <Card key={b.tool} padding="lg" hoverable>
            <div className="flex flex-col gap-3 h-full">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-500/10 text-red-400/80 shrink-0">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="font-mono text-xs font-medium text-[var(--text-faint)] uppercase tracking-widest">
                  {b.tool}
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed flex-1">{b.reason}</p>
              <Badge color="red" className="self-start inline-flex items-center gap-1">
                <ShieldOff size={11} strokeWidth={2.5} /> won't fix
              </Badge>
            </div>
          </Card>
        )
      })}
    </RevealList>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Compare() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">

      {/* ── Hero ── */}
      <Section py="xl">
        <Container size="lg">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] px-6 md:px-12 py-16 text-center grain">
            <Glow variant="teal" size={700} className="top-0 left-1/3" />
            <Glow variant="indigo" size={500} className="bottom-0 right-1/4" />

            <div className="relative z-10">
              <Reveal>
                <div className="inline-flex items-center gap-2 mb-6">
                  <Pill color="teal">honest comparison</Pill>
                </div>
              </Reveal>

              <Reveal delay={0.08}>
                <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 leading-[1.08]">
                  <span className="text-[var(--text)]">Your tracker is a</span>{' '}
                  <GradientText>manually-maintained fiction</GradientText>{' '}
                  <span className="text-[var(--text)]">next to git.</span>
                </h1>
              </Reveal>

              <Reveal delay={0.15}>
                <p className="text-[var(--text-muted)] text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mt-4">
                  Jira, Linear, ClickUp, and ZenHub store a copy of your reality. gitstate reads the original —
                  the git object graph — and derives state, effort, and invoices from it.
                </p>
              </Reveal>

              <Reveal delay={0.22}>
                <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm text-[#0B1120] transition-all duration-150 hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
                  >
                    Start for free
                    <ArrowRight size={15} strokeWidth={2.5} />
                  </Link>
                  <Link
                    to="/pricing"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium text-sm text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border2)] hover:text-[var(--text)] transition-all duration-150"
                  >
                    View pricing
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Product shot anchor ── */}
      <Section py="sm">
        <Container size="lg">
          <Reveal inView delay={0.05}>
            <div className="relative">
              <Glow variant="brand" size={600} className="top-1/4 left-1/2" />
              <div className="relative z-10">
                <BrowserFrame src="/shots/board.png" alt="gitstate board — state derived from git" url="app.gitstate.dev/board" />
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ── Feature matrix ── */}
      <Section py="lg">
        <Container size="lg">
          <Reveal inView>
            <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
              <div>
                <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--text)] tracking-tight">
                  Feature comparison
                </h2>
                <p className="text-[var(--text-muted)] text-sm mt-1.5">
                  Across the dimensions that matter to teams building real software.
                </p>
              </div>
              <Badge color="teal" className="shrink-0">
                9 categories · 5 tools
              </Badge>
            </div>
          </Reveal>

          <Reveal inView delay={0.06}>
            <div className="relative">
              {/* glow behind the highlighted gitstate column */}
              <div
                className="absolute inset-y-0 pointer-events-none z-0 hidden md:block"
                style={{
                  left: '40%',
                  width: '12%',
                  background:
                    'linear-gradient(to bottom, rgba(45,212,191,0.10), rgba(99,102,241,0.05) 60%, transparent)',
                  filter: 'blur(8px)',
                }}
                aria-hidden="true"
              />
              <Card padding="none" className="overflow-hidden relative z-10">
                <div className="px-6 py-5 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-faint)]">
                    <span
                      className="px-2 py-0.5 rounded font-semibold"
                      style={{
                        background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(99,102,241,0.12))',
                        color: '#2DD4BF',
                        border: '1px solid rgba(45,212,191,0.25)',
                      }}
                    >
                      gitstate
                    </span>
                    <span className="text-[var(--border2)]">vs</span>
                    {['Jira', 'Linear', 'ClickUp', 'ZenHub'].map((t) => (
                      <span key={t} className="text-[var(--text-faint)]">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="px-6 pb-4 pt-2">
                  <MatrixTable />
                </div>
              </Card>
            </div>
          </Reveal>

          <Reveal inView delay={0.12} className="mt-4">
            <WinCountBanner />
          </Reveal>
        </Container>
      </Section>

      {/* ── Narrative: the problem ── */}
      <Section py="lg">
        <Container size="md">
          <Reveal inView>
            <div className="mb-3">
              <Badge color="default" className="mb-4">
                the honest case
              </Badge>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--text)] tracking-tight">
                Why the comparison isn't close
              </h2>
            </div>
          </Reveal>

          <div className="mt-10 space-y-12 pl-6 border-l border-[var(--border)]">
            {NARRATIVES.map((n, i) => (
              <NarrativeSection key={i} heading={n.heading} body={n.body} index={i} />
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Structural blockers ── */}
      <Section py="lg">
        <Container size="lg">
          <Reveal inView>
            <div className="mb-8 text-center">
              <Badge color="red" className="mb-4">
                won't because structurally blocked
              </Badge>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-[var(--text)] tracking-tight">
                They can't copy it — and here's why
              </h2>
              <p className="text-[var(--text-muted)] text-sm mt-2 max-w-lg mx-auto leading-relaxed">
                Each incumbent is blocked by its own business model, not by engineering ambition.
              </p>
            </div>
          </Reveal>
          <BlockersSection />
        </Container>
      </Section>

      {/* ── Quick-reference pills ── */}
      <Section py="md">
        <Container size="lg">
          <Reveal inView>
            <Card padding="lg">
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-xs font-mono text-[var(--text-faint)] uppercase tracking-widest mr-2">
                  gitstate only →
                </span>
                {[
                  { label: 'git-derived state', color: 'teal' },
                  { label: 'diff-read effort', color: 'teal' },
                  { label: 'evidence invoicing', color: 'teal' },
                  { label: 'free stakeholder seats', color: 'teal' },
                  { label: 'open source', color: 'teal' },
                  { label: 'agent-native', color: 'indigo' },
                  { label: 'NL→report', color: 'indigo' },
                  { label: 'GitHub + GitLab', color: 'indigo' },
                ].map((item) => (
                  <Badge key={item.label} color={item.color}>
                    {item.label}
                  </Badge>
                ))}
              </div>
            </Card>
          </Reveal>
        </Container>
      </Section>

      {/* ── CTA ── */}
      <Section py="xl">
        <Container size="md">
          <CtaBlock />
        </Container>
      </Section>
    </div>
  )
}
