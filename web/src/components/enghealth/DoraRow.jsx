/**
 * DoraRow — the DORA-style metric row for Engineering Health.
 *
 * Honesty is front-and-centre:
 *   • Change Failure Rate is the HERO stat — powered by REAL SZZ data
 *     (bug_introductions). Tagged "live · SZZ".
 *   • Lead time p50/p90 are real (from cycle_times).
 *   • Deploy frequency is a clearly-marked merge-based PROXY.
 *   • MTTR is an honest "needs CI" placeholder (no fabricated number).
 *
 * Hand-rolled SVG (change-failure-over-time chart). Both themes.
 */
import { useMemo, useRef, useState } from 'react'
import { Card } from '../ui/index.js'
import {
  AlertOctagon, Timer, Rocket, Wrench, GitMerge, Bug,
} from 'lucide-react'
import { fmtPct, fmtHours, fmtRate, fmtNum, fmtDate } from './format.js'
import { ProvenanceTag, Sparkline } from './shared.jsx'

// Hero card for the change-failure rate.
function HeroChangeFailure({ dora, loading }) {
  const cfr = dora?.changeFailureRate
  const pct = cfr == null ? null : cfr * 100
  // colour ramp: <15% good (teal), <30% caution (yellow), else red.
  const accent = pct == null ? 'var(--text-faint)'
    : pct < 15 ? '#2DD4BF' : pct < 30 ? '#eab308' : '#ef4444'

  return (
    <Card padding="lg" className="relative overflow-hidden lg:col-span-2"
      style={{ background: 'linear-gradient(135deg, var(--bg-surface), var(--bg-surface2))' }}>
      <div
        className="absolute -right-8 -top-8 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
        style={{ background: accent }}
      />
      <div className="flex items-start justify-between relative">
        <div className="flex items-center gap-2">
          <AlertOctagon size={16} style={{ color: accent }} />
          <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Change failure rate</span>
        </div>
        <ProvenanceTag kind="live" note="Real signal: distinct SZZ bug-fix commits ÷ merged PRs in window." />
      </div>

      {loading ? (
        <div className="mt-4 h-12 w-32 rounded bg-[var(--bg-surface3)] animate-pulse" />
      ) : (
        <div className="mt-3 flex items-end gap-4">
          <div className="font-display text-5xl font-semibold tracking-tight tabular-nums" style={{ color: accent }}>
            {pct == null ? '—' : `${pct.toFixed(pct < 10 ? 1 : 0)}%`}
          </div>
          <div className="pb-1.5 text-[11px] font-mono text-[var(--text-faint)] leading-tight">
            <div className="flex items-center gap-1"><Bug size={11} className="text-[var(--text-faint)]" /> {fmtNum(dora?.bugFixChanges)} bug-fix changes</div>
            <div className="flex items-center gap-1"><GitMerge size={11} className="text-[var(--text-faint)]" /> {fmtNum(dora?.mergedPrs)} merged PRs</div>
          </div>
        </div>
      )}
      <p className="mt-3 text-[11px] text-[var(--text-faint)] leading-relaxed relative">
        Derived from SZZ blame — the share of shipped changes a later fix had to repair.
        This is gitstate's real defect signal, not a CI guess.
      </p>
      {dora?.hasCiData && (
        <div className="mt-2 flex items-center gap-2 relative">
          <ProvenanceTag kind="live" note="Real: failed deployments ÷ total deployments in window (CI-grounded)." />
          <span className="text-[11px] font-mono text-[var(--text-faint)]">
            CI change-failure {fmtPct(dora.ciChangeFailureRate)} · {fmtNum(dora.ciDeployFailures)}/{fmtNum(dora.ciDeploys)} deploys
          </span>
        </div>
      )}
    </Card>
  )
}

function MetricCard({ icon, label, value, sub, accent, tag, loading }) {
  return (
    <Card padding="md" className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">{label}</span>
        {tag}
      </div>
      {loading ? (
        <div className="mt-2.5 h-7 w-16 rounded bg-[var(--bg-surface3)] animate-pulse" />
      ) : (
        <div className="mt-1.5 font-display text-2xl font-semibold tabular-nums tracking-tight" style={{ color: accent || 'var(--text)' }}>
          {value}
        </div>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-faint)]">
        {icon}{sub}
      </div>
    </Card>
  )
}

