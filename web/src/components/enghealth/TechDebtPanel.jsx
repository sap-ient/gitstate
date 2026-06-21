/**
 * TechDebtPanel — the tech-debt hotspots table for Engineering Health.
 *
 * Each row is a churn-heavy path scored by a composite of churn × SZZ bug
 * density × low test coupling (riskScore 0..100, computed server-side), with a
 * human "why". All inputs are real: commit_files churn, bug_introductions (SZZ),
 * and the is_test flag.
 */
import { useMemo } from 'react'
import { Card } from '../ui/index.js'
import { Flame, FileWarning, Bug, FlaskConical } from 'lucide-react'
import { fmtNum, fmtPct } from './format.js'

function riskColor(score) {
  if (score >= 66) return 'var(--bad)'
  if (score >= 40) return 'var(--warn)'
  return 'var(--ok)'
}

function RiskMeter({ score }) {
  const color = riskColor(score)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-surface3)] overflow-hidden min-w-[48px]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, score)}%`, background: color }} />
      </div>
      <span className="font-mono tabular-nums text-xs w-8 text-right" style={{ color }}>{Math.round(score)}</span>
    </div>
  )
}

export function TechDebtPanel({ hotspots, loading, hasDeepData }) {
  const rows = useMemo(() => hotspots || [], [hotspots])

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
          <span className="grid place-items-center w-7 h-7 rounded-[6px] shrink-0" style={{ color: 'var(--chart-3)', background: 'color-mix(in srgb, var(--chart-3) 14%, transparent)' }}>
            <Flame size={15} />
          </span> Tech-debt hotspots
        </h2>
        {!loading && rows.length > 0 && <span className="text-xs font-mono text-[var(--text-faint)]">{rows.length} areas</span>}
      </div>
      <p className="text-[11px] text-[var(--text-faint)] mb-4">
        Risk = churn × SZZ bug density × low test coupling. All signals derived from git.
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-9 rounded bg-[var(--bg-surface2)] animate-pulse" />)}
        </div>
      ) : !hasDeepData || rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <FileWarning size={22} className="text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-dim)]">No hotspot data yet.</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1 max-w-sm">
            Hotspots need per-file churn + SZZ from the git-analysis pass. Run a sync with analysis to populate it.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-faint)]">
                <th className="text-left font-mono uppercase tracking-wider font-medium px-2 py-2">Area / file</th>
                <th className="text-left font-mono uppercase tracking-wider font-medium px-2 py-2 min-w-[120px]">Risk</th>
                <th className="text-right font-mono uppercase tracking-wider font-medium px-2 py-2">Churn</th>
                <th className="text-right font-mono uppercase tracking-wider font-medium px-2 py-2 hidden sm:table-cell">Bug-fixes</th>
                <th className="text-right font-mono uppercase tracking-wider font-medium px-2 py-2 hidden md:table-cell">Tests</th>
                <th className="text-left font-mono uppercase tracking-wider font-medium px-2 py-2 hidden lg:table-cell">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h, i) => (
                <tr key={h.path || i} className="border-b border-[var(--border)] hover:bg-[var(--bg-surface2)] transition-colors">
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Flame size={12} style={{ color: riskColor(h.riskScore) }} className="shrink-0" />
                      <span className="font-mono text-[var(--text-dim)] truncate max-w-[220px]" title={h.path}>{h.path}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5"><RiskMeter score={h.riskScore || 0} /></td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums text-[var(--text-dim)]">{fmtNum(h.churn)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums hidden sm:table-cell">
                    {h.bugFixes > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[var(--bad)]"><Bug size={10} />{fmtNum(h.bugFixes)}</span>
                    ) : <span className="text-[var(--text-faint)]">0</span>}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums hidden md:table-cell">
                    <span className={h.testRatio < 0.05 ? 'text-[var(--warn)]' : 'text-[var(--text-muted)]'}>
                      <FlaskConical size={10} className="inline mr-1 -mt-0.5" />{fmtPct(h.testRatio)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-[var(--text-faint)] hidden lg:table-cell truncate max-w-[220px]">{h.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
