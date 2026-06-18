/**
 * Pricing page — "The Ledger" aesthetic
 *
 * Per-builder / stakeholders-free model + cost calculator.
 * Prices displayed via useCurrency().format(usd) — billed in USD,
 * charged in the user's selected currency at checkout.
 *
 * No nav / no footer — MarketingLayout provides the shell.
 */

import { useState, useEffect } from 'react'
import {
  Card, Button, Badge, Pill, GradientText, Section, Container, Glow, Stat,
} from '../components/ui'
import { Reveal, RevealList } from '../components/Reveal.jsx'
import { useCurrency } from '../lib/currency.jsx'
import { get } from '../lib/api.js'

// ── Plan ladder fallback (mirrors backend GET /api/plans) ────────────────────
// Used when the API is unavailable; keeps the UI functional offline.
const FALLBACK_PLANS = [
  { key: 'free',   name: 'Free',   usd: 0,   builders: 1,  maxConns: 5  },
  { key: 'hobby',  name: 'Hobby',  usd: 9,   builders: 3,  maxConns: 10 },
  { key: 'pro',    name: 'Pro',    usd: 39,  builders: 10, maxConns: 25 },
  { key: 'team',   name: 'Team',   usd: 199, builders: 30, maxConns: 50 },
  { key: 'scale',  name: 'Scale',  usd: 249, builders: 75, maxConns: 100},
  { key: 'ent',    name: 'Enterprise', usd: null, builders: null, maxConns: null },
]

// The recommended plan to highlight
const RECOMMENDED_KEY = 'pro'

// LLM usage tiers for the calculator hints (USD / month)
// These are rough estimates — BYOK is recommended above $100/mo
const LLM_BYOK_THRESHOLD = 100

// ── Plan feature sets ─────────────────────────────────────────────────────────
const PLAN_FEATURES = {
  free:  ['1 builder seat', 'Unlimited stakeholders', 'Up to 3 repos', 'Community support', '5 concurrent connections'],
  hobby: ['3 builder seats', 'Unlimited stakeholders', 'Up to 20 repos', 'Email support', '10 concurrent connections'],
  pro:   ['10 builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Priority support', '25 concurrent connections', 'AI code insights', 'BYOK (bring your own key)'],
  team:  ['30 builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Slack support', '50 concurrent connections', 'AI code insights', 'BYOK', 'Org SSO'],
  scale: ['75 builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Dedicated support', '100 concurrent connections', 'AI code insights', 'BYOK', 'Org SSO', 'SLA'],
  ent:   ['Unlimited builder seats', 'Unlimited stakeholders', 'Unlimited repos', 'Dedicated CSM', 'Custom connections', 'AI code insights', 'BYOK', 'Custom SSO', 'Custom SLA', 'On-premise option'],
}

// ── Calculator logic ──────────────────────────────────────────────────────────
/**
 * Given a builder count, pick the cheapest plan that fits.
 * Enterprise (null builders) always fits everything.
 *
 * @param {number} builders - number of builder seats needed
 * @param {Array}  plans    - plan ladder from API
 * @returns {object|null}   matching plan or null if none found
 */
