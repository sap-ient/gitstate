/**
 * Card — themed surface container.
 *
 * Usage:
 *   <Card>...</Card>
 *   <Card padding="lg" glow>...</Card>  // glow adds a subtle teal/indigo halo
 */
export function Card({
  className = '',
  padding = 'md',
  glow = false,
  hoverable = false,
  children,
  ...props
}) {
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-5',
    lg: 'p-6',
    xl: 'p-8',
  }

  return (
    <div
      className={[
        'rounded-[var(--radius-card)] border border-[var(--border)]',
        'bg-[var(--bg-surface)] relative overflow-hidden',
        paddings[padding] ?? paddings.md,
        glow && 'shadow-[0_0_40px_rgba(45,212,191,0.06),0_0_80px_rgba(99,102,241,0.04)]',
        hoverable && 'transition-all duration-200 hover:border-[var(--border2)] hover:shadow-[0_4px_24px_rgba(0,0,0,0.3)]',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
