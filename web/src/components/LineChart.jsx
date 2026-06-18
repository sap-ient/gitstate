/**
 * Hand-rolled SVG line chart — no external deps.
 * Props:
 *   points: Array<{ x: number|string, y: number, label?: string }>
 *   width: number (default 600)
 *   height: number (default 200)
 *   color: string (default '#2DD4BF')
 *   areaColor: string (default rgba(45,212,191,0.08))
 *   xLabel: (point) => string  — optional x axis tick formatter
 *   yLabel: (value) => string  — optional y axis tick formatter
 *   tooltip: (point) => string — optional tooltip text
 *   emptyText: string
 */
import { useState, useCallback } from 'react'

const PAD = { top: 16, right: 20, bottom: 36, left: 48 }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

export function LineChart({
  points = [],
  width = 600,
  height = 200,
  color = '#2DD4BF',
  areaColor = 'rgba(45,212,191,0.07)',
  xLabel,
  yLabel,
  tooltip,
  emptyText = 'No data yet.',
}) {
  const [hovered, setHovered] = useState(null)

  const W = width - PAD.left - PAD.right
  const H = height - PAD.top - PAD.bottom

  // Stable mouse handler — captures current width/points via closure at call time
  const handleMouseMove = useCallback((e) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const mouseX = e.clientX - rect.left - PAD.left
    const n = svg.dataset.pointCount ? Number(svg.dataset.pointCount) : 1
    const w = svg.dataset.innerW   ? Number(svg.dataset.innerW)    : 1
    const idx = clamp(Math.round(mouseX / (w / Math.max(n - 1, 1))), 0, n - 1)
    setHovered(idx)
  }, [])

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-xl text-xs text-[#334155] font-mono"
        style={{ width, height, background: 'rgba(13,22,40,0.3)', border: '1px dashed #1e2d45' }}
      >
        {emptyText}
      </div>
    )
  }

  const ys = points.map(p => p.y)
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const yRange = yMax - yMin || 1

  // Map point index → pixel coords
  const toX = i => PAD.left + (W / Math.max(points.length - 1, 1)) * i
  const toY = v => PAD.top + H - ((v - yMin) / yRange) * H

  // Build SVG path
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(' ')

  // Area path (closed polygon to baseline)
  const areaD = [
    `M ${toX(0).toFixed(1)} ${(PAD.top + H).toFixed(1)}`,
    ...points.map((p, i) => `L ${toX(i).toFixed(1)} ${toY(p.y).toFixed(1)}`),
    `L ${toX(points.length - 1).toFixed(1)} ${(PAD.top + H).toFixed(1)}`,
    'Z',
  ].join(' ')

  // Y axis ticks (5 steps)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = yMin + (yRange / 4) * i
    return { v, y: toY(v) }
  })

  // X axis ticks: show ~6 evenly spaced
  const step = Math.max(1, Math.floor(points.length / 6))
  const xTicks = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i === 0 || i === points.length - 1 || i % step === 0)

  const hovPoint = hovered != null ? points[hovered] : null

  return (
    <div style={{ position: 'relative', width, height }}>
      <svg
        width={width}
        height={height}
        data-point-count={points.length}
        data-inner-w={W}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {/* Y-axis grid lines */}
        {yTicks.map(({ v, y }, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={y.toFixed(1)}
              x2={PAD.left + W} y2={y.toFixed(1)}
              stroke="#1e2d45" strokeWidth="1"
            />
            <text
              x={PAD.left - 8} y={y.toFixed(1)}
              textAnchor="end" dominantBaseline="middle"
              fontSize="10" fill="#475569"
            >
              {yLabel ? yLabel(v) : Math.round(v)}
            </text>
          </g>
        ))}

        {/* Area fill */}
        <path d={areaD} fill={areaColor} />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* X axis ticks */}
        {xTicks.map(({ p, i }) => (
          <text
            key={i}
            x={toX(i).toFixed(1)} y={PAD.top + H + 18}
            textAnchor="middle"
            fontSize="10" fill="#475569"
          >
            {xLabel ? xLabel(p) : p.x}
          </text>
        ))}

        {/* Hover crosshair + dot */}
        {hovered != null && hovPoint && (
          <>
            <line
              x1={toX(hovered).toFixed(1)} y1={PAD.top}
              x2={toX(hovered).toFixed(1)} y2={PAD.top + H}
              stroke={color} strokeWidth="1" strokeOpacity="0.4" strokeDasharray="3 3"
            />
            <circle
              cx={toX(hovered).toFixed(1)} cy={toY(hovPoint.y).toFixed(1)}
              r="4" fill={color} stroke="#0B1120" strokeWidth="2"
            />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hovered != null && hovPoint && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(toX(hovered) + 10, width - 140),
            top: Math.max(toY(hovPoint.y) - 36, 0),
            pointerEvents: 'none',
            background: '#0d1628',
            border: '1px solid #1e2d45',
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 11,
            color: '#e2e8f0',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {tooltip ? tooltip(hovPoint) : `${yLabel ? yLabel(hovPoint.y) : hovPoint.y}`}
        </div>
      )}
    </div>
  )
}
