/**
 * GitGraph — decorative SVG commit graph. Pure visual motif.
 *
 * Usage:
 *   <GitGraph className="absolute right-0 top-0 opacity-20" />
 *   <GitGraph variant="compact" width={200} />
 */

const COMMITS = [
  // [x, y, branch]
  [0, 4, 0],
  [1, 3, 0],
  [2, 2, 0],  // branch point
  [2, 2, 1],
  [3, 1, 1],
  [3, 3, 0],
  [4, 4, 0],  // merge
  [4, 4, 1],  // merge
  [5, 4, 0],
]

const TRACK_COLORS = ['#2DD4BF', '#6366F1', '#818cf8']
const STEP_X = 28
const STEP_Y = 22
const R = 5

function buildPaths(commits) {
  const byBranch = {}
  commits.forEach(([x, y, b]) => {
    if (!byBranch[b]) byBranch[b] = []
    byBranch[b].push([x * STEP_X + 20, y * STEP_Y + 10])
  })
  return Object.entries(byBranch).map(([b, pts]) => {
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
    return { d, color: TRACK_COLORS[b] ?? TRACK_COLORS[0] }
  })
}

const COMMITS_COMPACT = [
  [0,2,0],[1,1,0],[2,0,0],[2,2,1],[3,1,0],[3,1,1],[4,2,0],[5,2,0],
]

export function GitGraph({
  variant = 'default',
  className = '',
  width,
  opacity = 0.5,
}) {
  const data = variant === 'compact' ? COMMITS_COMPACT : COMMITS
  const paths = buildPaths(data)

  const allX = data.map(([x]) => x * STEP_X + 20)
  const allY = data.map(([,y]) => y * STEP_Y + 10)
  const svgW = width ?? (Math.max(...allX) + 30)
  const svgH = Math.max(...allY) + 20

  const dedupedCommits = data.filter(([x, y], i) => {
    return !data.slice(0, i).some(([px, py]) => px === x && py === y)
  })

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ opacity }}
      aria-hidden="true"
    >
      {/* Connection lines */}
      {paths.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}

      {/* Commit nodes */}
      {dedupedCommits.map(([x, y, b], i) => {
        const cx = x * STEP_X + 20
        const cy = y * STEP_Y + 10
        const color = TRACK_COLORS[b] ?? TRACK_COLORS[0]
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={R + 2} fill="var(--bg, #0B1120)" />
            <circle cx={cx} cy={cy} r={R} fill={color} opacity="0.9" />
          </g>
        )
      })}
    </svg>
  )
}
