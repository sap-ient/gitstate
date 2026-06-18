/**
 * BurndownChart — renders a burndown for a given project.
 * Data from GET /api/reports/burndown?project=<id>
 * Uses hand-rolled SVG via LineChart (dual-line: remaining vs ideal).
 */
import { useBurndown } from '../lib/useBurndown.js'

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

const PAD = { top: 16, right: 20, bottom: 36, left: 48 }

function DualLineChart({ points, width = 600, height = 200 }) {
  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-[var(--radius-card)] text-xs text-[var(--text-faint)] font-mono border border-dashed border-[var(--border)]"
        style={{ width, height, background: 'var(--bg)' }}
      >
        No burndown data yet.
      </div>
    )
  }

  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  const allVals = points.flatMap(p => [p.remaining, p.ideal].filter(v => v != null))
  const yMax = Math.max(...allVals, 1)
  const yMin = 0

  const toX = i => PAD.left + (W / Math.max(points.length - 1, 1)) * i
  const toY = v => PAD.top + H - ((v - yMin) / (yMax - yMin)) * H

  const remainingPath = points
    .filter(p => p.remaining != null)
    .map((p, i) => {
      const idx = points.indexOf(p)
      return `${i === 0 ? 'M' : 'L'} ${toX(idx).toFixed(1)} ${toY(p.remaining).toFixed(1)}`
    })
    .join(' ')

  const idealPath = points
    .filter(p => p.ideal != null)
    .map((p, i) => {
      const idx = points.indexOf(p)
      return `${i === 0 ? 'M' : 'L'} ${toX(idx).toFixed(1)} ${toY(p.ideal).toFixed(1)}`
    })
    .join(' ')

  const areaPath = [
    `M ${toX(0).toFixed(1)} ${(PAD.top + H).toFixed(1)}`,
    ...points.filter(p => p.remaining != null).map((p) => {
      const idx = points.indexOf(p)
      return `L ${toX(idx).toFixed(1)} ${toY(p.remaining).toFixed(1)}`
    }),
    `L ${toX(points.length - 1).toFixed(1)} ${(PAD.top + H).toFixed(1)}`,
    'Z',
  ].join(' ')

  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = yMax - (yMax / 4) * i
    return { v, y: toY(v) }
  })

  const step = Math.max(1, Math.floor(points.length / 6))
  const xTicks = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i === 0 || i === points.length - 1 || i % step === 0)

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Y grid + labels */}
      {yTicks.map(({ v, y }, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y.toFixed(1)} x2={PAD.left + W} y2={y.toFixed(1)} stroke="#1e2d45" strokeWidth="1" />
          <text x={PAD.left - 8} y={y.toFixed(1)} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#64748b">
            {Math.round(v)}
          </text>
        </g>
      ))}

      {/* Remaining area */}
      {remainingPath && <path d={areaPath} fill="rgba(45,212,191,0.06)" />}

      {/* Ideal line (dashed) */}
      {idealPath && (
        <path d={idealPath} fill="none" stroke="#6366F1" strokeWidth="1.5" strokeDasharray="5 3" strokeOpacity="0.6" />
      )}

      {/* Remaining line */}
      {remainingPath && (
        <path d={remainingPath} fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}

      {/* X axis ticks */}
      {xTicks.map(({ p, i }) => {
        const d = new Date(p.date)
        const label = isNaN(d) ? p.date : `${d.getMonth() + 1}/${d.getDate()}`
        return (
          <text key={i} x={toX(i).toFixed(1)} y={PAD.top + H + 18} textAnchor="middle" fontSize="10" fill="#64748b">
            {label}
          </text>
        )
      })}

      {/* Legend */}
      <g transform={`translate(${PAD.left + W - 120}, ${PAD.top})`}>
        <line x1="0" y1="6" x2="16" y2="6" stroke="#2DD4BF" strokeWidth="2" />
        <text x="20" y="10" fontSize="10" fill="#94a3b8">remaining</text>
        <line x1="0" y1="22" x2="16" y2="22" stroke="#6366F1" strokeWidth="1.5" strokeDasharray="5 3" />
        <text x="20" y="26" fontSize="10" fill="#94a3b8">ideal</text>
      </g>
    </svg>
  )
}

/**
 * Drop-in burndown chart for a project.
 * @param {{ projectId: string }} props
 */
export function BurndownChart({ projectId }) {
  const { points, loading, error } = useBurndown(projectId)

  if (!projectId) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)]">Burndown</h3>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">Remaining work vs ideal — derived from issue state</p>
        </div>
        {loading && <Spinner />}
      </div>

      {error && (
        <div className="rounded-[var(--radius-badge)] px-4 py-3 text-xs text-red-400 bg-red-500/[0.06] border border-red-500/20">
          {error}
        </div>
      )}

      {!error && (
        <div className="overflow-x-auto">
          <DualLineChart points={loading ? [] : points} />
        </div>
      )}
    </div>
  )
}
