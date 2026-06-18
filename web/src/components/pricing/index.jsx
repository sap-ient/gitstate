/**
 * Pricing page helpers — "The Ledger" aesthetic.
 *
 * Premium plan cards, a refined cost calculator (steppers + sliders),
 * a comparison matrix and a CTA band. All theme-aware via design tokens,
 * lucide icons, currency-aware via the injected `format` fn.
 *
 * Only consumed by pages/Pricing.jsx.
 */
import { useState } from 'react'
import {
  Check, Minus, Plus, Users, Eye, KeyRound, Sparkles, ArrowRight,
  Infinity as InfinityIcon, Cpu, Calculator, Gauge, Server, Zap, ShieldCheck,
} from 'lucide-react'
import { Card, Button, Badge, Pill, Glow } from '../ui'

// ── Plan metadata (icon + tagline per tier) ─────────────────────────────────
const PLAN_META = {
  free:  { icon: Zap,    tagline: 'For solo builders & side projects' },
  hobby: { icon: Sparkles, tagline: 'For small teams getting started' },
  pro:   { icon: Gauge,  tagline: 'For growing engineering teams' },
  team:  { icon: Users,  tagline: 'For organisations that ship daily' },
  scale: { icon: Server, tagline: 'For high-velocity platform teams' },
  ent:   { icon: Cpu,    tagline: 'For regulated & on-prem deployments' },
}

const PLAN_FEATURES = {
  free:  ['1 builder seat', 'Unlimited stakeholders', 'Up to 3 repos', 'Community support', '5 concurrent connections'],
  hobby: ['3 builder seats', 'Unlimited stakeholders', 'Up to 20 repos', 'Email support', '10 concurrent connections'],
  pro:   ['10 builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Priority support', '25 concurrent connections', 'AI code insights', 'BYOK (bring your own key)'],
  team:  ['30 builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Slack support', '50 concurrent connections', 'AI code insights', 'BYOK', 'Org SSO'],
  scale: ['75 builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Dedicated support', '100 concurrent connections', 'AI code insights', 'BYOK', 'Org SSO', 'SLA'],
  ent:   ['Unlimited builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Dedicated CSM', 'Custom connections', 'AI code insights', 'BYOK', 'Custom SSO', 'Custom SLA', 'On-premise option'],
}

