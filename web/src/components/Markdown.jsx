/**
 * Markdown — renders markdown with brand typography.
 * Uses react-markdown + remark-gfm + rehype-slug.
 *
 * Reading-experience features:
 *   - Headings carry a hover-revealed anchor link (#) that copies a deep link.
 *   - Fenced code blocks get a language tag + a copy-to-clipboard button.
 *   - Blockquotes that open with a GFM-style `[!NOTE] / [!TIP] / [!WARNING] /
 *     [!IMPORTANT] / [!CAUTION]` marker — or a bold `**Note:**` lead — render as
 *     coloured callout cards instead of plain quotes.
 *
 * Usage:
 *   <Markdown>{markdownString}</Markdown>
 *   <Markdown className="prose-sm">{content}</Markdown>
 */
import { useState, useCallback, isValidElement, Children } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { Check, Copy, Link2, Info, Lightbulb, AlertTriangle, AlertOctagon, Flame } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────

/** Flatten a React children tree to a plain string (for copy + callout sniffing). */
function toText(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(toText).join('')
  if (isValidElement(node)) return toText(node.props?.children)
  return ''
}

// ── Heading with anchor link ──────────────────────────────────────────────────

function Heading({ as: Tag, id, className, children }) {
  const [copied, setCopied] = useState(false)
  const onCopy = useCallback(
    (e) => {
      e.preventDefault()
      if (!id) return
      const url = `${window.location.origin}${window.location.pathname}#${id}`
      navigator.clipboard?.writeText(url).catch(() => {})
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (window.history?.replaceState) window.history.replaceState(null, '', `#${id}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    },
    [id]
  )
  return (
    <Tag id={id} className={`group/anchor relative scroll-mt-24 ${className}`}>
      {children}
      {id && (
        <a
          href={`#${id}`}
          onClick={onCopy}
          aria-label={`Link to "${toText(children)}"`}
          className="ml-2 inline-flex h-5 w-5 -translate-y-px items-center justify-center rounded-md align-middle text-[var(--text-faint)] opacity-0 transition-all duration-150 hover:text-[var(--brand-teal)] hover:bg-[var(--bg-surface2)] group-hover/anchor:opacity-100 focus:opacity-100"
        >
          {copied ? <Check size={13} className="text-[var(--brand-teal)]" /> : <Link2 size={13} />}
        </a>
      )}
    </Tag>
  )
}

// ── Code block with copy button + language tag ────────────────────────────────