function pickPlan(builders, plans) {
  // Sort by usd ascending (null = enterprise = last)
  const sorted = [...plans].sort((a, b) => {
    if (a.usd === null) return 1
    if (b.usd === null) return -1
    return a.usd - b.usd
  })
  // Return first plan whose builder count >= requested
  return sorted.find(p => p.builders === null || p.builders >= builders) ?? null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8.5l3.5 3.5 6.5-7" stroke="#2DD4BF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlanCard({ plan, recommended, format }) {
  const isEnt = plan.usd === null
  const isRec = recommended

  const features = PLAN_FEATURES[plan.key] ?? []

  return (
    <Card
      padding="lg"
      glow={isRec}
      className={[
        'relative flex flex-col gap-5 transition-all duration-200',
        isRec
          ? 'border-[#2DD4BF]/40 shadow-[0_0_40px_rgba(45,212,191,0.10)]'
          : 'hover:border-[var(--border2)]',
      ].join(' ')}
    >
      {/* Recommended badge */}
      {isRec && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge color="teal">Recommended</Badge>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">{plan.name}</h3>
          {plan.builders !== null ? (
            <p className="text-xs text-[var(--text-faint)] mt-0.5 font-mono">
              {plan.builders} builder {plan.builders === 1 ? 'seat' : 'seats'} · unlimited stakeholders
            </p>
          ) : (
            <p className="text-xs text-[var(--text-faint)] mt-0.5 font-mono">unlimited seats · unlimited stakeholders</p>
          )}
        </div>
        {plan.key !== 'free' && plan.key !== 'ent' && (
          <Pill color={isRec ? 'teal' : 'default'}>{plan.key}</Pill>
        )}
      </div>

      {/* Price */}
      <div>
        {isEnt ? (
          <div className="flex flex-col gap-1">
            <span className="font-display text-3xl font-semibold text-[var(--text)]">Custom</span>
            <span className="text-xs text-[var(--text-faint)]">Contact us for volume pricing</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-1">
              <span className="font-display text-3xl font-semibold text-[var(--text)]">
                {format(plan.usd)}
              </span>
              <span className="text-sm text-[var(--text-muted)]">/ mo</span>
            </div>
            {plan.usd === 0 ? (
              <span className="text-xs text-[var(--text-faint)]">Free forever</span>
            ) : (
              <span className="text-xs text-[var(--text-faint)]">
                {format(plan.usd / plan.builders)} per builder seat
              </span>
            )}
          </div>
        )}
      </div>

      {/* CTA */}
      <Button
        variant={isRec ? 'primary' : 'outline'}
        size="md"
        className="w-full"
      >
        {isEnt ? 'Talk to sales' : plan.usd === 0 ? 'Get started free' : 'Start free trial'}
      </Button>

      {/* Feature list */}
      <ul className="flex flex-col gap-2 pt-1 border-t border-[var(--border)]">
        {features.map(feat => (
          <li key={feat} className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <CheckIcon />
            {feat}
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ── Calculator ─────────────────────────────────────────────────────────────────

function CostCalculator({ plans, format, currency }) {
  const [builders, setBuilders] = useState(5)
  const [llmUsd, setLlmUsd] = useState(0)

  // Pick plan by builder count (pure client-side math, mirrors plan ladder)
  const matched = pickPlan(builders, plans)

  // Cost per builder (undefined for enterprise)
  const monthlyUsd = matched?.usd ?? null
  const perBuilderUsd = (monthlyUsd !== null && builders > 0)
    ? monthlyUsd / builders
    : null

  // Total cost including estimated LLM passthrough (BYOK avoids this on Pro+)
  const byokEligible = matched && !['free', 'hobby'].includes(matched.key)
  // If BYOK-eligible and user would route via BYOK, LLM cost is direct (not marked up)
  const showByokHint = llmUsd > LLM_BYOK_THRESHOLD

  return (
    <Card padding="xl" glow className="relative overflow-hidden">
      <Glow variant="brand" size={500} className="top-0 left-1/2 opacity-40" />

      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-[var(--radius-badge)] bg-[#2DD4BF]/10 border border-[#2DD4BF]/25 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 1v14M1 8h14" stroke="#2DD4BF" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-[var(--text)]">Cost calculator</h3>
            <p className="text-xs text-[var(--text-faint)]">Estimate your monthly plan — math runs client-side</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Inputs */}
          <div className="flex flex-col gap-6">
            {/* Builder seats */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-widest text-[var(--text-faint)]">
                Builder seats
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={builders}
                  onChange={e => setBuilders(Number(e.target.value))}
                  className="flex-1 accent-[#2DD4BF] cursor-pointer"
                />
                <span className="font-mono text-sm font-semibold text-[var(--text)] w-8 text-right tabular-nums">
                  {builders}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-faint)]">
                Builders can push code, run agents, and manage repos.
                Stakeholders (read-only) are always free and unlimited.
              </p>
            </div>

            {/* LLM usage */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono uppercase tracking-widest text-[var(--text-faint)]">
                Est. LLM usage / month (USD)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={500}
                  step={10}
                  value={llmUsd}
                  onChange={e => setLlmUsd(Number(e.target.value))}
                  className="flex-1 accent-[#6366F1] cursor-pointer"
                />
                <span className="font-mono text-sm font-semibold text-[var(--text)] w-12 text-right tabular-nums">
                  ${llmUsd}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-faint)]">
                LLM token spend is the primary cost lever — more AI usage = higher bill.
              </p>
            </div>
          </div>

          {/* Output */}
          <div className="flex flex-col gap-4">
            {/* Matched plan */}
            <div
              className="rounded-[var(--radius-card)] border p-4 flex flex-col gap-3"
              style={{
                borderColor: matched?.key === RECOMMENDED_KEY ? 'rgba(45,212,191,0.3)' : 'var(--border)',
                background: 'var(--bg-surface2)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-faint)]">
                  Best fit plan
                </span>
                {matched && <Badge color={matched.key === RECOMMENDED_KEY ? 'teal' : 'default'}>{matched.name}</Badge>}
              </div>

              {matched ? (
                <>
                  {monthlyUsd !== null ? (
                    <div className="flex flex-col gap-1">
                      <span className="font-display text-2xl font-semibold text-[var(--text)] tabular-nums">
                        {format(monthlyUsd)}
                        <span className="text-sm font-normal text-[var(--text-muted)] ml-1">/ mo</span>
                      </span>
                      {perBuilderUsd !== null && (
                        <span className="text-xs text-[var(--text-faint)]">
                          {format(perBuilderUsd)} per builder · unlimited stakeholders free
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="font-display text-2xl font-semibold text-[var(--text)]">Custom pricing</span>
                  )}

                  {/* Seat breakdown */}
                  <div className="flex items-center gap-2 text-xs text-[var(--text-faint)] font-mono pt-1 border-t border-[var(--border)]">
                    <span className="text-[#2DD4BF]">{builders}</span> builders
                    <span className="text-[var(--border2)]">·</span>
                    <span className="text-[var(--text-faint)]">∞ stakeholders</span>
                    <span className="text-[var(--border2)]">·</span>
                    <span>{matched.builders !== null ? `${matched.builders} seat capacity` : 'unlimited seats'}</span>
                  </div>
                </>
              ) : (
                <span className="text-sm text-[var(--text-muted)]">No plan found</span>
              )}
            </div>

            {/* LLM cost note */}
            {llmUsd > 0 && (
              <div
                className="rounded-[var(--radius-badge)] border px-3 py-2.5 text-xs leading-relaxed"
                style={{
                  borderColor: showByokHint ? 'rgba(99,102,241,0.3)' : 'var(--border)',
                  background: showByokHint ? 'rgba(99,102,241,0.06)' : 'var(--bg-surface2)',
                }}
              >
                {showByokHint ? (
                  <span className="text-[#818cf8]">
                    At ${llmUsd}/mo LLM spend, <strong>BYOK</strong> (bring your own API key) saves significantly.
                    Available on {byokEligible ? matched.name : 'Pro+'} — route LLM calls directly to your provider.
                  </span>
                ) : (
                  <span className="text-[var(--text-faint)]">
                    ${llmUsd}/mo in LLM usage is modest — standard plan token budget covers this comfortably.
                    Pro+ plans include BYOK for direct provider routing.
                  </span>
                )}
              </div>
            )}

            {/* Currency note */}
            <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
              Billed in <span className="font-mono text-[var(--text-muted)]">USD</span> · charged in{' '}
              <span className="font-mono text-[var(--text-muted)]">{currency.code}</span> at checkout
              using the live exchange rate at time of payment.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── FAQ ────────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: 'What is a "builder"?',
    a: 'A builder is any team member who writes code, runs AI agents, manages repositories, or configures integrations. Builders consume seat licences. Product managers, designers, and executives who only read dashboards and reports are stakeholders — always free and unlimited on every plan.',
  },
  {
    q: 'Why is it billed in USD but charged in my local currency?',
    a: 'gitstate prices all plans in USD so you get consistent, predictable pricing regardless of where you are. At checkout your card is charged in your local currency (ZAR, GBP, EUR, …) at the live exchange rate from your payment processor. The display prices here are indicative — your bank statement shows the local-currency amount.',
  },
  {
    q: 'Can I self-host gitstate?',
    a: 'Yes. gitstate is open-source and self-hosting is free forever. You provide the infrastructure; there are no seat limits or feature gates on self-hosted deployments. The cloud plans fund ongoing development and add managed infra, support, and AI features on top.',
  },
  {
    q: 'How does LLM usage affect my bill?',
    a: 'AI features (code insights, automated summaries, agent runs) make API calls to large language models. On Hobby plans these are billed per-token through gitstate. On Pro and above you can bring your own API key (BYOK) and pay your LLM provider directly — often cheaper at volume. The calculator above shows when BYOK starts making sense.',
  },
  {
    q: 'Can I change plans mid-cycle?',
    a: 'Yes. Upgrades take effect immediately and are prorated. Downgrades take effect at the next billing cycle so you keep full access until the end of the period you paid for.',
  },
  {
    q: 'Is there a free trial for paid plans?',
    a: 'Every paid plan starts with a 14-day free trial. No credit card required to start. If you exceed the free plan limits during the trial period you\'ll be prompted to confirm a payment method — otherwise you auto-revert to Free.',
  },
]

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-[var(--border)] last:border-b-0">
      <button
        className="w-full flex items-center justify-between gap-4 py-4 text-left group"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-[var(--text)] group-hover:text-[#2DD4BF] transition-colors">
          {q}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden
          className={`shrink-0 text-[var(--text-faint)] transition-transform duration-200 ${open ? 'rotate-45' : ''}`}
        >
          <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <p className="text-sm text-[var(--text-muted)] leading-relaxed pb-4">
          {a}
        </p>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function Pricing() {
  const { format, currency } = useCurrency()
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    get('/api/plans')
      .then(data => {
        if (!cancelled) {
          setPlans(Array.isArray(data) && data.length > 0 ? data : FALLBACK_PLANS)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Graceful fallback — pricing page must always render
          setPlans(FALLBACK_PLANS)
          setError('Using cached plan data — some prices may be stale.')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ── Hero ── */}
      <Section py="2xl" className="relative overflow-hidden grain">
        <Glow variant="brand" size={700} className="top-0 left-1/2 opacity-60" />
        <Glow variant="indigo" size={400} className="top-1/2 right-0 opacity-30" />
        <Container size="lg" className="relative z-10 text-center">
          <Reveal>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Badge color="teal">Per builder</Badge>
              <Badge color="indigo">Stakeholders free</Badge>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <GradientText as="h1" className="font-display text-5xl md:text-6xl font-semibold leading-tight mb-4">
              Simple, honest pricing
            </GradientText>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="text-[var(--text-muted)] text-lg max-w-2xl mx-auto mb-2">
              Pay for the people who build. Everyone else reads for free.
            </p>
          </Reveal>
          <Reveal delay={0.22}>
            <p className="text-xs font-mono text-[var(--text-faint)]">
              Billed in USD · charged in {currency.code} at checkout · 14-day free trial on paid plans
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* ── Plan cards ── */}
      <Section py="lg">
        <Container size="xl">
          {error && (
            <div className="mb-6 px-4 py-3 rounded-[var(--radius-badge)] border border-yellow-500/20 bg-yellow-500/5 text-xs text-yellow-400 font-mono">
              {error}
            </div>
          )}

          {loading ? (
            /* Loading skeletons */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} padding="lg" className="animate-pulse">
                  <div className="h-5 w-24 rounded bg-[var(--bg-surface2)] mb-3" />
                  <div className="h-8 w-16 rounded bg-[var(--bg-surface2)] mb-6" />
                  <div className="h-9 w-full rounded-[var(--radius-btn)] bg-[var(--bg-surface2)] mb-5" />
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="h-3 w-full rounded bg-[var(--bg-surface2)] mb-2" />
                  ))}
                </Card>
              ))}
            </div>
          ) : (
            <RevealList
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
              staggerDelay={0.06}
              inView
            >
              {plans.map(plan => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  recommended={plan.key === RECOMMENDED_KEY}
                  format={format}
                />
              ))}
            </RevealList>
          )}

          {/* Currency note below cards */}
          <Reveal inView delay={0.1}>
            <p className="text-center text-[11px] font-mono text-[var(--text-faint)] mt-8">
              All prices shown in {currency.code} at indicative display rates.
              {' '}Billed in USD · charged in {currency.code} at the live rate at checkout.
            </p>
          </Reveal>
        </Container>
      </Section>

      {/* ── Builder / stakeholder wedge explainer ── */}
      <Section py="md">
        <Container size="lg">
          <Reveal inView>
            <div
              className="rounded-[var(--radius-card)] border border-[#2DD4BF]/20 p-6 md:p-8"
              style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.04) 0%, rgba(99,102,241,0.04) 100%)' }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                <div className="md:col-span-2">
                  <h2 className="font-display text-xl font-semibold text-[var(--text)] mb-2">
                    The builder / stakeholder model
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">
                    gitstate is priced on the people who <em>create</em>, not the people who <em>observe</em>.
                    Builders push code, run AI agents, and configure integrations — they consume a seat.
                    Stakeholders (PMs, execs, designers, clients) view dashboards, cycle-time reports, and
                    PR timelines in read-only mode — always free, always unlimited, on every plan.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge color="teal">Engineers → builder seats</Badge>
                    <Badge color="indigo">DevOps / platform → builder seats</Badge>
                    <Badge color="default">PMs → free stakeholders</Badge>
                    <Badge color="default">Execs → free stakeholders</Badge>
                    <Badge color="default">Clients → free stakeholders</Badge>
                  </div>
                </div>
                <div className="flex flex-col gap-4 justify-center">
                  <Stat
                    label="Avg builders per team"
                    value="4–8"
                    sublabel="rest are free stakeholders"
                  />
                  <Stat
                    label="Stakeholder cost"
                    value="$0"
                    sublabel="on every plan, forever"
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </Container>
      </Section>

      {/* ── Cost calculator ── */}
      <Section py="lg">
        <Container size="lg">
          <Reveal inView>
            <div className="mb-8 text-center">
              <h2 className="font-display text-2xl font-semibold text-[var(--text)] mb-2">
                Estimate your cost
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                The calculator picks the right plan by builder count and shows
                your real per-seat cost.
              </p>
            </div>
          </Reveal>
          <Reveal inView delay={0.1}>
            {!loading && (
              <CostCalculator plans={plans} format={format} currency={currency} />
            )}
          </Reveal>
        </Container>
      </Section>

      {/* ── FAQ ── */}
      <Section py="lg">
        <Container size="md">
          <Reveal inView>
            <div className="mb-8">
              <h2 className="font-display text-2xl font-semibold text-[var(--text)] mb-2">
                Frequently asked questions
              </h2>
              <p className="text-sm text-[var(--text-muted)]">
                Still unsure? <a href="mailto:hello@gitstate.dev" className="text-[#2DD4BF] hover:underline">Email us</a> — we respond same day.
              </p>
            </div>
          </Reveal>

          <Reveal inView delay={0.08}>
            <Card padding="none">
              <div className="px-6">
                {FAQ_ITEMS.map(item => (
                  <FaqItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </Card>
          </Reveal>
        </Container>
      </Section>

      {/* ── CTA strip ── */}
      <Section py="2xl" className="relative overflow-hidden">
        <Glow variant="teal" size={500} className="top-1/2 left-1/4 opacity-40" />
        <Glow variant="indigo" size={400} className="top-1/2 right-1/4 opacity-30" />
        <Container size="md" className="relative z-10 text-center">
          <Reveal inView>
            <GradientText as="h2" className="font-display text-3xl md:text-4xl font-semibold mb-4">
              Start for free today
            </GradientText>
            <p className="text-[var(--text-muted)] mb-8">
              No credit card. No seat minimum. Git is already your ledger.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" size="lg">Get started — it&apos;s free</Button>
              <Button variant="outline" size="lg">View self-host docs</Button>
            </div>
          </Reveal>
        </Container>
      </Section>
    </div>
  )
}