// ── Plan card ────────────────────────────────────────────────────────────────
export function PlanCard({ plan, recommended, format, billing = 'monthly' }) {
  const isEnt = plan.usd === null
  const isFree = plan.usd === 0
  const Icon = (PLAN_META[plan.key] ?? PLAN_META.pro).icon
  const tagline = (PLAN_META[plan.key] ?? {}).tagline
  const features = PLAN_FEATURES[plan.key] ?? []

  // Annual = 2 months free (10x monthly), shown as effective per-month.
  const annual = billing === 'annual'
  const effectiveUsd = annual && !isFree && !isEnt ? (plan.usd * 10) / 12 : plan.usd

  return (
    <Card
      padding="lg"
      glow={recommended}
      className={[
        'group relative flex flex-col gap-5 transition-all duration-300',
        recommended
          ? 'border-[#2DD4BF]/45 shadow-[0_0_0_1px_rgba(45,212,191,0.25),0_8px_40px_rgba(45,212,191,0.12),0_24px_64px_rgba(0,0,0,0.35)] lg:-translate-y-2'
          : 'hover:border-[var(--border2)] hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]',
      ].join(' ')}
    >
      {recommended && (
        <>
          {/* top accent rail */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #2DD4BF, #6366F1, transparent)' }}
          />
          <Glow variant="teal" size={260} className="-top-8 right-0 opacity-50 group-hover:opacity-70 transition-opacity" />
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider text-[#0B1120] shadow-[0_4px_14px_rgba(45,212,191,0.4)]"
              style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}>
              <Sparkles size={11} strokeWidth={2.5} /> Recommended
            </span>
          </div>
        </>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 relative z-[1]">
        <div className="flex items-start gap-3">
          <div
            className="mt-0.5 w-9 h-9 shrink-0 rounded-[var(--radius-badge)] flex items-center justify-center border"
            style={{
              background: recommended ? 'rgba(45,212,191,0.12)' : 'var(--bg-surface3)',
              borderColor: recommended ? 'rgba(45,212,191,0.3)' : 'var(--border)',
            }}
          >
            <Icon size={17} className={recommended ? 'text-[#2DD4BF]' : 'text-[var(--text-muted)]'} strokeWidth={1.8} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold text-[var(--text)] leading-none">{plan.name}</h3>
            <p className="text-[11px] text-[var(--text-faint)] mt-1.5">{tagline}</p>
          </div>
        </div>
        {plan.key !== 'free' && plan.key !== 'ent' && (
          <Pill color={recommended ? 'teal' : 'default'}>{plan.key}</Pill>
        )}
      </div>

      {/* Price */}
      <div className="relative z-[1]">
        {isEnt ? (
          <div className="flex flex-col gap-1">
            <span className="font-display text-[2rem] font-semibold text-[var(--text)] leading-none">Custom</span>
            <span className="text-xs text-[var(--text-faint)] mt-1.5">Volume & compliance pricing</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-1.5">
              <span className="font-display text-[2.4rem] font-semibold text-[var(--text)] leading-none tabular-nums">
                {format(effectiveUsd)}
              </span>
              <span className="text-sm text-[var(--text-muted)]">/ mo</span>
            </div>
            {isFree ? (
              <span className="text-xs text-[var(--text-faint)] mt-1.5">Free forever — no card required</span>
            ) : (
              <span className="text-xs text-[var(--text-faint)] mt-1.5">
                {format(effectiveUsd / plan.builders)} / builder
                {annual && <span className="text-[#2DD4BF] ml-1.5">· billed yearly</span>}
              </span>
            )}
          </div>
        )}
      </div>

      {/* CTA */}
      <Button
        variant={recommended ? 'primary' : 'outline'}
        size="md"
        className="w-full relative z-[1]"
        rightIcon={!isEnt && <ArrowRight size={15} />}
      >
        {isEnt ? 'Talk to sales' : isFree ? 'Get started free' : 'Start free trial'}
      </Button>

      {/* Feature list */}
      <ul className="flex flex-col gap-2.5 pt-4 mt-auto border-t border-[var(--border)] relative z-[1]">
        {features.map(feat => {
          const accent = feat.startsWith('Unlimited stakeholders')
          return (
            <li key={feat} className="flex items-start gap-2.5 text-[13px] text-[var(--text-dim)]">
              <span
                className="mt-px shrink-0 w-4 h-4 rounded-full flex items-center justify-center"
                style={{
                  background: accent ? 'rgba(99,102,241,0.14)' : 'rgba(45,212,191,0.12)',
                }}
              >
                {accent
                  ? <InfinityIcon size={11} className="text-[#818cf8]" strokeWidth={2.5} />
                  : <Check size={11} className="text-[#2DD4BF]" strokeWidth={3} />}
              </span>
              <span className={accent ? 'text-[var(--text)]' : ''}>{feat}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ── Stepper input (refined, lucide +/−) ──────────────────────────────────────
function Stepper({ value, min, max, step = 1, onChange }) {
  const dec = () => onChange(Math.max(min, value - step))
  const inc = () => onChange(Math.min(max, value + step))
  return (
    <div className="inline-flex items-center rounded-[var(--radius-btn)] border border-[var(--border2)] bg-[var(--bg-surface)] overflow-hidden">
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label="Decrease"
        className="w-9 h-9 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface2)] transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
      >
        <Minus size={15} strokeWidth={2.2} />
      </button>
      <span className="w-12 text-center font-mono text-sm font-semibold text-[var(--text)] tabular-nums border-x border-[var(--border)]">
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label="Increase"
        className="w-9 h-9 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface2)] transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
      >
        <Plus size={15} strokeWidth={2.2} />
      </button>
    </div>
  )
}

// styled range slider with a live fill track
function FillSlider({ value, min, max, step = 1, onChange, accent = '#2DD4BF' }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full h-1.5 rounded-full appearance-none cursor-pointer outline-none
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
        [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--slider-accent)]
        [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(0,0,0,0.4)] [&::-webkit-slider-thumb]:transition-transform
        [&::-webkit-slider-thumb]:hover:scale-110
        [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
        [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid
        [&::-moz-range-thumb]:border-[var(--slider-accent)]"
      style={{
        background: `linear-gradient(90deg, ${accent} ${pct}%, var(--bg-surface3) ${pct}%)`,
        '--slider-accent': accent,
      }}
    />
  )
}

/**
 * Cheapest plan that fits a given builder count.
 * Enterprise (null builders) fits everything.
 */
function pickPlan(builders, plans) {
  const sorted = [...plans].sort((a, b) => {
    if (a.usd === null) return 1
    if (b.usd === null) return -1
    return a.usd - b.usd
  })
  return sorted.find(p => p.builders === null || p.builders >= builders) ?? null
}

const LLM_BYOK_THRESHOLD = 100

// ── Cost calculator ──────────────────────────────────────────────────────────
export function CostCalculator({ plans, format, currency, recommendedKey }) {
  const [builders, setBuilders] = useState(8)
  const [stakeholders, setStakeholders] = useState(25)
  const [llmUsd, setLlmUsd] = useState(60)
  const [annual, setAnnual] = useState(false)

  const matched = pickPlan(builders, plans)
  const baseUsd = matched?.usd ?? null
  const effectiveUsd = baseUsd === null ? null : annual ? (baseUsd * 10) / 12 : baseUsd
  const perBuilderUsd = (effectiveUsd !== null && builders > 0) ? effectiveUsd / builders : null

  const byokEligible = matched && !['free', 'hobby'].includes(matched.key)
  const showByokHint = llmUsd > LLM_BYOK_THRESHOLD

  // Combined estimate: plan + (LLM only when not BYOK-routed)
  const llmBillable = showByokHint && byokEligible ? 0 : llmUsd
  const totalUsd = effectiveUsd === null ? null : effectiveUsd + llmBillable
  const savedAnnualUsd = baseUsd !== null && baseUsd > 0 ? baseUsd * 2 : 0

  const isRec = matched?.key === recommendedKey

  return (
    <Card padding="none" glow className="relative overflow-hidden border-[var(--border2)]">
      <Glow variant="brand" size={620} className="-top-20 left-1/3 opacity-50" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── Inputs ── */}
        <div className="p-6 md:p-8 flex flex-col gap-7 border-b lg:border-b-0 lg:border-r border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-badge)] bg-[#2DD4BF]/10 border border-[#2DD4BF]/25 flex items-center justify-center">
              <Calculator size={17} className="text-[#2DD4BF]" strokeWidth={1.8} />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold text-[var(--text)] leading-none">Cost calculator</h3>
              <p className="text-[11px] text-[var(--text-faint)] mt-1">Math runs client-side — nothing leaves your browser</p>
            </div>
          </div>

          {/* Builders */}
          <Field
            icon={<Users size={13} />}
            label="Builder seats"
            hint="People who push code, run agents & manage repos."
            control={<Stepper value={builders} min={1} max={100} onChange={setBuilders} />}
          >
            <FillSlider value={builders} min={1} max={100} onChange={setBuilders} accent="#2DD4BF" />
          </Field>

          {/* Stakeholders */}
          <Field
            icon={<Eye size={13} />}
            label="Stakeholders (read-only)"
            hint="PMs, execs, designers, clients — always free."
            control={
              <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-[#818cf8]">
                {stakeholders} <span className="text-[var(--text-faint)] font-normal">· {format(0)}</span>
              </span>
            }
          >
            <FillSlider value={stakeholders} min={0} max={200} step={5} onChange={setStakeholders} accent="#6366F1" />
          </Field>

          {/* LLM usage */}
          <Field
            icon={<Cpu size={13} />}
            label="Est. LLM usage / month"
            hint="Token spend for AI insights & agent runs."
            control={
              <span className="font-mono text-sm font-semibold text-[var(--text)] tabular-nums">
                {format(llmUsd)}
              </span>
            }
          >
            <FillSlider value={llmUsd} min={0} max={500} step={10} onChange={setLlmUsd} accent="#6366F1" />
          </Field>

          {/* Billing toggle */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Billing</span>
            <BillingToggle annual={annual} setAnnual={setAnnual} />
          </div>
        </div>

        {/* ── Output ── */}
        <div className="p-6 md:p-8 flex flex-col gap-4 bg-[var(--bg-surface)]/40">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Your estimate</span>
            {matched && (
              <Badge color={isRec ? 'teal' : 'default'}>
                {matched.name} plan
              </Badge>
            )}
          </div>

          {/* Big total */}
          <div
            className="rounded-[var(--radius-card)] border p-5 relative overflow-hidden"
            style={{
              borderColor: isRec ? 'rgba(45,212,191,0.3)' : 'var(--border2)',
              background: 'var(--bg-surface2)',
            }}
          >
            {isRec && <Glow variant="teal" size={200} className="top-0 right-0 opacity-40" />}
            {totalUsd !== null ? (
              <div className="relative z-[1] flex flex-col gap-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-4xl font-semibold text-[var(--text)] tabular-nums leading-none">
                    {format(totalUsd)}
                  </span>
                  <span className="text-sm text-[var(--text-muted)]">/ mo</span>
                </div>
                <p className="text-xs text-[var(--text-faint)]">
                  {format(effectiveUsd)} plan
                  {llmBillable > 0 && <> + {format(llmBillable)} LLM</>}
                  {perBuilderUsd !== null && <> · {format(perBuilderUsd)} / builder</>}
                </p>
              </div>
            ) : (
              <div className="relative z-[1] flex flex-col gap-1">
                <span className="font-display text-3xl font-semibold text-[var(--text)] leading-none">Custom</span>
                <p className="text-xs text-[var(--text-faint)]">Beyond 75 builders — let&apos;s talk volume pricing.</p>
              </div>
            )}
          </div>

          {/* Breakdown rows */}
          <div className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] text-[13px]">
            <Row label={<><Users size={13} className="text-[#2DD4BF]" /> {builders} builders</>}
              value={effectiveUsd === null ? 'Custom' : format(effectiveUsd)} />
            <Row label={<><Eye size={13} className="text-[#818cf8]" /> {stakeholders} stakeholders</>}
              value={<span className="text-[#818cf8]">Always free</span>} />
            <Row label={<><Cpu size={13} className="text-[var(--text-muted)]" /> LLM usage</>}
              value={llmBillable === 0
                ? <span className="text-[#2DD4BF]">{showByokHint ? 'BYOK · direct' : format(0)}</span>
                : format(llmBillable)} />
            {annual && savedAnnualUsd > 0 && (
              <Row label={<><Gauge size={13} className="text-[#2DD4BF]" /> Annual saving</>}
                value={<span className="text-[#2DD4BF]">−{format(savedAnnualUsd)} / yr</span>} />
            )}
          </div>

          {/* BYOK hint */}
          {llmUsd > 0 && (
            <div
              className="flex items-start gap-2.5 rounded-[var(--radius-badge)] border px-3.5 py-3 text-xs leading-relaxed"
              style={{
                borderColor: showByokHint ? 'rgba(99,102,241,0.3)' : 'var(--border)',
                background: showByokHint ? 'rgba(99,102,241,0.07)' : 'var(--bg-surface2)',
              }}
            >
              <KeyRound size={15} className={showByokHint ? 'text-[#818cf8] shrink-0 mt-0.5' : 'text-[var(--text-faint)] shrink-0 mt-0.5'} />
              {showByokHint ? (
                <span className="text-[var(--text-dim)]">
                  At {format(llmUsd)}/mo, <strong className="text-[#818cf8] font-semibold">BYOK</strong> pays off — route LLM calls
                  straight to your provider on {byokEligible ? matched.name : 'Pro+'}, billed at cost.
                </span>
              ) : (
                <span className="text-[var(--text-faint)]">
                  {format(llmUsd)}/mo is modest — your plan&apos;s token budget covers it. Pro+ adds BYOK for direct routing.
                </span>
              )}
            </div>
          )}

          <p className="text-[11px] text-[var(--text-faint)] leading-relaxed mt-auto">
            Billed in <span className="font-mono text-[var(--text-muted)]">USD</span> · charged in{' '}
            <span className="font-mono text-[var(--text-muted)]">{currency.code}</span> at the live rate at checkout.
          </p>
        </div>
      </div>
    </Card>
  )
}

function Field({ icon, label, hint, control, children }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-[var(--text-muted)]">
          <span className="text-[var(--text-faint)]">{icon}</span>
          {label}
        </label>
        {control}
      </div>
      {children}
      <p className="text-[11px] text-[var(--text-faint)]">{hint}</p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="flex items-center gap-2 text-[var(--text-muted)]">{label}</span>
      <span className="font-mono tabular-nums text-[var(--text-dim)]">{value}</span>
    </div>
  )
}

function BillingToggle({ annual, setAnnual }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[var(--border2)] bg-[var(--bg-surface)] p-0.5 text-xs font-medium">
      {[['Monthly', false], ['Annual', true]].map(([label, val]) => {
        const active = annual === val
        return (
          <button
            key={label}
            type="button"
            onClick={() => setAnnual(val)}
            className={[
              'relative px-3 py-1 rounded-full transition-colors cursor-pointer',
              active ? 'text-[#0B1120]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            ].join(' ')}
          >
            {active && (
              <span aria-hidden className="absolute inset-0 rounded-full"
                style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }} />
            )}
            <span className="relative z-[1] flex items-center gap-1">
              {label}
              {val && <span className={active ? 'text-[#0B1120]/70' : 'text-[#2DD4BF]'}>−17%</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Comparison matrix ────────────────────────────────────────────────────────
const COMPARE_ROWS = [
  { label: 'Builder seats',          icon: Users,      vals: ['1', '3', '10', '30', '∞'] },
  { label: 'Stakeholders',           icon: Eye,        vals: ['∞', '∞', '∞', '∞', '∞'], accent: true },
  { label: 'Repositories',           icon: Server,     vals: ['3', '20', '∞', '∞', '∞'] },
  { label: 'Concurrent connections', icon: Gauge,      vals: ['5', '10', '25', '50', 'Custom'] },
  { label: 'AI code insights',       icon: Sparkles,   vals: [false, false, true, true, true] },
  { label: 'BYOK (own LLM key)',     icon: KeyRound,   vals: [false, false, true, true, true] },
  { label: 'Org SSO',                icon: ShieldCheck, vals: [false, false, false, true, true] },
  { label: 'On-premise option',      icon: Cpu,        vals: [false, false, false, false, true] },
]

export function CompareTable({ columns, recommendedKey }) {
  // columns: [{ key, name }] up to 5 (free,hobby,pro,team,ent shown)
  return (
    <Card padding="none" className="overflow-hidden border-[var(--border2)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left font-normal px-5 py-4 text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
                Feature
              </th>
              {columns.map(col => {
                const rec = col.key === recommendedKey
                return (
                  <th key={col.key}
                    className="px-4 py-4 text-center"
                    style={rec ? { background: 'rgba(45,212,191,0.05)' } : undefined}>
                    <span className={['font-display text-sm font-semibold', rec ? 'text-[#2DD4BF]' : 'text-[var(--text)]'].join(' ')}>
                      {col.name}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map(row => {
              const Icon = row.icon
              return (
                <tr key={row.label} className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-surface2)]/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-2.5 text-[var(--text-dim)]">
                      <Icon size={14} className="text-[var(--text-faint)] shrink-0" strokeWidth={1.8} />
                      {row.label}
                    </span>
                  </td>
                  {row.vals.map((v, ci) => {
                    const rec = columns[ci]?.key === recommendedKey
                    return (
                      <td key={ci}
                        className="px-4 py-3.5 text-center"
                        style={rec ? { background: 'rgba(45,212,191,0.04)' } : undefined}>
                        {typeof v === 'boolean'
                          ? (v
                              ? <Check size={16} className="inline text-[#2DD4BF]" strokeWidth={2.5} />
                              : <Minus size={14} className="inline text-[var(--text-faint)]/50" />)
                          : <span className={['font-mono text-sm tabular-nums',
                              row.accent ? 'text-[#818cf8]' : 'text-[var(--text-dim)]'].join(' ')}>{v}</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
