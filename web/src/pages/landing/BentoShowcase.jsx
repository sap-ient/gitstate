/**
 * BentoShowcase — an image-dense bento grid weaving several real product shots
 * at varied sizes. Each cell is a framed, cropped screenshot with a short value
 * line, a lucide icon, hover lift, and ambient accent glow. Adds visual rhythm
 * and screenshot density between the tabbed gallery and the alternating rows.
 */
import {
  LayoutDashboard,
  Kanban,
  Users2,
  Settings2,
  GitBranch,
  BookOpen,
} from 'lucide-react'
import { Reveal } from '../../components/Reveal.jsx'
import {
  GradientText,
  Glow,
  Section,
  Container,
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

/* ── A single bento cell: framed screenshot + caption ────────────────────── */
function BentoCell({ cell }) {
  const Icon = cell.icon
  return (
    <div
      className={[
        'group relative flex flex-col rounded-[16px] overflow-hidden transition-all duration-300 hover:-translate-y-1',
        cell.span ?? '',
      ].join(' ')}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-card)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `rgba(${cell.accentRgb},0.30)`
        e.currentTarget.style.boxShadow = `var(--shadow-card-hover), 0 0 36px rgba(${cell.accentRgb},0.08)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
      }}
    >
      {/* Caption — top */}
      <div className="relative z-20 flex items-center gap-2.5 px-5 pt-5 pb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(${cell.accentRgb},0.16) 0%, rgba(${cell.accentRgb},0.06) 100%)`,
            boxShadow: `inset 0 0 0 1px rgba(${cell.accentRgb},0.22)`,
            color: cell.accent,
          }}
        >
          <Icon size={15} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-[14px] font-semibold tracking-[-0.01em]" style={{ color: 'var(--text)' }}>
            {cell.title}
          </div>
          <div className="text-[12px] leading-snug" style={{ color: 'var(--text-muted)' }}>
            {cell.body}
          </div>
        </div>
      </div>

      {/* Screenshot — bleeds to the bottom edge, cropped via aspect container */}
      <div className="relative flex-1 mt-1 px-5 pb-0 min-h-0">
        {/* Accent glow behind the shot */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 80% 80% at 50% 120%, rgba(${cell.accentRgb},0.12) 0%, transparent 70%)`,
          }}
        />
        <div
          className="relative h-full rounded-t-[10px] overflow-hidden transition-transform duration-500 group-hover:scale-[1.015]"
          style={{
            border: '1px solid var(--border)',
            borderBottom: 'none',
            boxShadow: '0 -2px 24px rgba(0,0,0,0.25)',
          }}
        >
          <img
            src={cell.shot}
            alt={cell.alt}
            loading="lazy"
            draggable={false}
            className="w-full block select-none"
            style={{ objectFit: 'cover', objectPosition: cell.pos ?? 'top left' }}
          />
          {/* Top sheen */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-12 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent)' }}
          />
        </div>
      </div>
    </div>
  )
}

/* ── Bento layout — varied sizes, only real attractive shots ─────────────── */
const CELLS = [
  {
    icon: LayoutDashboard,
    title: 'Live dashboard',
    body: 'Throughput and status, always current.',
    shot: '/shots/dashboard.png',
    alt: 'gitstate dashboard',
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    span: 'lg:col-span-2 lg:row-span-2',
    pos: 'top left',
  },
  {
    icon: Kanban,
    title: 'Honest board',
    body: 'Git-derived + manual, clearly marked.',
    shot: '/shots/board.png',
    alt: 'gitstate board',
    accent: '#6366F1',
    accentRgb: '99,102,241',
    span: 'lg:col-span-2',
    pos: 'top left',
  },
  {
    icon: Users2,
    title: 'Free stakeholder seats',
    body: 'Clients & viewers never cost a seat.',
    shot: '/shots/members.png',
    alt: 'gitstate members',
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    span: 'lg:col-span-1',
    pos: 'top left',
  },
  {
    icon: GitBranch,
    title: 'Connected repos',
    body: 'GitHub & GitLab as one source.',
    shot: '/shots/repos.png',
    alt: 'gitstate repos',
    accent: '#6366F1',
    accentRgb: '99,102,241',
    span: 'lg:col-span-1',
    pos: 'top left',
  },
  {
    icon: Settings2,
    title: 'Workspace settings',
    body: 'Org, roles, and plan in one place.',
    shot: '/shots/settings.png',
    alt: 'gitstate settings',
    accent: '#2DD4BF',
    accentRgb: '45,212,191',
    span: 'lg:col-span-2',
    pos: 'top left',
  },
  {
    icon: BookOpen,
    title: 'Docs that ship with it',
    body: 'Self-host or cloud — fully documented.',
    shot: '/shots/docs.png',
    alt: 'gitstate docs',
    accent: '#6366F1',
    accentRgb: '99,102,241',
    span: 'lg:col-span-2',
    pos: 'top left',
  },
]

export default function BentoShowcase() {
  return (
    <Section py="xl" className="relative overflow-hidden border-t border-[var(--border)]">
      <Glow variant="indigo" size={700} className="top-[10%] right-[-8%] opacity-40" />
      <Glow variant="teal" size={600} className="bottom-[6%] left-[-8%] opacity-40" />

      <Container size="xl" className="relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <Reveal inView className="mb-4 flex justify-center">
            <SectionLabel>The whole surface</SectionLabel>
          </Reveal>
          <Reveal inView delay={0.06}>
            <h2 className="font-display text-3xl md:text-4xl lg:text-[2.75rem] font-semibold tracking-[-0.03em] leading-[1.1]">
              <span style={{ color: 'var(--text)' }}>More than a tracker. </span>
              <GradientText as="span" className="font-display text-3xl md:text-4xl lg:text-[2.75rem] font-semibold">
                A whole workspace.
              </GradientText>
            </h2>
          </Reveal>
          <Reveal inView delay={0.12}>
            <p className="mt-4 text-base md:text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              Board, metrics, members, repos, settings, docs — every screen built on the
              same git-derived foundation.
            </p>
          </Reveal>
        </div>

        {/* Bento grid — auto-rows give the tall hero cell room to breathe */}
        <Reveal inView delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:auto-rows-[210px]">
            {CELLS.map((cell) => (
              <BentoCell key={cell.title} cell={cell} />
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
