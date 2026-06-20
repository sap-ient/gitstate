/**
 * Capabilities — alternating left/right image-vs-copy showcase.
 * Each capability gets its own BrowserFrame product screenshot, a lucide icon,
 * bold title, 1–2 sentences, and bullet sub-points. Ambient glows + Reveal stagger.
 */
import {
  LayoutDashboard,
  Kanban,
  GitMerge,
  Timer,
  Users,
  FolderGit2,
  UserRoundCheck,
} from 'lucide-react'
import { Reveal } from '../../components/Reveal.jsx'
import {
  GradientText,
  Glow,
  Section,
  Container,
  BrowserFrame,
} from '../../components/ui/index.js'

/* ── Section label ───────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--brand-teal)]">
      <span className="w-4 h-px bg-[var(--brand-teal)] opacity-60" aria-hidden="true" />
      {children}
      <span className="w-4 h-px bg-[var(--brand-teal)] opacity-60" aria-hidden="true" />
    </span>
  )
}

/* ── Capability data ──────────────────────────────────────────────────────── */
const CAPABILITIES = [
  {
    icon: LayoutDashboard,
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    glowVariant: 'teal',
    title: 'State derived from git.',
    subtitle: 'Git-derived dashboard',
    body: 'Every ticket status, every completion percentage — read straight from commits and PRs. There are no tickets to maintain because git is the ticket.',
    bullets: [
      'Board state updates the moment a branch merges',
      'Completion inferred from diff coverage, never a checkbox',
      'Zero manual input, zero stale data',
    ],
    shot: '/shots/dashboard.png',
    shotUrl: 'app.gitstate.dev/dashboard',
    shotAlt: 'gitstate dashboard — all state derived from git',
  },
  {
    icon: Kanban,
    accent: '#6366F1',
    accentRgb: '99,102,241',
    glowVariant: 'indigo',
    title: 'Two truth-modes, one board.',
    subtitle: 'Unified board',
    body: 'Some work lives in git. Some work doesn\'t. gitstate shows both honestly — git-derived items are marked as such, native items are yours to own.',
    bullets: [
      'Git-derived items auto-progress from PR state',
      'Native work items for non-code tasks, side-by-side',
      'No conflation — each item\'s provenance is explicit',
    ],
    shot: '/shots/board.png',
    shotUrl: 'app.gitstate.dev/board',
    shotAlt: 'gitstate board — git-derived and native work side by side',
  },
  {
    icon: GitMerge,
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    glowVariant: 'teal',
    title: 'GitHub + GitLab, unified.',
    subtitle: 'Multi-platform sync',
    body: 'Connect both platforms in under a minute. Issues sync two-way. PR state drives ticket progress automatically, across every repo you own.',
    bullets: [
      'OAuth connect — no webhook wiring required',
      'Issues linked, de-duped, and reconciled across platforms',
      'Branch → PR → merge drives full ticket lifecycle',
    ],
    shot: '/shots/repos.png',
    shotUrl: 'app.gitstate.dev/repos',
    shotAlt: 'gitstate repos — GitHub and GitLab connected together',
  },
  {
    icon: Timer,
    accent: '#6366F1',
    accentRgb: '99,102,241',
    glowVariant: 'indigo',
    title: 'DORA metrics from real data.',
    subtitle: 'Cycle time & lead time',
    body: 'Lead times and cycle times computed directly from git history — not self-reported estimates. No survey bias, no cherry-picking. DORA as it was meant to be.',
    bullets: [
      'Commit-to-deploy lead time, per team and per repo',
      'Cycle time histogram buckets across your actual history',
      'DORA four keys, continuously updated',
    ],
    shot: '/shots/cycle-time.png',
    shotUrl: 'app.gitstate.dev/metrics/cycle-time',
    shotAlt: 'gitstate cycle time — DORA metrics from git history',
  },
  {
    icon: Users,
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    glowVariant: 'teal',
    title: 'Involvement as texture.',
    subtitle: 'Contributor involvement',
    body: 'Authorship, review, and comment depth captured as distinct dimensions — never collapsed to a single score. Humans are not reducible to a number.',
    bullets: [
      'Author · reviewer · commenter tracked separately',
      'Review depth weighted by comment volume, not just approval',
      'Surface patterns, never rank individuals',
    ],
    shot: '/shots/involvement.png',
    shotUrl: 'app.gitstate.dev/involvement',
    shotAlt: 'gitstate involvement — multi-dimensional contributor view',
  },
  {
    icon: FolderGit2,
    accent: '#6366F1',
    accentRgb: '99,102,241',
    glowVariant: 'indigo',
    title: 'Projects, the way teams think.',
    subtitle: 'Projects & grouping',
    body: 'Group repos and issues into the projects you actually plan around — then slice the board, cycle time, and involvement by any of them in a click.',
    bullets: [
      'Bundle multiple repos under one project',
      'Filter every derived view by project',
      'Status rolls up from git, never from a checkbox',
    ],
    shot: '/shots/projects.png',
    shotUrl: 'app.gitstate.dev/projects',
    shotAlt: 'gitstate projects — group repos and issues, filter every view by project',
  },
  {
    icon: UserRoundCheck,
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    glowVariant: 'teal',
    title: 'Stakeholders are always free.',
    subtitle: 'Members & access',
    body: 'Pricing is per builder — the people who commit code. Clients, executives, and read-only reviewers get a seat at no cost, forever. No seat-tax on visibility.',
    bullets: [
      'Invite clients and viewers free — no seat cost',
      'Roles per member: owner, member, stakeholder',
      'Evidence-backed views your clients actually trust',
    ],
    shot: '/shots/members.png',
    shotUrl: 'app.gitstate.dev/members',
    shotAlt: 'gitstate members — free stakeholder seats with per-member roles',
  },
]

