/**
 * Stat — a single metric tile.
 *
 * Usage:
 *   <Stat label="Cycle time" value="4.2d" delta="+0.3d" deltaDir="up" />
 *   <Stat label="Open PRs" value={42} />
 */
export function Stat({
  label,
  value,
  delta,
  deltaDir, // 'up' | 'down' | 'neutral'
  sublabel,
  className = '',
}) {
  const deltaColor =
    deltaDir === 'up'   ? 'text-green-400' :
    deltaDir === 'down' ? 'text-red-400'   :
    'text-[var(--text-muted)]'

  return (
    <div className={['flex flex-col gap-1', className].join(' ')}>
      <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
        {label}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-display font-semibold text-[var(--text)] tabular-nums leading-none">
          {value}
        </span>
        {delta && (
          <span className={['text-xs font-mono', deltaColor].join(' ')}>
            {delta}
          </span>
        )}
      </div>
      {sublabel && (
        <span className="text-xs text-[var(--text-faint)]">{sublabel}</span>
      )}
    </div>
  )
}
