/**
 * Layout primitives — Section, Container
 *
 * Usage:
 *   <Section>
 *     <Container size="lg">...</Container>
 *   </Section>
 */

/** Section — full-width row with optional vertical padding */
export function Section({ className = '', py = 'xl', children, ...props }) {
  const pads = { sm: 'py-8', md: 'py-12', lg: 'py-16', xl: 'py-20', '2xl': 'py-28' }
  return (
    <section className={['w-full', pads[py] ?? pads.xl, className].join(' ')} {...props}>
      {children}
    </section>
  )
}

/** Container — max-width centred wrapper */
export function Container({ size = 'lg', className = '', children, ...props }) {
  const maxWidths = {
    sm:   'max-w-2xl',
    md:   'max-w-4xl',
    lg:   'max-w-6xl',
    xl:   'max-w-7xl',
    full: 'max-w-full',
  }
  return (
    <div
      className={['mx-auto w-full px-6', maxWidths[size] ?? maxWidths.lg, className].join(' ')}
      {...props}
    >
      {children}
    </div>
  )
}