/* ── Single capability row ─────────────────────────────────────────────── */
function CapabilityRow({ cap, index }) {
  const isEven = index % 2 === 0
  const Icon = cap.icon

  return (
    <div className="relative">
      {/* Row ambient backdrop */}
      <div
        aria-hidden="true"
        className="absolute pointer-events-none inset-0"
        style={{
          background: isEven
            ? `radial-gradient(ellipse 60% 70% at 15% 50%, rgba(${cap.accentRgb},0.06) 0%, transparent 65%)`
            : `radial-gradient(ellipse 60% 70% at 85% 50%, rgba(${cap.accentRgb},0.06) 0%, transparent 65%)`,
        }}
      />

      <div
        className={[
          'relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16 items-center',
          'py-16 lg:py-20',
          index !== 0 ? 'border-t border-[var(--border)]' : '',
        ].join(' ')}
      >
        {/* Screenshot side */}
        <Reveal
          inView
          delay={0.05}
          className={[
            'relative w-full',
            isEven ? 'lg:order-1' : 'lg:order-2',
          ].join(' ')}
        >
          {/* Outer ambient halo behind the frame */}
          <div
            aria-hidden="true"
            className="absolute pointer-events-none z-0"
            style={{
              inset: '-40px -28px',
              background: `radial-gradient(ellipse 75% 60% at 50% 50%, rgba(${cap.accentRgb},0.14) 0%, rgba(${cap.accentRgb},0.04) 45%, transparent 70%)`,
              filter: 'blur(2px)',
            }}
          />

          {/* Frame with hover lift */}
          <div
            className="relative z-10 transition-all duration-500 hover:-translate-y-1.5"
            style={{
              filter: `drop-shadow(0 28px 56px rgba(0,0,0,0.4)) drop-shadow(0 0 32px rgba(${cap.accentRgb},0.07))`,
            }}
          >
            <BrowserFrame
              src={cap.shot}
              alt={cap.shotAlt}
              url={cap.shotUrl}
            />
          </div>

          {/* Edge gradient fade toward copy column */}
          <div
            aria-hidden="true"
            className={[
              'absolute top-0 bottom-0 w-20 pointer-events-none z-20 hidden lg:block',
              isEven ? 'right-0 bg-gradient-to-l' : 'left-0 bg-gradient-to-r',
            ].join(' ')}
            style={{
              background: isEven
                ? `linear-gradient(to left, var(--bg) 0%, transparent 100%)`
                : `linear-gradient(to right, var(--bg) 0%, transparent 100%)`,
            }}
          />
        </Reveal>

        {/* Copy side */}
        <div
          className={[
            'flex flex-col gap-6',
            isEven ? 'lg:order-2' : 'lg:order-1',
          ].join(' ')}
        >
          {/* Icon + label */}
          <Reveal inView delay={0.0}>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: `linear-gradient(135deg, rgba(${cap.accentRgb},0.16) 0%, rgba(${cap.accentRgb},0.06) 100%)`,
                  boxShadow: `inset 0 0 0 1px rgba(${cap.accentRgb},0.22), 0 1px 4px rgba(0,0,0,0.2)`,
                  color: cap.accent,
                }}
              >
                <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <SectionLabel>{cap.subtitle}</SectionLabel>
            </div>
          </Reveal>

          {/* Title */}
          <Reveal inView delay={0.08}>
            <h3
              className="font-display text-2xl md:text-3xl font-semibold tracking-[-0.025em] leading-tight"
              style={{ color: 'var(--text)' }}
            >
              {cap.title}
            </h3>
          </Reveal>

          {/* Body */}
          <Reveal inView delay={0.13}>
            <p
              className="text-base md:text-[17px] leading-relaxed"
              style={{ color: 'var(--text-muted)' }}
            >
              {cap.body}
            </p>
          </Reveal>

          {/* Hairline accent rule */}
          <Reveal inView delay={0.16}>
            <div
              className="h-px w-20"
              style={{
                background: `linear-gradient(to right, rgba(${cap.accentRgb},0.5) 0%, transparent 100%)`,
              }}
              aria-hidden="true"
            />
          </Reveal>

          {/* Bullets */}
          <Reveal inView delay={0.20}>
            <ul className="flex flex-col gap-3">
              {cap.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  {/* Bullet dot */}
                  <span
                    className="mt-[6px] w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: cap.accent, boxShadow: `0 0 6px rgba(${cap.accentRgb},0.5)` }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--text-dim)' }}
                  >
                    {b}
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </div>
  )
}

