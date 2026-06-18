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
    <h1 id={id} className="font-display text-3xl font-semibold text-[var(--text)] mt-8 mb-4 leading-tight scroll-mt-20">
      {children}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2 id={id} className="font-display text-2xl font-semibold text-[var(--text)] mt-8 mb-3 leading-tight scroll-mt-20">
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3 id={id} className="font-body text-xl font-semibold text-[var(--text-dim)] mt-6 mb-2 scroll-mt-20">
      {children}
    </h3>
  ),
  h4: ({ children, id }) => (
    <h4 id={id} className="font-body text-base font-semibold text-[var(--text-muted)] mt-4 mb-1 scroll-mt-20">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-[var(--text-muted)] leading-relaxed mb-4">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[var(--brand-teal)] underline decoration-[var(--brand-teal)]/30 underline-offset-3 hover:decoration-[var(--brand-teal)] transition-all duration-150"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  code: ({ inline, children }) => {
    if (inline) {
      return (
        <code className="font-mono text-[0.875em] px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-surface3)] border border-[var(--border)] text-[var(--brand-teal)]">
          {children}
        </code>
      )
    }
    return (
      <code className="font-mono text-sm text-[var(--text-dim)]">{children}</code>
    )
  },
  pre: ({ children }) => (
    <pre className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-4 overflow-x-auto mb-4 text-sm leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--brand-teal)] pl-4 my-4 text-[var(--text-faint)] italic">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-none mb-4 space-y-1.5 pl-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside mb-4 space-y-1.5 text-[var(--text-muted)]">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 text-[var(--text-muted)]">
      <span className="mt-[0.55em] w-1 h-1 rounded-full bg-[var(--brand-teal)] shrink-0" />
      <span>{children}</span>
    </li>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="text-left px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-[var(--text-faint)] border-b border-[var(--border)] bg-[var(--bg-surface3)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[var(--text-muted)] border-b border-[var(--border)]/50">{children}</td>
  ),
  hr: () => (
    <hr className="border-none border-t border-[var(--border)] my-8" />
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--text)]">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-[var(--text-dim)]">{children}</em>
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
