/**
 * ChatMarkdown — compact markdown renderer tuned for chat bubbles.
 *
 * The site-wide <Markdown> uses doc-page rhythm (mt-14, my-6, 2.1rem h1) which is
 * far too airy inside a narrow chat rail. This is the same react-markdown + GFM
 * stack with tight, conversational spacing, copyable code blocks, and tables that
 * scroll. Streamed text re-renders cheaply because the parts list is stable.
 */
import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)
  const codeEl = Array.isArray(children) ? children[0] : children
  const langClass = codeEl?.props?.className ?? ''
  const lang = (/language-([\w-]+)/.exec(langClass) || [])[1] ?? ''
  const text = (() => {
    const c = codeEl?.props?.children
    return typeof c === 'string' ? c : Array.isArray(c) ? c.join('') : ''
  })()

  const onCopy = useCallback(() => {
    navigator.clipboard?.writeText(text.replace(/\n$/, '')).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }, [text])

  return (
    <div className="group/code relative my-2.5">
      <pre className="overflow-x-auto rounded-[var(--radius-badge)] border border-[var(--border)] bg-[var(--bg-surface)] p-3 pt-7 text-[11.5px] leading-[1.6]">
        {children}
      </pre>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-2.5 py-1.5">
        <span className="select-none font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-faint)]">{lang}</span>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="pointer-events-auto inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-surface2)]/80 px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-faint)] opacity-0 backdrop-blur transition-all hover:text-[var(--text-muted)] group-hover/code:opacity-100 focus:opacity-100"
        >
          {copied ? <Check size={10} className="text-[var(--brand-teal)]" /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

const components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-[1.6]">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      className="font-medium text-[var(--brand-teal)] underline decoration-[var(--brand-teal)]/30 underline-offset-2 hover:decoration-[var(--brand-teal)]"
    >
      {children}
    </a>
  ),
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 first:mt-0 text-[15px] font-semibold text-[var(--text)]">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 first:mt-0 text-[14px] font-semibold text-[var(--text)]">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 first:mt-0 text-[13px] font-semibold text-[var(--text-dim)]">{children}</h3>,
  ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 marker:text-[var(--brand-teal)]">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 marker:text-[var(--text-faint)]">{children}</ol>,
  li: ({ children }) => <li className="leading-[1.55] pl-0.5">{children}</li>,
  code: ({ inline, children, className }) =>
    inline ? (
      <code className="rounded border border-[var(--border)] bg-[var(--bg-surface3)] px-1 py-px font-mono text-[0.82em] text-[var(--brand-teal)]">{children}</code>
    ) : (
      <code className={['font-mono text-[0.82em] text-[var(--text-dim)]', className].filter(Boolean).join(' ')}>{children}</code>
    ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--brand-teal)] pl-3 italic text-[var(--text-faint)]">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2.5 overflow-x-auto rounded-[var(--radius-badge)] border border-[var(--border)]">
      <table className="w-full border-collapse text-[11.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--bg-surface2)]">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[var(--border)] px-2.5 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-[var(--text-faint)] whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border)]/50 px-2.5 py-1.5 text-[var(--text-muted)] whitespace-nowrap">{children}</td>
  ),
  tr: ({ children }) => <tr className="hover:bg-[var(--bg-surface2)]/60">{children}</tr>,
  hr: () => <hr className="my-3 h-px border-none bg-[var(--border)]" />,
  strong: ({ children }) => <strong className="font-semibold text-[var(--text)]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[var(--text-dim)]">{children}</em>,
}

export function ChatMarkdown({ children }) {
  return (
    <div className="text-sm text-[var(--text-dim)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children || ''}
      </ReactMarkdown>
    </div>
  )
}
