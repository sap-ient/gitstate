/**
 * DerivedDemo — "The ticket was a side effect of the commit."
 *
 * Visceral side-by-side contrast:
 *   LEFT  — The old way: dull, gray, bureaucratic manual ticket update
 *   RIGHT — The gitstate way: alive, glowing, automated git-derived truth
 */
import {
  Clock,
  User,
  MessageSquare,
  ChevronRight,
  GitCommit,
  GitPullRequest,
  Zap,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { Reveal } from '../../components/Reveal.jsx'
import {
  GradientText,
  Section,
  Container,
  Glow,
  Badge,
} from '../../components/ui/index.js'

/* ── Section label ────────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em] text-[var(--brand-teal)] mb-4">
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
      {children}
      <span className="w-3 h-px bg-[var(--brand-teal)]" aria-hidden="true" />
    </span>
  )
}

/* ── Panel wrapper ────────────────────────────────────────────────────────── */
function Panel({ children, variant = 'old', className = '' }) {
  const isNew = variant === 'new'
  return (
    <div
      className={['relative rounded-[14px] overflow-hidden', className].join(' ')}
      style={{
        background: isNew ? 'var(--bg-surface)' : 'var(--bg-surface)',
        border: `1px solid ${isNew ? 'rgba(45,212,191,0.18)' : 'var(--border)'}`,
        boxShadow: isNew
          ? 'var(--shadow-float), 0 0 48px rgba(45,212,191,0.06), 0 0 0 1px rgba(45,212,191,0.06)'
          : 'var(--shadow-card)',
      }}
    >
      {/* Inset glow ring for the "new" panel */}
      {isNew && (
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[14px] pointer-events-none z-10"
          style={{
            background:
              'linear-gradient(135deg, rgba(45,212,191,0.08) 0%, rgba(99,102,241,0.05) 60%, transparent 100%)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            padding: '1px',
          }}
        />
      )}
      {children}
    </div>
  )
}

/* ── Panel header bar ─────────────────────────────────────────────────────── */
function PanelHeader({ label, variant = 'old' }) {
  const isNew = variant === 'new'
  return (
    <div
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{
        background: isNew ? 'rgba(45,212,191,0.05)' : 'var(--bg-surface2)',
        borderColor: isNew ? 'rgba(45,212,191,0.14)' : 'var(--border)',
      }}
    >
      <span
        className="text-[11px] font-mono font-semibold uppercase tracking-[0.12em]"
        style={{ color: isNew ? '#2DD4BF' : 'var(--text-faint)' }}
      >
        {label}
      </span>
      {isNew ? (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ background: 'rgba(45,212,191,0.10)', color: '#2DD4BF', border: '1px solid rgba(45,212,191,0.20)' }}>
          <Zap size={9} strokeWidth={2.2} aria-hidden="true" />
          automated
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-md" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.16)' }}>
          <Clock size={9} strokeWidth={2.2} aria-hidden="true" />
          manual
        </span>
      )}
    </div>
  )
}

/* ── LEFT panel: The old way ──────────────────────────────────────────────── */
function OldWayPanel() {
  return (
    <Panel variant="old" className="flex flex-col">
      <PanelHeader label="The old way" variant="old" />

      <div className="p-5 flex flex-col gap-4">
        {/* Ticket status update row */}
        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-[var(--text-faint)]">GS-418</span>
            <Badge color="default" className="text-[10px] opacity-60">In Progress</Badge>
          </div>
          <p className="text-[13px] font-medium text-[var(--text-dim)] leading-snug">
            Implement user authentication flow
          </p>
          {/* Status change chevron */}
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-faint)]">
            <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.14)' }}>In Progress</span>
            <ChevronRight size={11} aria-hidden="true" />
            <span className="px-2 py-0.5 rounded" style={{ background: 'rgba(234,179,8,0.08)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.14)' }}>In Review</span>
            <span className="ml-auto text-[10px] text-[var(--text-faint)]">manually</span>
          </div>
        </div>

        {/* Person leaving a comment */}
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold"
            style={{ background: 'rgba(100,116,139,0.15)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            aria-hidden="true"
          >
            <User size={12} />
          </div>
          <div className="flex-1 rounded-xl p-3" style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[12px] font-medium text-[var(--text-dim)]">alex</span>
              <span className="text-[10px] text-[var(--text-faint)]">· 4 hours ago</span>
            </div>
            <div className="flex items-start gap-1.5">
              <MessageSquare size={11} className="mt-0.5 shrink-0 text-[var(--text-faint)]" aria-hidden="true" />
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                Moved to In Review. Spent ~4.5h on this. Tagging @pm for sign-off.
              </p>
            </div>
          </div>
        </div>

        {/* Time log entry */}
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: 'var(--bg-surface2)', border: '1px solid var(--border)', opacity: 0.8 }}
        >
          <Clock size={13} className="text-[var(--text-faint)] shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-mono text-[var(--text-faint)] truncate">
              Time log: 4.5h — GS-418 — reconstructed from memory
            </p>
          </div>
          <AlertCircle size={12} className="shrink-0" style={{ color: '#f87171' }} aria-hidden="true" />
        </div>

        {/* Pain-point callout */}
        <div
          className="rounded-xl p-3 mt-1"
          style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}
        >
          <p className="text-[11px] font-mono text-[#f87171] leading-relaxed">
            ✗ Manual copy-paste from git to tracker<br />
            ✗ Effort guessed after the fact<br />
            ✗ Ticket drifts out of sync by morning
          </p>
        </div>
      </div>
    </Panel>
  )
}

