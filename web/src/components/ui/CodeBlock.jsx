/**
 * CodeBlock — monospace code display with optional filename header.
 * DiffBlock — like CodeBlock but understands + / - line prefixes.
 *
 * Usage:
 *   <CodeBlock lang="go" filename="main.go">{code}</CodeBlock>
 *   <DiffBlock>{diff}</DiffBlock>
 */
import { Badge } from './Badge.jsx'

export function CodeBlock({ lang, filename, className = '', children }) {
  const code = typeof children === 'string' ? children : String(children)
  return (
    <div className={['rounded-[var(--radius-card)] border border-[var(--border)] overflow-hidden', className].join(' ')}>
      {/* Header */}
      {(filename || lang) && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg-surface3)] border-b border-[var(--border)]">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          {filename && (
            <span className="font-mono text-xs text-[var(--text-muted)] ml-1">{filename}</span>
          )}
          {lang && !filename && (
            <span className="font-mono text-xs text-[var(--text-faint)]">{lang}</span>
          )}
        </div>
      )}
      {/* Body */}
      <pre className="p-4 overflow-x-auto bg-[var(--bg-surface)] m-0">
        <code className="font-mono text-[13px] leading-relaxed text-[var(--text-dim)]">
          {code}
        </code>
      </pre>
    </div>
  )
}

/** DiffBlock — colours lines starting with + or - */
export function DiffBlock({ className = '', filename, children }) {
  const raw = typeof children === 'string' ? children : String(children)
  const lines = raw.split('\n')

  return (
    <div className={['rounded-[var(--radius-card)] border border-[var(--border)] overflow-hidden', className].join(' ')}>
      {/* Header */}
      {filename && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-surface3)] border-b border-[var(--border)]">
          <span className="font-mono text-xs text-[var(--text-muted)]">{filename}</span>
          <div className="flex gap-2">
            <Badge color="add">+lines</Badge>
            <Badge color="del">−lines</Badge>
          </div>
        </div>
      )}
      <pre className="p-0 overflow-x-auto bg-[var(--bg-surface)] m-0">
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++')
          const isDel = line.startsWith('-') && !line.startsWith('---')
          return (
            <div
              key={i}
              className={[
                'px-4 py-0.5 font-mono text-[13px] leading-relaxed flex',
                isAdd ? 'bg-green-500/8 text-green-300' :
                isDel ? 'bg-red-500/8 text-red-300' :
                'text-[var(--text-muted)]',
              ].join(' ')}
            >
              <span className={['w-5 shrink-0 select-none mr-2', isAdd ? 'text-green-500' : isDel ? 'text-red-500' : 'text-[var(--text-faint)]'].join(' ')}>
                {isAdd ? '+' : isDel ? '−' : ' '}
              </span>
              <span>{line.slice(1)}</span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}
