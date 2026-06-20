/**
 * ShowcaseGallery — the interactive "see it live" centerpiece.
 *
 * A tabbed product gallery: a vertical list of capabilities on the left, a large
 * BrowserFrame on the right. Clicking (or auto-rotation) swaps the screenshot with
 * a crossfade. Each tab pairs a real product shot with a crisp value line and a
 * floating "derived" annotation chip. Image-rich, alive, reduced-motion-safe.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LayoutDashboard,
  Kanban,
  Timer,
  Users,
  FolderGit2,
  GitMerge,
  Trophy,
  Activity,
  Receipt,
  CalendarRange,
} from 'lucide-react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
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

/* ── Tab data — only real, attractive product shots ──────────────────────── */
const TABS = [
  {
    id: 'dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    value: 'Every number on this page came from a commit — not a status field.',
    chip: '0 tickets maintained',
    shot: '/shots/dashboard.png',
    url: 'app.gitstate.dev/dashboard',
    alt: 'gitstate dashboard — open, in-progress, done and throughput derived from git',
  },
  {
    id: 'board',
    icon: Kanban,
    label: 'Board',
    value: 'Git-derived and manual work, side by side — each item shows its source.',
    chip: 'two truth-modes',
    shot: '/shots/board.png',
    url: 'app.gitstate.dev/board',
    alt: 'gitstate board — git-derived and manual work items in one Kanban',
  },
  {
    id: 'contribution',
    icon: Trophy,
    label: 'Contribution',
    value: 'Multi-dimensional, evidence-backed contribution — gaming-resistant by design, never one number.',
    chip: 'blame-survival + SZZ',
    shot: '/shots/contribution.png',
    url: 'app.gitstate.dev/contribution',
    alt: 'gitstate contribution — six-dimension composite with radar, weighting and evidence drill-down',
  },
  {
    id: 'eng-health',
    icon: Activity,
    label: 'Eng Health',
    value: 'The full DORA four keys — change-failure from SZZ, plus bus-factor risk and tech-debt hotspots.',
    chip: 'real DORA',
    shot: '/shots/eng-health.png',
    url: 'app.gitstate.dev/eng-health',
    alt: 'gitstate engineering health — DORA metrics, bus-factor risk and tech-debt hotspots',
  },
  {
    id: 'invoices',
    icon: Receipt,
    label: 'Invoices',
    value: 'Client invoices generated from merged delivery — every line backed by a commit or PR.',
    chip: 'invoice from git',
    shot: '/shots/invoices.png',
    url: 'app.gitstate.dev/invoices',
    alt: 'gitstate invoices — client invoices derived from git effort with PR evidence',
  },
  {
    id: 'planning',
    icon: CalendarRange,
    label: 'Planning',
    value: 'Capacity minus leave, velocity and a sized backlog — a forecast you can defend.',
    chip: 'capacity-aware',
    shot: '/shots/planning.png',
    url: 'app.gitstate.dev/planning',
    alt: 'gitstate planning — weekly capacity timeline, velocity and projected completion',
  },
  {
    id: 'cycle-time',
    icon: Timer,
    label: 'Cycle Time',
    value: 'Lead time from PR open to merge — measured, never estimated.',
    chip: 'DORA from history',
    shot: '/shots/cycle-time.png',
    url: 'app.gitstate.dev/cycle-time',
    alt: 'gitstate cycle time — percentiles and per-PR lead-time chart from git history',
  },
  {
    id: 'involvement',
    icon: Users,
    label: 'Involvement',
    value: 'Features shipped and reviews done — texture across dimensions, never one score.',
    chip: 'no ranking',
    shot: '/shots/involvement.png',
    url: 'app.gitstate.dev/involvement',
    alt: 'gitstate involvement — contribution across multiple dimensions, no single score',
  },
  {
    id: 'projects',
    icon: FolderGit2,
    label: 'Projects',
    value: 'Group repos and issues into projects, then slice every view by them.',
    chip: 'repos + issues',
    shot: '/shots/projects.png',
    url: 'app.gitstate.dev/projects',
    alt: 'gitstate projects — group repos and issues, filter the board by project',
  },
  {
    id: 'repos',
    icon: GitMerge,
    label: 'Repos',
    value: 'Connect GitHub and GitLab in one place — the source of truth for state.',
    chip: 'GitHub + GitLab',
    shot: '/shots/repos.png',
    url: 'app.gitstate.dev/repos',
    alt: 'gitstate repos — GitHub and GitLab repositories connected as the source of truth',
  },
]

const ROTATE_MS = 5200

