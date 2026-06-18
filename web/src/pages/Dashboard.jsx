/**
 * Dashboard — post-login home. Route: /dashboard (and redirected from /)
 * Shows: project-state rollup (open/in-progress/done counts), throughput,
 * cycle-time trend sparkline, and the LLM-synthesized status block.
 * Data from GET /api/reports/dashboard
 */
import { useState } from 'react'
import { useDashboard } from '../lib/useDashboard.js'
import { LineChart } from '../components/LineChart.jsx'
import { post } from '../lib/api.js'
import { useOrg } from '../lib/useOrg.js'

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-1.5"
      style={{ background: '#111827', border: '1px solid #1e2d45' }}
    >
      <span className="text-[11px] font-medium text-[#475569] uppercase tracking-widest">{label}</span>
      <span
        className="text-3xl font-bold tracking-tight"
        style={{ color: accent ?? '#e2e8f0' }}
      >
        {value ?? '—'}
      </span>
      {sub && <span className="text-xs text-[#475569]">{sub}</span>}
    </div>
  )
}

function StatusBlock({ status }) {
  const [showRaw, setShowRaw] = useState(false)

  if (!status) return null

  const { riskSummary, shippedSummary, raw } = status

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.04), rgba(99,102,241,0.04))', border: '1px solid rgba(45,212,191,0.12)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#2DD4BF" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <span className="text-xs font-semibold text-[#2DD4BF] uppercase tracking-widest">LLM Status Synthesis</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {riskSummary && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                at risk
              </span>
            </div>
            <p className="text-sm text-[#94a3b8] leading-relaxed">{riskSummary}</p>
          </div>
        )}
        {shippedSummary && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                style={{ color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                shipped
              </span>
            </div>
            <p className="text-sm text-[#94a3b8] leading-relaxed">{shippedSummary}</p>
          </div>
        )}
      </div>

      {raw && (
        <div className="mt-4 pt-4 border-t border-[#1e2d45]">
          <button
            className="text-[10px] font-mono text-[#475569] hover:text-[#94a3b8] transition-colors flex items-center gap-1"
            onClick={() => setShowRaw(v => !v)}
          >
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d={showRaw ? 'M19.5 8.25l-7.5 7.5-7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
            </svg>
            {showRaw ? 'hide' : 'show'} raw synthesis
          </button>
          {showRaw && (
            <pre className="mt-3 text-[11px] text-[#475569] font-mono whitespace-pre-wrap leading-relaxed bg-[#0d1628] rounded-lg p-4 overflow-auto">
              {typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function NLQueryBox() {
  const { activeOrgId } = useOrg()
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showSql, setShowSql] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!question.trim() || !activeOrgId) return
    setLoading(true)
    setError(null)
    setResult(null)
    setShowSql(false)
    try {
      const data = await post('/api/reports/query', { question: question.trim() })
      setResult(data)
    } catch (err) {
      setError(err.message ?? 'Query failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: '#111827', border: '1px solid #1e2d45' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#6366F1" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
        </svg>
        <span className="text-xs font-semibold text-[#6366F1] uppercase tracking-widest">Ask the data</span>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 mb-4">
        <input
          className="flex-1 bg-[#0d1628] text-sm text-[#e2e8f0] rounded-lg px-4 py-2.5 border border-[#1e2d45] outline-none placeholder-[#334155] focus:border-[#6366F1]/50 transition-colors"
          placeholder="e.g. Which issues have been open for more than 14 days?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 disabled:opacity-40 flex items-center gap-2 shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366F1, #2DD4BF)' }}
        >
          {loading ? <Spinner /> : (
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          )}
          Ask
        </button>
      </form>

      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm text-[#ef4444] mb-4"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.answer && (
            <div
              className="rounded-lg px-5 py-4"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}
            >
              <p className="text-sm text-[#c7d2fe] leading-relaxed">{result.answer}</p>
            </div>
          )}

          {Array.isArray(result.rows) && result.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#1e2d45]">
                    {Object.keys(result.rows[0]).map(col => (
                      <th key={col} className="text-left px-3 py-2 text-[#475569] font-medium uppercase tracking-wider">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-[#0d1628] hover:bg-[#0d1628]/50 transition-colors">
                      {Object.values(row).map((val, ci) => (
                        <td key={ci} className="px-3 py-2 text-[#94a3b8] font-mono">
                          {val === null || val === undefined ? '—' : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.sql && (
            <div>
              <button
                className="text-[10px] font-mono text-[#475569] hover:text-[#94a3b8] transition-colors flex items-center gap-1"
                onClick={() => setShowSql(v => !v)}
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d={showSql ? 'M19.5 8.25l-7.5 7.5-7.5-7.5' : 'M8.25 4.5l7.5 7.5-7.5 7.5'} />
                </svg>
                {showSql ? 'hide' : 'show'} SQL used
              </button>
              {showSql && (
                <pre
                  className="mt-2 text-[11px] text-[#94a3b8] font-mono whitespace-pre-wrap leading-relaxed rounded-lg p-4 overflow-auto"
                  style={{ background: '#0d1628', border: '1px solid #1e2d45' }}
                >
                  {result.sql}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { data, loading, error, refetch } = useDashboard()

  const cycleTrend = data?.cycleTrend ?? []
  const chartPoints = cycleTrend.map(pt => ({
    x: pt.date,
    y: typeof pt.days === 'number' ? pt.days : 0,
    label: pt.date,
    raw: pt,
  }))

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0] tracking-tight">Dashboard</h1>
          <p className="text-sm text-[#64748b] mt-1">Derived from git — no tickets to maintain.</p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#162032] transition-colors disabled:opacity-40"
        >
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center gap-3 py-12 justify-center">
          <Spinner />
          <span className="text-sm text-[#475569]">Loading dashboard…</span>
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div
          className="rounded-xl px-5 py-4 text-sm text-[#ef4444]"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error} — the backend may not be running yet.
        </div>
      )}

      {/* State rollup */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Open"
          value={data?.open ?? (loading ? '…' : '—')}
          sub="issues in backlog"
          accent="#6366F1"
        />
        <StatCard
          label="In progress"
          value={data?.inProgress ?? (loading ? '…' : '—')}
          sub="active PRs / tasks"
          accent="#f59e0b"
        />
        <StatCard
          label="Done"
          value={data?.done ?? (loading ? '…' : '—')}
          sub="merged / closed"
          accent="#22c55e"
        />
        <StatCard
          label="Throughput"
          value={data?.throughput != null ? `${data.throughput}/wk` : (loading ? '…' : '—')}
          sub="issues closed per week"
          accent="#2DD4BF"
        />
      </div>

      {/* Cycle-time trend chart */}
      <div
        className="rounded-xl p-6"
        style={{ background: '#111827', border: '1px solid #1e2d45' }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Cycle time trend</h2>
            <p className="text-xs text-[#475569] mt-0.5">Lead time from open to merge, per merged PR</p>
          </div>
          {chartPoints.length > 0 && (
            <span className="text-xs font-mono text-[#475569]">{chartPoints.length} data points</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <LineChart
            points={chartPoints}
            width={700}
            height={180}
            xLabel={pt => {
              const d = new Date(pt.x)
              return isNaN(d) ? pt.x : `${d.getMonth() + 1}/${d.getDate()}`
            }}
            yLabel={v => `${Math.round(v)}d`}
            tooltip={pt => {
              const d = new Date(pt.x)
              const dateStr = isNaN(d) ? pt.x : d.toLocaleDateString()
              return `${dateStr}: ${pt.y.toFixed(1)}d${pt.raw?.title ? ` — ${pt.raw.title}` : ''}`
            }}
            emptyText="No cycle time data yet — connect a repo to start tracking."
          />
        </div>
      </div>

      {/* LLM status synthesis */}
      {data?.status && <StatusBlock status={data.status} />}

      {/* NL query box */}
      <NLQueryBox />
    </div>
  )
}