function CodeBlock({ children }) {
  const [copied, setCopied] = useState(false)

  // react-markdown hands <pre> a single <code> child; pull lang + text off it.
  const codeEl = Array.isArray(children) ? children[0] : children
  const langClass = codeEl?.props?.className ?? ''
  const langMatch = /language-([\w-]+)/.exec(langClass)
  const lang = langMatch ? langMatch[1] : ''
  const text = toText(codeEl?.props?.children ?? codeEl)

  const onCopy = useCallback(() => {
    navigator.clipboard?.writeText(text.replace(/\n$/, '')).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }, [text])

  const LANG_LABELS = {
    bash: 'shell', sh: 'shell', shell: 'shell', zsh: 'shell',
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    go: 'go', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml',
    http: 'http', env: 'env', dockerfile: 'dockerfile', toml: 'toml',
  }
  const label = LANG_LABELS[lang?.toLowerCase()] ?? lang

  return (
    <div className="group/code relative my-6">
      <pre
        className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 pt-9 text-[0.84em] leading-[1.7]"
        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.2), 0 6px 18px rgba(0,0,0,0.12)' }}
      >
        {children}
      </pre>

      {/* top bar: language tag (left) + copy (right) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-2">
        {label ? (
          <span className="select-none font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-faint)]">
            {label}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-surface2)]/80 px-2 py-1 font-mono text-[10px] text-[var(--text-faint)] opacity-0 backdrop-blur transition-all duration-150 hover:border-[var(--border2)] hover:text-[var(--text-muted)] group-hover/code:opacity-100 focus:opacity-100"
        >
          {copied ? (
            <>
              <Check size={11} className="text-[var(--brand-teal)]" />
              <span className="text-[var(--brand-teal)]">Copied</span>
            </>
          ) : (
            <>
              <Copy size={11} />
              Copy
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Callout / admonition ──────────────────────────────────────────────────────

const CALLOUTS = {
  note: { icon: Info, label: 'Note', accent: 'var(--brand-indigo)', tint: 'rgba(99,102,241,0.07)' },
  info: { icon: Info, label: 'Note', accent: 'var(--brand-indigo)', tint: 'rgba(99,102,241,0.07)' },
  tip: { icon: Lightbulb, label: 'Tip', accent: 'var(--brand-teal)', tint: 'rgba(45,212,191,0.07)' },
  important: { icon: Flame, label: 'Important', accent: 'var(--brand-teal)', tint: 'rgba(45,212,191,0.08)' },
  warning: { icon: AlertTriangle, label: 'Warning', accent: '#f59e0b', tint: 'rgba(245,158,11,0.08)' },
  caution: { icon: AlertOctagon, label: 'Caution', accent: '#ef4444', tint: 'rgba(239,68,68,0.08)' },
}

/** Detect a callout kind from the first line of a blockquote, returning
 *  { kind, label, stripMarker } or null. Supports `[!NOTE]` and `**Note:**`. */
function detectCallout(firstText) {
  if (!firstText) return null
  const gfm = /^\s*\[!(\w+)\]\s*/i.exec(firstText)
  if (gfm) {
    const kind = gfm[1].toLowerCase()
    if (CALLOUTS[kind]) return { kind, customLabel: null, marker: gfm[0] }
  }
  const bold = /^\s*(note|tip|important|warning|caution|info)\b\s*:?/i.exec(firstText)
  if (bold) {
    const kind = bold[1].toLowerCase()
    if (CALLOUTS[kind]) return { kind, customLabel: null, marker: null }
  }
  return null
}

function Callout({ kind, customLabel, children }) {
  const meta = CALLOUTS[kind] ?? CALLOUTS.note
  const Icon = meta.icon
  return (
    <div
      className="my-6 flex gap-3 rounded-xl border px-4 py-3.5"
      style={{
        background: meta.tint,
        borderColor: 'var(--border)',
        boxShadow: `inset 3px 0 0 0 ${meta.accent}`,
      }}
    >
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
        style={{ color: meta.accent }}
        aria-hidden="true"
      >
        <Icon size={16} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: meta.accent }}
        >
          {customLabel ?? meta.label}
        </p>
        <div className="text-[0.9rem] leading-[1.7] text-[var(--text-muted)] [&>p]:mb-0 [&>p]:text-[0.9rem] [&>p]:leading-[1.7] [&>p+p]:mt-2 [&>ul]:mb-0 [&>ul]:mt-1">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── component table ───────────────────────────────────────────────────────────

const components = {
  h1: ({ children, id }) => (
    <Heading as="h1" id={id} className="font-display text-[2.1rem] font-semibold text-[var(--text)] mt-0 mb-5 leading-[1.15] tracking-tight">
      {children}
    </Heading>
  ),
  h2: ({ children, id }) => (
    <Heading as="h2" id={id} className="font-display text-[1.4rem] font-semibold text-[var(--text)] mt-14 mb-4 leading-[1.25] tracking-tight">
      {children}
    </Heading>
  ),
  h3: ({ children, id }) => (
    <Heading as="h3" id={id} className="font-display text-[1.1rem] font-semibold text-[var(--text-dim)] mt-9 mb-3 leading-snug">
      {children}
    </Heading>
  ),
  h4: ({ children, id }) => (
    <h4 id={id} className="font-body text-base font-semibold text-[var(--text-muted)] mt-6 mb-2 scroll-mt-24">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="text-[var(--text-muted)] leading-[1.8] mb-5 text-[0.9375rem]">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-[var(--brand-teal)] underline decoration-[var(--brand-teal)]/30 underline-offset-[3px] transition-all duration-150 hover:decoration-[var(--brand-teal)]"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  code: ({ inline, children, className: langClass }) => {
    if (inline) {
      return (
        <code className="rounded-[4px] border border-[var(--border)] bg-[var(--bg-surface3)] px-[0.4em] py-[0.15em] font-mono text-[0.84em] text-[var(--brand-teal)]">
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
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  blockquote: ({ children }) => {
    // Look at the first meaningful child's text to decide callout vs. quote.
    const kids = Children.toArray(children)
    const firstEl = kids.find((c) => isValidElement(c))
    const firstText = toText(firstEl)
    const detected = detectCallout(firstText)

    if (detected) {
      // Strip a leading `[!NOTE]`/`**Note:**` marker from the first paragraph so
      // it doesn't repeat the label, then render as a callout card.
      const stripped = kids.map((child) => {
        if (child !== firstEl || !isValidElement(child)) return child
        const inner = Children.toArray(child.props.children)
        // Drop a leading `[!KIND]` token if present.
        if (detected.marker && typeof inner[0] === 'string') {
          inner[0] = inner[0].replace(/^\s*\[!\w+\]\s*/i, '')
          if (inner[0] === '') inner.shift()
        }
        // Drop a leading bold lead-in like **Note:** (it becomes the label).
        // The first child is a (custom) <strong> element whose text is the kind;
        // match on flattened text rather than element type, then trim any ": ".
        if (!detected.marker && isValidElement(inner[0])) {
          const leadText = toText(inner[0]).trim().toLowerCase().replace(/:$/, '')
          if (leadText === detected.kind) {
            inner.shift()
            if (typeof inner[0] === 'string') inner[0] = inner[0].replace(/^\s*:?\s*/, '')
          }
        }
        return { ...child, props: { ...child.props, children: inner } }
      })
      return <Callout kind={detected.kind} customLabel={detected.customLabel}>{stripped}</Callout>
    }

    return (
      <blockquote
        className="my-6 border-l-[3px] border-[var(--brand-teal)] pl-5 italic text-[var(--text-faint)]"
        style={{ background: 'var(--bg-surface)', borderRadius: '0 8px 8px 0', padding: '0.75rem 1.25rem' }}
      >
        {children}
      </blockquote>
    )
  },
  ul: ({ children }) => <ul className="mb-5 list-none space-y-2 pl-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-5 list-none space-y-2.5 pl-0">{children}</ol>,
  li: ({ children, ordered }) => (
    <li className="flex gap-3 text-[0.9375rem] leading-[1.7] text-[var(--text-muted)]">
      {ordered ? (
        <span
          className="mt-[0.15em] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--brand-teal)]/10 font-mono text-[10px] font-semibold text-[var(--brand-teal)]"
          aria-hidden="true"
        >
          ·
        </span>
      ) : (
        <span
          className="mt-[0.68em] h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: 'var(--brand-teal)', opacity: 0.7 }}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0">{children}</span>
    </li>
  ),
  table: ({ children }) => (
    <div className="mb-6 overflow-x-auto rounded-xl border border-[var(--border)]" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: 'var(--bg-surface2)' }}>{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-[var(--border)] px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-[var(--text-faint)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border)]/50 px-4 py-3 text-[0.875rem] leading-relaxed text-[var(--text-muted)]">
      {children}
    </td>
  ),
  tr: ({ children }) => <tr className="transition-colors hover:bg-[var(--bg-surface2)]">{children}</tr>,
  hr: () => <hr className="my-10 h-px border-none" style={{ background: 'var(--border)' }} />,
  strong: ({ children }) => <strong className="font-semibold text-[var(--text)]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[var(--text-dim)]">{children}</em>,
  img: ({ src, alt }) => (
    <span className="my-7 block">
      <img
        src={src}
        alt={alt ?? ''}
        className="block max-w-full rounded-xl border border-[var(--border)]"
        style={{
          maxHeight: '480px',
          objectFit: 'contain',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2), 0 12px 32px rgba(0,0,0,0.14)',
        }}
        loading="lazy"
      />
      {alt && (
        <span className="mt-2.5 block text-center font-mono text-xs text-[var(--text-faint)]">{alt}</span>
      )}
    </span>
  ),
}

export function Markdown({ children, className = '' }) {
  return (
    <div className={['gs-markdown', className].join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
