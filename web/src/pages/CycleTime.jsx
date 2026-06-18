/**
 * CycleTime page — /cycle-time
 * Chart of lead-time over time from GET /api/metrics/cycle-time?repo=&from=&to=
 * Hand-rolled SVG via <LineChart>. Includes repo/date filters.
 */
import { useState } from 'react'
import { useCycleTime } from '../lib/useCycleTime.js'
import { useRepos } from '../lib/useRepos.js'
import { LineChart } from '../components/LineChart.jsx'

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div
      className="rounded-lg px-4 py-3 flex flex-col gap-0.5"
      style={{ background: '#111827', border: '1px solid #1e2d45' }}
    >
      <span className="text-[10px] font-medium text-[#475569] uppercase tracking-widest">{label}</span>
      <span className="text-xl font-bold font-mono" style={{ color: color ?? '#e2e8f0' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function computeStats(points) {
  if (!points.length) return null
  const ys = points.map(p => p.y)
  const avg = ys.reduce((a, b) => a + b, 0) / ys.length
  const sorted = [...ys].sort((a, b) => a - b)
  const p50 = sorted[Math.floor(sorted.length * 0.5)]
  const p90 = sorted[Math.floor(sorted.length * 0.9)]
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  return { avg, p50, p90, min, max }
}

export default function CycleTime() {
  const { repos } = useRepos()
  const [repo, setRepo] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { points, loading, error, refetch } = useCycleTime({ repo, from, to })

  const stats = computeStats(points)

  const chartPoints = points.map(pt => ({
    x: pt.date,
    y: typeof pt.days === 'number' ? pt.days : 0,
    label: pt.date,
    title: pt.title,
    repo: pt.repo,
  }))

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#e2e8f0] tracking-tight">Cycle Time</h1>
        <p className="text-sm text-[#64748b] mt-1">
          Lead time from PR open to merge — derived from git, no estimates entered.
        </p>
      </div>

      {/* Filters */}
      <div
        className="rounded-xl px-5 py-4 flex flex-wrap gap-4 items-end"
        style={{ background: '#111827', border: '1px solid #1e2d45' }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-[#475569] uppercase tracking-widest">Repository</label>
          <select
            className="bg-[#0d1628] text-xs text-[#94a3b8] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
            value={repo}
            onChange={e => setRepo(e.target.value)}
          >
            <option value="">All repos</option>
            {repos.map(r => <option key={r.id} value={r.name ?? r.fullName ?? r.id}>{r.name ?? r.fullName}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-[#475569] uppercase tracking-widest">From</label>
          <input
            type="date"
            className="bg-[#0d1628] text-xs text-[#94a3b8] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
            value={from}
            onChange={e => setFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-medium text-[#475569] uppercase tracking-widest">To</label>
          <input
            type="date"
            className="bg-[#0d1628] text-xs text-[#94a3b8] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
            value={to}
            onChange={e => setTo(e.target.value)}
          />
        </div>

        <button
          onClick={refetch}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-xs font-semibold text-[#0B1120] transition-all duration-150 disabled:opacity-40 flex items-center gap-2 shrink-0"
          style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
        >
          {loading ? <Spinner /> : (
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          Apply
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatPill label="Avg" value={`${stats.avg.toFixed(1)}d`} color="#2DD4BF" />
          <StatPill label="Median (p50)" value={`${stats.p50.toFixed(1)}d`} color="#6366F1" />
          <StatPill label="p90" value={`${stats.p90.toFixed(1)}d`} color="#f59e0b" />
          <StatPill label="Min" value={`${stats.min.toFixed(1)}d`} color="#22c55e" />
          <StatPill label="Max" value={`${stats.max.toFixed(1)}d`} color="#ef4444" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded-xl px-5 py-4 text-sm text-[#ef4444]"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error} — the backend may not be running yet.
        </div>
      )}

      {/* Chart */}
      <div
        className="rounded-xl p-6"
        style={{ background: '#111827', border: '1px solid #1e2d45' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Lead time per merged PR</h2>
            <p className="text-xs text-[#475569] mt-0.5">Days from PR open → merge, chronological</p>
          </div>
          {loading && <Spinner />}
          {!loading && chartPoints.length > 0 && (
            <span className="text-xs font-mono text-[#475569]">{chartPoints.length} PRs</span>
          )}
        </div>

        <div className="overflow-x-auto">
          <LineChart
            points={chartPoints}
            width={760}
            height={220}
            color="#2DD4BF"
            xLabel={pt => {
              const d = new Date(pt.x)
              return isNaN(d) ? pt.x : `${d.getMonth() + 1}/${d.getDate()}`
            }}
            yLabel={v => `${Math.round(v)}d`}
            tooltip={pt => {
              const d = new Date(pt.x)
              const dateStr = isNaN(d) ? pt.x : d.toLocaleDateString()
              return [
                dateStr,
                `${pt.y.toFixed(1)} days`,
                pt.title ? `"${pt.title}"` : '',
                pt.repo ? `@ ${pt.repo}` : '',
              ].filter(Boolean).join(' · ')
            }}
            emptyText={loading ? 'Loading…' : 'No cycle time data — connect a repo and run a sync.'}
          />
        </div>
      </div>

      {/* Raw data table */}
      {!loading && points.length > 0 && (
        <div
          className="rounded-xl p-6"
          style={{ background: '#111827', border: '1px solid #1e2d45' }}
        >
          <h2 className="text-sm font-semibold text-[#e2e8f0] mb-4">Raw data</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e2d45]">
                  <th className="text-left px-3 py-2 text-[#475569] font-medium uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-2 text-[#475569] font-medium uppercase tracking-wider">Days</th>
                  <th className="text-left px-3 py-2 text-[#475569] font-medium uppercase tracking-wider">PR Title</th>
                  <th className="text-left px-3 py-2 text-[#475569] font-medium uppercase tracking-wider">Repo</th>
                </tr>
              </thead>
              <tbody>
                {points.slice().reverse().map((pt, i) => (
                  <tr key={i} className="border-b border-[#0d1628] hover:bg-[#0d1628]/50 transition-colors">
                    <td className="px-3 py-2 text-[#64748b] font-mono">{pt.date}</td>
                    <td className="px-3 py-2 font-mono" style={{ color: '#2DD4BF' }}>
                      {typeof pt.days === 'number' ? `${pt.days.toFixed(1)}d` : '—'}
                    </td>
                    <td className="px-3 py-2 text-[#94a3b8]">{pt.title ?? '—'}</td>
                    <td className="px-3 py-2 text-[#475569] font-mono">{pt.repo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
