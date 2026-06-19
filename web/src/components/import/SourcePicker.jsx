/**
 * SourcePicker — step 1 of the import wizard: choose Jira or Linear.
 * lucide-react has no brand glyphs, so we draw simple provider marks inline.
 */
import { ArrowRight } from 'lucide-react'
import { Card } from '../ui/index.js'
import { SOURCES } from '../../lib/useImport.js'

/** Jira mark — Atlassian blue diamonds. */
function JiraMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M15.5 2.5 6 12h6.7L22 2.5z" fill="#2684FF" />
      <path d="M16.5 29.5 26 20h-6.7L10 29.5z" fill="#2684FF" />
      <path d="M6 12h9.5v9.5L6 12z" fill="#0052CC" />
      <path d="M26 20h-9.5v-9.5L26 20z" fill="#0052CC" />
    </svg>
  )
}

/** Linear mark — purple gradient square. */
function LinearMark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="lin-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5E6AD2" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
      </defs>
      <path
        fill="url(#lin-g)"
        d="M1.2 61.5 38.5 98.8a50 50 0 0 1-37.3-37.3zM.2 47.4 52.6 99.8a50 50 0 0 0 11.2-2.1L2.3 36.2A50 50 0 0 0 .2 47.4zM5.6 28.8 71.2 94.4a50 50 0 0 0 8-5.2L10.8 20.8a50 50 0 0 0-5.2 8zM16.2 15.2A50 50 0 1 1 84.8 83.8z"
      />
    </svg>
  )
}

const MARKS = { jira: JiraMark, linear: LinearMark }

export function SourcePicker({ selected, onSelect }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {Object.values(SOURCES).map((s) => {
        const Mark = MARKS[s.id]
        const active = selected === s.id
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] rounded-[var(--radius-card)]"
          >
            <Card
              hoverable
              className={[
                'h-full transition-colors',
                active ? 'border-[var(--brand-teal)] ring-1 ring-[var(--brand-teal)]/40' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 rounded-[var(--radius-btn)] bg-[var(--bg-surface3)] p-2">
                  <Mark />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-semibold text-[var(--text)]">
                      {s.label}
                    </span>
                    {active && <ArrowRight size={15} className="text-[var(--brand-teal)]" />}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)] leading-snug">{s.blurb}</p>
                </div>
              </div>
            </Card>
          </button>
        )
      })}
    </div>
  )
}