// Change-failure-over-time: merged (bars) vs bug-fixes (bars) + rate line.
function ChangeFailureTrend({ trend }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)
  const pts = useMemo(() => (trend || []).filter(p => p?.week), [trend])

  const W = 760, H = 150, PAD = { t: 14, r: 12, b: 22, l: 28 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const maxCount = useMemo(() => pts.reduce((m, p) => Math.max(m, p.merged || 0, p.bugFixes || 0), 0) || 1, [pts])

  if (!pts.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[150px] text-center">
        <Bug size={20} className="text-[var(--text-faint)] mb-2" />
        <p className="text-sm text-[var(--text-faint)]">No delivery data in this range.</p>
      </div>
    )
  }

  const slot = innerW / pts.length
  const barW = Math.min(6, slot * 0.34)
  const yCount = (v) => PAD.t + innerH - (v / maxCount) * innerH
  const yRate = (r) => PAD.t + innerH - (r) * innerH // rate in [0,1]

  const ratePath = pts.map((p, i) => {
    const x = PAD.l + i * slot + slot / 2
    const r = p.rate == null ? 0 : p.rate
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${yRate(r).toFixed(1)}`
  }).join(' ')

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (W / rect.width)
    let idx = Math.floor((x - PAD.l) / slot)
    idx = Math.max(0, Math.min(pts.length - 1, idx))
    setHover({ idx, p: pts[idx] })
  }

  return (
    <div className="relative overflow-x-auto">
      <svg ref={svgRef} width={W} height={H} className="block max-w-full"
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t, i) => {
          const y = yCount(Math.round(maxCount * t))
          return <line key={i} x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3" />
        })}
        {pts.map((p, i) => {
          const cx = PAD.l + i * slot + slot / 2
          const hM = ((p.merged || 0) / maxCount) * innerH
          const hB = ((p.bugFixes || 0) / maxCount) * innerH
          return (
            <g key={i}>
              <rect x={cx - barW - 1} y={PAD.t + innerH - hM} width={barW} height={hM} rx={1.5} fill="#2DD4BF" opacity={hover && hover.idx === i ? 1 : 0.75} />
              <rect x={cx + 1} y={PAD.t + innerH - hB} width={barW} height={hB} rx={1.5} fill="#ef4444" opacity={hover && hover.idx === i ? 1 : 0.8} />
            </g>
          )
        })}
        <path d={ratePath} fill="none" stroke="#eab308" strokeWidth="1.75" strokeLinejoin="round" />
        {[0, Math.floor(pts.length / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
          <text key={i} x={PAD.l + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="9" className="font-mono" fill="var(--text-faint)">
            {fmtDate(pts[i].week)}
          </text>
        ))}
      </svg>

      <div className="flex items-center gap-4 mt-1.5 text-[10px] font-mono text-[var(--text-faint)]">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-[#2DD4BF]" />merged</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-[#ef4444]" />bug-fixes</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 rounded bg-[#eab308]" />failure rate</span>
      </div>

      {hover && (
        <div className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-[var(--radius-badge)] bg-[var(--bg)] border border-[var(--border2)] shadow-[var(--shadow-float)] whitespace-nowrap"
          style={{ left: `${((PAD.l + hover.idx * slot + slot / 2) / W) * 100}%`, top: 0 }}>
          <div className="text-[10px] font-mono text-[var(--text-faint)] mb-0.5">{fmtDate(hover.p.week, { month: 'short', day: 'numeric', year: '2-digit' })}</div>
          <div className="text-xs font-semibold tabular-nums text-[#2DD4BF]">merged: {hover.p.merged || 0}</div>
          <div className="text-xs font-semibold tabular-nums text-[#ef4444]">bug-fixes: {hover.p.bugFixes || 0}</div>
          <div className="text-xs font-semibold tabular-nums text-[#eab308]">rate: {hover.p.rate == null ? '—' : fmtPct(hover.p.rate)}</div>
        </div>
      )}
    </div>
  )
}

export function DoraRow({ dora, loading }) {
  const d = dora ?? {}
  const leadTrend = useMemo(() => (d.leadTimeTrend || []).map(p => p.medianHours), [d.leadTimeTrend])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <HeroChangeFailure dora={d} loading={loading} />

        <MetricCard
          label="Lead time p50" accent="var(--brand-teal)"
          icon={<Timer size={11} />} sub="commit → merge"
          value={fmtHours(d.leadTimeP50Hours)} loading={loading}
          tag={<ProvenanceTag kind="live" note="Real: cycle_times lead_time_secs." />}
        />
        <MetricCard
          label="Lead time p90" accent="var(--brand-indigo)"
          icon={<Timer size={11} />} sub="slowest 10%"
          value={fmtHours(d.leadTimeP90Hours)} loading={loading}
          tag={<ProvenanceTag kind="live" note="Real: cycle_times lead_time_secs." />}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Deploy frequency"
          accent={d.deployFrequency?.real ? 'var(--brand-teal)' : 'var(--text)'}
          icon={<Rocket size={11} />} sub={d.deployFrequency?.unit || 'merges/week'}
          value={d.deployFrequency?.value == null ? '—' : fmtRate(d.deployFrequency.value, '')}
          loading={loading}
          tag={
            d.deployFrequency?.real
              ? <ProvenanceTag kind="live" note={d.deployFrequency?.note || 'real: deployments ingested via webhooks/CI'} />
              : <ProvenanceTag kind="proxy" note={d.deployFrequency?.note || 'merge-based proxy — connect CI for true deploys'} />
          }
        />
        <MetricCard
          label="MTTR"
          accent={d.mttr?.real ? 'var(--brand-indigo)' : 'var(--text-faint)'}
          icon={<Wrench size={11} />}
          sub={d.mttr?.real && d.mttr?.open > 0 ? `${d.mttr.open} open` : 'time to restore'}
          value={d.mttr?.real ? fmtHours(d.mttr?.value) : '—'}
          loading={loading}
          tag={
            d.mttr?.real
              ? <ProvenanceTag kind="live" note={d.mttr?.note || 'real: mean incident resolution time'} />
              : <ProvenanceTag kind="needsCI" note={d.mttr?.note || 'needs CI/incident data — not yet ingested'} />
          }
        />
        <Card padding="md" className="sm:col-span-2 flex items-center gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Lead-time trend</div>
            <div className="text-[10px] text-[var(--text-faint)] mt-0.5">weekly median, hours</div>
          </div>
          <div className="ml-auto">
            <Sparkline values={leadTrend} width={160} height={40} color="#6366F1" />
          </div>
        </Card>
      </div>

      <Card padding="lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
              <AlertOctagon size={15} className="text-[#ef4444]" /> Change failure over time
            </h2>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">Merged PRs vs SZZ-implicated bug-fixes, per week.</p>
          </div>
        </div>
        {loading ? (
          <div className="h-[150px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />
        ) : (
          <ChangeFailureTrend trend={d.changeFailureTrend} />
        )}
      </Card>
    </div>
  )
}
