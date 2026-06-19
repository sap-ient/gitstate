/**
 * BusFactorPanel — the "if X leaves…" view for Engineering Health.
 *
 *   • org truck-factor (fewest people owning >50% of surviving blame code) as a
 *     visceral hero number,
 *   • the owner-share distribution (who holds the codebase),
 *   • single-owner risk areas — the panel's emotional core.
 *
 * All from author_survival (blame) + commit_files. Empty until the git-analysis
 * pipeline runs — shown honestly.
 */
import { useMemo } from 'react'
import { Card, Badge } from '../ui/index.js'
import { LifeBuoy, UserX, Crown, AlertTriangle } from 'lucide-react'
import { fmtNum, fmtPct, authorLabel } from './format.js'
import { Avatar } from './shared.jsx'

function TruckFactorHero({ bus }) {
  const tf = bus?.truckFactor ?? 0
  // 1–2 is scary, 3–4 caution, 5+ healthy.
  const accent = tf <= 0 ? 'var(--text-faint)' : tf <= 2 ? '#ef4444' : tf <= 4 ? '#eab308' : '#2DD4BF'
  const verdict = tf <= 0 ? 'no blame data yet'
    : tf <= 2 ? 'fragile — knowledge is dangerously concentrated'
    : tf <= 4 ? 'moderate — a few key people carry the codebase'
    : 'resilient — ownership is well spread'
  return (
    <div className="flex items-center gap-5">
      <div className="relative grid place-items-center w-20 h-20 rounded-full shrink-0"
        style={{ background: `radial-gradient(circle at 30% 30%, ${accent}22, transparent 70%)`, border: `1px solid ${accent}44` }}>
        <LifeBuoy size={22} style={{ color: accent }} className="absolute opacity-30" />
        <span className="font-display text-3xl font-semibold tabular-nums" style={{ color: accent }}>{tf || '—'}</span>
      </div>
      <div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Truck factor</div>
        <div className="text-sm font-semibold text-[var(--text)] mt-0.5">{verdict}</div>
        <div className="text-[11px] text-[var(--text-faint)] mt-1 max-w-md leading-relaxed">
          The fewest people who, if they all left, would take &gt;50% of the surviving
          (still-living) code knowledge with them.
        </div>
      </div>
    </div>
  )
}

function OwnerShareBar({ owners }) {
  const top = useMemo(() => (owners || []).slice(0, 8), [owners])
  if (!top.length) return null
  const palette = ['#2DD4BF', '#6366F1', '#22c55e', '#eab308', '#f97316', '#ec4899', '#38bdf8', '#a78bfa']
  return (
    <div className="mt-5">
      <div className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)] mb-2">Who owns the codebase</div>
      <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg-surface3)]">
        {top.map((o, i) => (
          <div key={o.author || i} style={{ width: `${(o.share || 0) * 100}%`, background: palette[i % palette.length] }}
            title={`${authorLabel(o.author)}: ${fmtPct(o.share)}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2.5">
        {top.map((o, i) => (
          <span key={o.author || i} className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-faint)]">
            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: palette[i % palette.length] }} />
            {authorLabel(o.author)} <span className="text-[var(--text-dim)]">{fmtPct(o.share)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function SingleOwnerAreas({ areas }) {
  if (!areas?.length) {
    return (
      <div className="rounded-[var(--radius-card)] border border-[#22c55e]/20 bg-[#22c55e]/[0.04] px-4 py-5 text-center">
        <p className="text-sm text-[var(--text-dim)]">No single-owner risk areas — ownership is shared across the codebase.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      {areas.map((a, i) => (
        <div key={a.area || i} className="rounded-[var(--radius-card)] border border-[#ef4444]/25 bg-[#ef4444]/[0.05] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <UserX size={13} className="text-[#ef4444] shrink-0" />
                <span className="font-mono text-sm text-[var(--text-dim)] truncate">{a.area}</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <Avatar name={a.topAuthor} size={20} />
                <span className="text-[11px] font-mono text-[var(--text-faint)]">
                  <span className="text-[var(--text-dim)]">{authorLabel(a.topAuthor)}</span> owns{' '}
                  <span className="text-[#ef4444] font-semibold">{fmtPct(a.ownershipPct)}</span>
                  {a.contributorN > 0 && <> · {fmtNum(a.contributorN)} contributor{a.contributorN === 1 ? '' : 's'}</>}
                </span>
              </div>
            </div>
            <Badge color="red" className="shrink-0">
              <AlertTriangle size={10} /> if they leave
            </Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

export function BusFactorPanel({ bus, loading, hasDeepData }) {
  const d = bus ?? {}
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
            <Crown size={15} className="text-[#eab308]" /> Bus factor &amp; ownership risk
          </h2>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">Knowledge concentration from git-blame survival — the "if X leaves…" view.</p>
        </div>
        {!loading && d.totalSurviving > 0 && (
          <span className="text-xs font-mono text-[var(--text-faint)]">{fmtNum(d.totalSurviving)} surviving lines</span>
        )}
      </div>

      {loading ? (
        <div className="h-[280px] rounded-[var(--radius-card)] bg-[var(--bg-surface2)] animate-pulse" />
      ) : !hasDeepData || (d.totalSurviving || 0) === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <LifeBuoy size={24} className="text-[var(--text-faint)] mb-3" />
          <p className="text-sm text-[var(--text-dim)]">No blame-survival data yet.</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1 max-w-sm">
            Bus-factor needs the deep git-analysis pass (blame + SZZ). Run a repo sync with analysis to populate it.
          </p>
        </div>
      ) : (
        <>
          <TruckFactorHero bus={d} />
          <OwnerShareBar owners={d.ownerShare} />
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">Single-owner risk areas</h3>
              {d.singleOwnerAreas?.length > 0 && <Badge color="red">{d.singleOwnerAreas.length}</Badge>}
            </div>
            <SingleOwnerAreas areas={d.singleOwnerAreas} />
          </div>
        </>
      )}
    </Card>
  )
}
