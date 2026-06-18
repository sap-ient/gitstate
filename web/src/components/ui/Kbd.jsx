/**
 * Kbd — keyboard key indicator.
 *
 * Usage:
 *   <Kbd>⌘</Kbd><Kbd>K</Kbd>
 */
export function Kbd({ className = '', children }) {
  return (
    <kbd
      className={[
        'inline-flex items-center justify-center px-1.5 py-0.5',
        'font-mono text-[10px] leading-none',
        'text-[var(--text-muted)] bg-[var(--bg-surface3)]',
        'border border-[var(--border)] border-b-[var(--border2)]',
        'rounded-[4px] shadow-[inset_0_-1px_0_var(--border2)]',
        className,
      ].join(' ')}
    >
      {children}
    </kbd>
  )
}