export default function ShowcaseGallery() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduce = useReducedMotion()
  const sectionRef = useRef(null)
  const inView = useInView(sectionRef, { margin: '-20%' })

  const tab = TABS[active]

  // Auto-rotate while in view and not interacted with.
  useEffect(() => {
    if (reduce || paused || !inView) return
    const t = setTimeout(() => setActive((i) => (i + 1) % TABS.length), ROTATE_MS)
    return () => clearTimeout(t)
  }, [active, paused, inView, reduce])

  const select = useCallback((i) => {
    setActive(i)
    setPaused(true)
  }, [])

  return (
    <Section
      id="showcase"
      py="2xl"
      className="relative overflow-hidden border-t border-[var(--border)]"
    >
      <div ref={sectionRef} aria-hidden="true" className="absolute inset-0 pointer-events-none" />

      {/* Ambient depth */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none ambient-brand opacity-70" />
      <Glow variant="teal" size={760} className="top-[6%] left-[-8%] opacity-50" />
      <Glow variant="indigo" size={680} className="bottom-[2%] right-[-6%] opacity-45" />

      <Container size="xl" className="relative z-10">
        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <Reveal inView className="mb-4 flex justify-center">
            <SectionLabel>See it live</SectionLabel>
          </Reveal>
          <Reveal inView delay={0.06}>
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] leading-[1.08]">
              <span style={{ color: 'var(--text)' }}>One product. </span>
              <GradientText as="span" className="font-display text-3xl md:text-4xl lg:text-5xl font-semibold">
                Every view derived.
              </GradientText>
            </h2>
          </Reveal>
          <Reveal inView delay={0.12}>
            <p className="mt-4 text-base md:text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              Click through the real app. Nothing here was typed into a form —
              it&apos;s all read straight from your commits and PRs.
            </p>
          </Reveal>
        </div>

        {/* Gallery grid */}
        <div className="grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-8 lg:gap-12 items-center">
          {/* LEFT — tab list */}
          <Reveal inView delay={0.1} className="lg:order-1">
            <div
              role="tablist"
              aria-label="Product views"
              className="flex flex-col gap-1.5"
            >
              {TABS.map((t, i) => {
                const Icon = t.icon
                const isActive = i === active
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => select(i)}
                    onMouseEnter={() => setPaused(true)}
                    className="group relative text-left rounded-[12px] px-4 py-3.5 transition-all duration-300 overflow-hidden"
                    style={{
                      background: isActive ? 'var(--bg-surface)' : 'transparent',
                      border: `1px solid ${isActive ? 'rgba(45,212,191,0.28)' : 'var(--border)'}`,
                      boxShadow: isActive
                        ? '0 8px 28px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(45,212,191,0.06)'
                        : 'none',
                    }}
                  >
                    {/* Active accent rail */}
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full transition-all duration-300"
                      style={{
                        height: isActive ? '60%' : '0%',
                        background: 'linear-gradient(to bottom, #2DD4BF, #6366F1)',
                        boxShadow: isActive ? '0 0 10px rgba(45,212,191,0.5)' : 'none',
                      }}
                    />
                    <div className="relative flex items-center gap-3">
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300"
                        style={{
                          background: isActive
                            ? 'linear-gradient(135deg, rgba(45,212,191,0.18) 0%, rgba(99,102,241,0.10) 100%)'
                            : 'var(--bg-surface2)',
                          boxShadow: isActive ? 'inset 0 0 0 1px rgba(45,212,191,0.22)' : 'inset 0 0 0 1px var(--border)',
                          color: isActive ? '#2DD4BF' : 'var(--text-muted)',
                        }}
                      >
                        <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className="font-display text-[15px] font-semibold tracking-[-0.01em] transition-colors duration-200"
                          style={{ color: isActive ? 'var(--text)' : 'var(--text-dim)' }}
                        >
                          {t.label}
                        </div>
                        {/* Value line — expands for the active tab */}
                        <div
                          className="grid transition-all duration-300"
                          style={{ gridTemplateRows: isActive ? '1fr' : '0fr' }}
                        >
                          <div className="overflow-hidden">
                            <p className="text-[12.5px] leading-snug pt-1" style={{ color: 'var(--text-muted)' }}>
                              {t.value}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Auto-rotate progress bar (active, not paused) */}
                    {isActive && !paused && !reduce && (
                      <motion.span
                        key={`progress-${active}`}
                        aria-hidden="true"
                        className="absolute bottom-0 left-0 h-[2px]"
                        style={{ background: 'linear-gradient(to right, #2DD4BF, #6366F1)' }}
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: ROTATE_MS / 1000, ease: 'linear' }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </Reveal>

          {/* RIGHT — big swapping frame */}
          <Reveal inView delay={0.14} className="lg:order-2 relative w-full">
            {/* Ambient halo behind the frame */}
            <div
              aria-hidden="true"
              className="absolute pointer-events-none"
              style={{
                inset: '-44px -32px',
                background:
                  'radial-gradient(ellipse 70% 58% at 50% 45%, rgba(45,212,191,0.14) 0%, rgba(99,102,241,0.10) 42%, transparent 72%)',
                filter: 'blur(2px)',
              }}
            />

            <div
              className="relative"
              style={{
                filter: 'drop-shadow(0 32px 64px rgba(0,0,0,0.42)) drop-shadow(0 0 40px rgba(45,212,191,0.07))',
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab.id}
                  initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.985, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.99, y: -6 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <BrowserFrame src={tab.shot} alt={tab.alt} url={tab.url} />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Floating annotation chip — swaps per tab */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`chip-${tab.id}`}
                className="hidden sm:flex absolute -bottom-4 -left-3 lg:-left-6 z-30 items-center gap-2 px-3.5 py-2 rounded-xl backdrop-blur-md"
                style={{
                  background: 'rgba(11,17,32,0.72)',
                  border: '1px solid rgba(45,212,191,0.22)',
                  boxShadow: '0 8px 28px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(45,212,191,0.06)',
                }}
                initial={reduce ? { opacity: 1 } : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                transition={{ duration: 0.3 }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--brand-teal)] opacity-70 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--brand-teal)]" />
                </span>
                <span className="text-[11px] font-mono font-medium text-[var(--brand-teal)] whitespace-nowrap">
                  {tab.chip}
                </span>
              </motion.div>
            </AnimatePresence>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