/* ── RIGHT panel: The gitstate way ───────────────────────────────────────── */

const DIFF_LINES = [
  { type: 'meta',    text: 'commit a1b2c3d  feat(auth): implement JWT refresh flow' },
  { type: 'meta',    text: 'Author: alex <alex@example.com>  |  PR #312 → main' },
  { type: 'blank',   text: '' },
  { type: 'header',  text: '@@ -42,7 +42,24 @@ func (s *AuthService) Refresh(ctx context.Context, ...) {' },
  { type: 'del',     text: '-\t// TODO: implement token rotation' },
  { type: 'del',     text: '-\treturn nil, errors.New("not implemented")' },
  { type: 'add',     text: '+\ttoken, err := s.rotateToken(ctx, claims.Subject)' },
  { type: 'add',     text: '+\tif err != nil { return nil, fmt.Errorf("rotate: %w", err) }' },
  { type: 'add',     text: '+\ts.audit.Log(ctx, "token.rotated", claims.Subject)' },
  { type: 'add',     text: '+\treturn token, nil' },
  { type: 'ctx',     text: ' }' },
]

function DiffLine({ type, text }) {
  const styles = {
    meta:   { color: 'var(--text-faint)', paddingLeft: '0' },
    blank:  { color: 'transparent' },
    header: { color: '#818cf8', background: 'rgba(99,102,241,0.06)' },
    del:    { color: '#f87171', background: 'rgba(239,68,68,0.07)', borderLeft: '2px solid rgba(239,68,68,0.4)' },
    add:    { color: '#4ade80', background: 'rgba(34,197,94,0.07)',  borderLeft: '2px solid rgba(34,197,94,0.4)' },
    ctx:    { color: 'var(--text-faint)' },
  }
  return (
    <div
      className="px-3 py-[1px] text-[11px] font-mono leading-[1.8] whitespace-pre-wrap break-all"
      style={styles[type] ?? {}}
    >
      {text || ' '}
    </div>
  )
}

