/**
 * EngHealth — the Engineering Health dashboard. Route: /eng-health
 *
 * Surfaces data gitstate already computes (no new integrations):
 *   • DORA-style metric row — hero CHANGE FAILURE RATE (real, SZZ-powered),
 *     lead-time p50/p90 (real), deploy-frequency (honest merge-based proxy),
 *     MTTR (honest needs-CI placeholder), change-failure-over-time chart.
 *   • Review-health panel — latency, %-without-review (proxy), reviewer load.
 *   • Bus-factor / truck-factor risk — the "if X leaves…" view.
 *   • Tech-debt hotspots table — churn × SZZ bug density × low test coupling.
 *
 * All charts hand-rolled SVG. Loading / empty / error states. Both themes.
 * Reveal motion + lucide icons. Honesty tags on every proxy / needs-CI metric.
 */
import { useState } from 'react'
import { HeartPulse, AlertTriangle, RotateCw, Activity, Eye, Crown, Flame } from 'lucide-react'
import { useEngHealth } from '../lib/useEngHealth.js'
import { Card, Button } from '../components/ui/index.js'
import { Reveal } from '../components/Reveal.jsx'
import { SectionHeading } from '../components/enghealth/shared.jsx'
import { DoraRow } from '../components/enghealth/DoraRow.jsx'
import { ReviewPanel } from '../components/enghealth/ReviewPanel.jsx'
import { BusFactorPanel } from '../components/enghealth/BusFactorPanel.jsx'
import { TechDebtPanel } from '../components/enghealth/TechDebtPanel.jsx'

const todayISO = () => new Date().toISOString().slice(0, 10)
function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

const PRESETS = [
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '6mo', label: '6mo', days: 182 },
  { key: 'all', label: 'All', days: null },
]

const inputCls =
  'bg-[var(--bg)] text-xs text-[var(--text-muted)] rounded-[var(--radius-btn)] px-3 py-2 ' +
  'border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors cursor-pointer'

function FiltersBar({ filters, setFilters, preset, setPreset }) {
  function applyPreset(p) {
    setPreset(p.key)
    setFilters({ from: p.days == null ? '' : isoDaysAgo(p.days), to: p.days == null ? '' : todayISO() })
  }
  return (
    <Card padding="sm" className="sticky top-2 z-20 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg-surface)]/85">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg)] p-0.5">
          {PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p)}
              className={[
                'px-2.5 py-1 text-[11px] font-mono font-medium rounded-[6px] transition-colors',
                preset === p.key ? 'bg-[#2DD4BF]/15 text-[#2DD4BF]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-[var(--border)]" />
        <div className="flex items-center gap-2">
          <input type="date" className={inputCls} value={filters.from}
            onChange={e => { setFilters(f => ({ ...f, from: e.target.value })); setPreset('') }} />
          <span className="text-[11px] font-mono text-[var(--text-faint)]">→</span>
          <input type="date" className={inputCls} value={filters.to}
            onChange={e => { setFilters(f => ({ ...f, to: e.target.value })); setPreset('') }} />
        </div>
        <span className="ml-auto text-[11px] font-mono text-[var(--text-faint)] hidden sm:block">
          {filters.from ? `${filters.from} → ${filters.to || 'now'}` : 'all time'}
        </span>
      </div>
    </Card>
  )
}

export default function EngHealth() {
  const [filters, setFilters] = useState({ from: isoDaysAgo(90), to: todayISO() })
  const [preset, setPreset] = useState('90d')

  const { data, loading, error, refetch } = useEngHealth(filters)

  const dora = data?.dora
  const review = data?.review
  const bus = data?.busFactor
  const techDebt = data?.techDebt
  const hasDeepData = data?.hasDeepData ?? false

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <Reveal>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-[var(--radius-btn)] bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/20 shrink-0">
            <HeartPulse size={17} className="text-[var(--brand-teal)]" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Engineering Health</h1>
            <p className="text-sm text-[var(--text-faint)] mt-1">
              DORA delivery, review health, bus-factor, and tech-debt — derived from git, with honest proxies where CI data isn't connected.
            </p>
          </div>
        </div>
      </Reveal>

      {/* Filters */}
      <Reveal delay={0.05}>
        <FiltersBar filters={filters} setFilters={setFilters} preset={preset} setPreset={setPreset} />
      </Reveal>

      {/* Error */}
      {error && (
        <Reveal>
          <Card className="border-red-500/25 bg-red-500/[0.04]">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-400">{error}</p>
                <p className="text-xs text-[var(--text-faint)] mt-0.5">The backend may not be running yet.</p>
              </div>
              <Button variant="outline" size="xs" onClick={refetch} leftIcon={<RotateCw size={12} />}>Retry</Button>
            </div>
          </Card>
        </Reveal>
      )}

      {!error && (
        <>
          {/* DORA */}
          <Reveal inView><SectionHeading icon={<Activity size={13} className="text-[var(--brand-teal)]" />} hint="change failure is real · SZZ-powered">Delivery (DORA)</SectionHeading></Reveal>
          <Reveal delay={0.05} inView><DoraRow dora={dora} loading={loading && !data} /></Reveal>

          {/* Review */}
          <Reveal inView><SectionHeading icon={<Eye size={13} className="text-[var(--brand-teal)]" />}>Review health</SectionHeading></Reveal>
          <Reveal delay={0.05} inView><ReviewPanel review={review} loading={loading && !data} /></Reveal>

          {/* Bus factor */}
          <Reveal inView><SectionHeading icon={<Crown size={13} className="text-[#eab308]" />} hint="if a key person leaves…">Bus factor &amp; ownership</SectionHeading></Reveal>
          <Reveal delay={0.05} inView><BusFactorPanel bus={bus} loading={loading && !data} hasDeepData={hasDeepData} /></Reveal>

          {/* Tech debt */}
          <Reveal inView><SectionHeading icon={<Flame size={13} className="text-[#f97316]" />}>Tech-debt hotspots</SectionHeading></Reveal>
          <Reveal delay={0.05} inView><TechDebtPanel hotspots={techDebt} loading={loading && !data} hasDeepData={hasDeepData} /></Reveal>
        </>
      )}
    </div>
  )
}
