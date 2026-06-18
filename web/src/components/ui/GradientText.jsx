/**
 * GradientText — renders children with the brand teal→indigo gradient.
 *
 * Usage:
 *   <GradientText as="h1" className="text-4xl font-display">git is the ledger</GradientText>
 */
export function GradientText({ as: Tag = 'span', className = '', children, ...props }) {
  return (
    <Tag
      className={['gradient-text', className].join(' ')}
      {...props}
    >
      {children}
    </Tag>
  )
}