function NewWayPanel() {
  return (
    <Panel variant="new" className="flex flex-col">
      <PanelHeader label="The gitstate way" variant="new" />

      {/* Diff viewer */}
      <div
        className="border-b overflow-x-auto"
        style={{ borderColor: 'rgba(45,212,191,0.10)', background: 'rgba(0,0,0,0.18)' }}
      >
        <div className="py-2 min-w-0">
          {DIFF_LINES.map((line, i) => (
            <DiffLine key={i} type={line.type} text={line.text} />
          ))}
        </div>
      </div>

      {/* Auto-derived results */}
      <div className="p-5 flex flex-col gap-3">
        <p className="text-[11px] font-mono text-[var(--text-faint)] uppercase tracking-widest mb-1">
          derived automatically
        </p>

        {/* Status */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.14)' }}
        >
          <div className="flex items-center gap-2.5">
            <GitPullRequest size={13} style={{ color: '#2DD4BF' }} aria-hidden="true" />
            <span className="text-[12px] font-mono text-[var(--text-dim)]">Status</span>
          </div>
          <span className="text-[12px] font-mono font-semibold" style={{ color: '#2DD4BF' }}>
            In Review <ArrowRight size={10} className="inline" aria-hidden="true" /> auto-set from PR #312
          </span>
        </div>

        {/* Effort */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.14)' }}
        >
          <div className="flex items-center gap-2.5">
            <GitCommit size={13} style={{ color: '#818cf8' }} aria-hidden="true" />
            <span className="text-[12px] font-mono text-[var(--text-dim)]">Effort</span>
          </div>
          <span className="text-[12px] font-mono font-semibold" style={{ color: '#818cf8' }}>
            4.2d — LLM diff-difficulty sizing
          </span>
        </div>

        {/* Invoice line */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.14)' }}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={13} style={{ color: '#4ade80' }} aria-hidden="true" />
            <span className="text-[12px] font-mono text-[var(--text-dim)]">Invoice line</span>
          </div>
          <span className="text-[12px] font-mono font-semibold" style={{ color: '#4ade80' }}>
            $2,100 — evidenced: SHA a1b2c3d
          </span>
        </div>

        {/* Win callout */}
        <div
          className="rounded-xl p-3 mt-1"
          style={{ background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.12)' }}
        >
          <p className="text-[11px] font-mono leading-relaxed" style={{ color: '#2DD4BF' }}>
            ✓ Zero tickets touched by a human<br />
            ✓ Effort measured from the actual diff<br />
            ✓ Invoice linked to verifiable git evidence
          </p>
        </div>
      </div>
    </Panel>
  )
}

/* ── Main section ─────────────────────────────────────────────────────────── */
export default function DerivedDemo() {
  return (
    <Section id="derived-demo" py="xl" className="relative overflow-hidden border-t border-[var(--border)]">
      <Glow variant="brand" size={700} className="top-[40%] left-[45%]" />

      <Container size="lg" className="relative z-10">

        {/* Heading block */}
        <Reveal inView>
          <div className="text-center mb-12">
            <SectionLabel>Derived, not entered</SectionLabel>
            <h2 className="font-display text-3xl md:text-4xl lg:text-[2.75rem] font-semibold text-[var(--text)] tracking-[-0.025em] mb-4 max-w-2xl mx-auto">
              The ticket was a{' '}
              <GradientText as="span" className="font-display text-3xl md:text-4xl lg:text-[2.75rem] font-semibold">
                side effect of the commit.
              </GradientText>
            </h2>
            <p className="text-base md:text-lg text-[var(--text-muted)] max-w-lg mx-auto leading-relaxed">
              Every status update, every time log, every &ldquo;ping the team&rdquo; — all manual overhead
              that git already made redundant. gitstate reads the source of truth directly.
            </p>
          </div>
        </Reveal>

        {/* Side-by-side panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 items-start">

          {/* OLD WAY */}
          <Reveal inView delay={0.05} className="h-full">
            <div className="h-full flex flex-col">
              {/* Label above */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: '#f87171' }}
                  aria-hidden="true"
                />
                <span className="text-[12px] font-mono text-[var(--text-faint)] uppercase tracking-wider">
                  Manual, slow, drifts out of sync
                </span>
              </div>
              <div
                className="flex-1 rounded-[14px] overflow-hidden"
                style={{ filter: 'saturate(0.7) brightness(0.88)' }}
              >
                <OldWayPanel />
              </div>
            </div>
          </Reveal>

          {/* NEW WAY */}
          <Reveal inView delay={0.15} className="h-full">
            <div className="h-full flex flex-col">
              {/* Label above */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: '#2DD4BF', boxShadow: '0 0 6px rgba(45,212,191,0.6)' }}
                  aria-hidden="true"
                />
                <span className="text-[12px] font-mono uppercase tracking-wider" style={{ color: '#2DD4BF' }}>
                  Automated, accurate, always live
                </span>
              </div>
              <div className="flex-1">
                <NewWayPanel />
              </div>
            </div>
          </Reveal>
        </div>

        {/* Bottom copy */}
        <Reveal inView delay={0.25} className="mt-10 text-center">
          <p className="text-sm text-[var(--text-muted)] max-w-xl mx-auto leading-relaxed">
            Estimates are ~30% wrong and have been for 40 years. Velocity is gamed the moment it
            becomes a target. Timesheets are reconstructed from memory on Friday.{' '}
            <span className="text-[var(--text)] font-medium">Git is the real ledger.</span>
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}