/* ── Section ─────────────────────────────────────────────────────────────── */
export default function Capabilities() {
  return (
    <Section py="xl" className="relative overflow-hidden border-t border-[var(--border)]">
      {/* Background depth glows */}
      <Glow variant="teal"   size={800} className="top-[8%]  left-[-10%] opacity-40" />
      <Glow variant="indigo" size={700} className="top-[45%] right-[-8%] opacity-35" />
      <Glow variant="teal"   size={600} className="bottom-[5%] left-[30%] opacity-30" />

      {/* Faint vertical rule down the center on large screens */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 bottom-0 w-px pointer-events-none hidden xl:block"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, var(--border) 20%, var(--border) 80%, transparent 100%)',
          opacity: 0.25,
        }}
      />

      <Container size="lg" className="relative z-10">
        {/* Section header */}
        <Reveal inView className="text-center mb-4">
          <SectionLabel>Product walkthrough</SectionLabel>
        </Reveal>
        <Reveal inView delay={0.06}>
          <div className="text-center mb-3">
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] leading-[1.1]">
              <span style={{ color: 'var(--text)' }}>Everything, </span>
              <GradientText
                as="span"
                className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold"
              >
                derived.
              </GradientText>
            </h2>
          </div>
        </Reveal>
        <Reveal inView delay={0.12}>
          <p
            className="text-center text-base md:text-lg max-w-xl mx-auto mb-16"
            style={{ color: 'var(--text-muted)' }}
          >
            Seven capabilities. Zero manual updates. Every view reads from git — the only source of truth that doesn't lie.
          </p>
        </Reveal>

        {/* Capability rows */}
        <div>
          {CAPABILITIES.map((cap, i) => (
            <CapabilityRow key={cap.title} cap={cap} index={i} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
