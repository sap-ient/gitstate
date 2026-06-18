/**
 * Markdown — renders markdown with brand typography.
 * Uses react-markdown + remark-gfm + rehype-slug.
 *
 * Usage:
 *   <Markdown>{markdownString}</Markdown>
 *   <Markdown className="prose-sm">{content}</Markdown>
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'

const components = {
  h1: ({ children, id }) => (
    <h1
      id={id}
      className="font-display text-[2rem] font-semibold text-[var(--text)] mt-0 mb-5 leading-[1.2] tracking-tight scroll-mt-24"
    >
      {children}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2
      id={id}
      className="font-display text-[1.4rem] font-semibold text-[var(--text)] mt-12 mb-4 leading-[1.25] tracking-tight scroll-mt-24"
    >
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3
      id={id}
      className="font-display text-[1.1rem] font-semibold text-[var(--text-dim)] mt-8 mb-3 leading-snug scroll-mt-24"
    >
      {children}
    </h3>
  ),
  h4: ({ children, id }) => (
    <h4
      id={id}
      className="font-body text-base font-semibold text-[var(--text-muted)] mt-6 mb-2 scroll-mt-24"
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-[var(--text-muted)] leading-[1.8] mb-5 text-[0.9375rem]">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[var(--brand-teal)] underline decoration-[var(--brand-teal)]/30 underline-offset-[3px] hover:decoration-[var(--brand-teal)] transition-all duration-150 font-medium"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  code: ({ inline, children, className: langClass }) => {
    if (inline) {
      return (
        <code className="font-mono text-[0.84em] px-[0.4em] py-[0.15em] rounded-[4px] bg-[var(--bg-surface3)] border border-[var(--border)] text-[var(--brand-teal)]">
          {children}
        </code>
      )
    }
    return (
      <code className={['font-mono text-[0.84em] text-[var(--text-dim)]', langClass].filter(Boolean).join(' ')}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 overflow-x-auto mb-6 mt-2 text-[0.84em] leading-[1.7]"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.12)' }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-[3px] border-[var(--brand-teal)] pl-5 my-6 text-[var(--text-faint)] italic"
      style={{ background: 'var(--bg-surface)', borderRadius: '0 8px 8px 0', padding: '0.75rem 1.25rem' }}
    >
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-none mb-5 space-y-2 pl-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-none mb-5 space-y-2 pl-0 counter-reset-[item]">{children}</ol>
  ),
  li: ({ children, ordered }) => (
    <li className="flex gap-3 text-[var(--text-muted)] text-[0.9375rem] leading-[1.7]">
      {ordered ? (
        <span
          className="mt-[0.35em] flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold text-[var(--brand-teal)] bg-[var(--brand-teal)]/10"
          aria-hidden="true"
        >
          ·
        </span>
      ) : (
        <span
          className="mt-[0.68em] w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: 'var(--brand-teal)', opacity: 0.7 }}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </li>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-6 rounded-xl border border-[var(--border)]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'var(--bg-surface2)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left px-4 py-2.5 font-mono text-[11px] uppercase tracking-widest text-[var(--text-faint)] border-b border-[var(--border)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-[var(--text-muted)] border-b border-[var(--border)]/50 text-[0.875rem] leading-relaxed">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors hover:bg-[var(--bg-surface2)]">{children}</tr>
  ),
  hr: () => (
    <hr className="border-none h-px my-10" style={{ background: 'var(--border)' }} />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text)]">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-[var(--text-dim)]">{children}</em>
  ),
  img: ({ src, alt }) => (
    <span className="block my-6">
      <img
        src={src}
        alt={alt ?? ''}
        className="max-w-full rounded-xl border border-[var(--border)] block"
        style={{
          maxHeight: '480px',
          objectFit: 'contain',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.12)',
        }}
        loading="lazy"
      />
      {alt && (
        <span className="block mt-2 text-center text-xs text-[var(--text-faint)] font-mono">
          {alt}
        </span>
      )}
    </span>
  ),
}

export function Markdown({ children, className = '' }) {
  return (
    <div className={['gs-markdown', className].join(' ')}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
