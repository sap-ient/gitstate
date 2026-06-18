/**
 * IssueDrawer — slide-in panel showing full issue detail.
 *
 * Two-truth-modes:
 *   - git issues: derived state shown read-only with a "manual override" affordance.
 *   - native issues: full editing (title, body, state, labels).
 *
 * LLM difficulty estimate shown with evidence-based framing (not story points).
 */
import { useState, useEffect, useCallback } from 'react'
import { GitBadge, NativeBadge, StateChip, LabelPills } from './IssueBadge.jsx'
import { Badge, Button } from './ui/index.js'

const STATES = ['open', 'in_progress', 'done', 'closed']

function Spinner() {
  return (
    <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function DifficultyMeter({ score }) {
  // score 1-5
  const labels = ['', 'Trivial', 'Easy', 'Medium', 'Hard', 'Complex']
  const colors = ['', '#2DD4BF', '#22c55e', '#f59e0b', '#f97316', '#ef4444']
  const s = Math.min(5, Math.max(1, Math.round(score)))
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(n => (
          <div
            key={n}
            className="w-5 h-1.5 rounded-full"
            style={{ background: n <= s ? colors[s] : 'var(--border2)' }}
          />
        ))}
      </div>
      <span className="text-xs font-semibold font-mono" style={{ color: colors[s] }}>{labels[s]}</span>
    </div>
  )
}

function EstimateBlock({ estimate }) {
  if (!estimate) return null
  return (
    <div className="rounded-[var(--radius-card)] p-4 space-y-2 bg-[var(--brand-indigo)]/[0.06] border border-[var(--brand-indigo)]/20">
      <div className="flex items-center gap-2 mb-1">
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--brand-indigo)" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <span className="text-xs font-semibold text-[var(--brand-indigo)]">LLM Difficulty Estimate</span>
        <Badge className="ml-auto">evidence-based · not story points</Badge>
      </div>
      {estimate.score != null && <DifficultyMeter score={estimate.score} />}
      {estimate.rationale && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{estimate.rationale}</p>
      )}
      {estimate.diffLines != null && (
        <p className="text-[10px] font-mono text-[var(--text-faint)]">
          {estimate.diffLines} lines changed · based on git diff
        </p>
      )}
    </div>
  )
}

function LinkedPR({ pr }) {
  if (!pr) return null
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-badge)] px-3 py-2 bg-[var(--brand-teal)]/[0.06] border border-[var(--brand-teal)]/15">
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--brand-teal)" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-7.5a2.25 2.25 0 0 0-2.25-2.25h-.75m-6 3.75 3 3m0 0 3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-.75" />
      </svg>
      <span className="text-xs text-[var(--brand-teal)] font-mono">PR #{pr.number}</span>
      <span className="text-xs text-[var(--text-muted)] flex-1 truncate">{pr.title}</span>
      <StateChip state={pr.state} />
    </div>
  )
}

export function IssueDrawer({ issue, onClose, onSave }) {
  const isGit = issue?.source === 'git'
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)

  const [title, setTitle] = useState(issue?.title ?? '')
  const [body, setBody] = useState(issue?.body ?? '')
  const [state, setState] = useState(issue?.state ?? 'open')
  const [overrideState, setOverrideState] = useState(issue?.manualStateOverride ?? '')

  const handleSave = useCallback(async () => {
    if (!issue) return
    setSaving(true)
    try {
      const patch = isGit
        ? { manualStateOverride: overrideState || null }
        : { title, body, state }
      await onSave(issue.id, patch)
      setEditing(false)
      setOverrideOpen(false)
    } finally {
      setSaving(false)
    }
  }, [issue, isGit, title, body, state, overrideState, onSave])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!issue) return null

  const inputCls = "w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-badge)] px-3 py-1.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors"

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(11,17,32,0.6)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col bg-[var(--bg-surface)] border-l border-[var(--border)]"
        style={{
          width: 'min(560px, 95vw)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-5 border-b border-[var(--border)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {isGit ? <GitBadge /> : <NativeBadge />}
              <StateChip state={issue.state} derivedState={issue.derivedState} />
              {issue.manualStateOverride && (
                <Badge color="yellow">overridden</Badge>
              )}
            </div>
            {editing && !isGit ? (
              <input
                className={inputCls + ' text-base font-semibold border-[var(--brand-teal)]/40'}
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            ) : (
              <h2 className="text-base font-semibold text-[var(--text)] leading-snug">{issue.title}</h2>
            )}
            {issue.platform && (
              <p className="text-xs font-mono text-[var(--text-faint)] mt-1">
                {issue.platform} · #{issue.externalId ?? issue.id?.slice(0, 8)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors mt-0.5"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Git-truth callout */}
          {isGit && (
            <div className="rounded-[var(--radius-card)] px-4 py-3 flex gap-3 items-start bg-[var(--brand-teal)]/[0.05] border border-[var(--brand-teal)]/18">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--brand-teal)" strokeWidth="2" className="shrink-0 mt-0.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <div>
                <p className="text-xs font-semibold text-[var(--brand-teal)] mb-0.5">State derived from git</p>
                <p className="text-xs text-[var(--text-faint)]">
                  {issue.derivedState
                    ? `Derived state: "${issue.derivedState.replace('_', ' ')}" — set from PR / commit activity.`
                    : 'Status reflects git reality — merged = done, PR open = in progress.'}
                  {' '}You can apply a manual override below.
                </p>
              </div>
            </div>
          )}

          {/* Manual override for git issues */}
          {isGit && (
            <div>
              <button
                onClick={() => setOverrideOpen(o => !o)}
                className="text-xs font-medium text-[var(--brand-indigo)] hover:text-[#818cf8] flex items-center gap-1 transition-colors"
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487 18.5 2.85a1.5 1.5 0 0 1 2.12 2.12l-9.56 9.56a4.5 4.5 0 0 1-1.897 1.13L6 16.5l.719-3.263a4.5 4.5 0 0 1 1.13-1.897l8.01-8.01-.994-.994Z" />
                </svg>
                {overrideOpen ? 'Hide override' : 'Manual override state'}
              </button>
              {overrideOpen && (
                <div className="mt-2 flex items-center gap-2">
                  <select
                    className="flex-1 bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-badge)] px-3 py-1.5 border border-[var(--border)] outline-none focus:border-[var(--brand-indigo)]/60 transition-colors"
                    value={overrideState}
                    onChange={e => setOverrideState(e.target.value)}
                  >
                    <option value="">— no override (git-derived) —</option>
                    {STATES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                  <Button size="sm" onClick={handleSave} disabled={saving} leftIcon={saving ? <Spinner /> : null}>
                    Apply
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Body text */}
          <div>
            <h3 className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-2 font-mono">Description</h3>
            {editing && !isGit ? (
              <textarea
                rows={6}
                className="w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-badge)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 resize-y transition-colors"
                value={body}
                onChange={e => setBody(e.target.value)}
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                {issue.body || <span className="italic text-[var(--text-faint)]">No description.</span>}
              </p>
            )}
          </div>

          {/* State selector for native issues */}
          {!isGit && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-2 font-mono">State</h3>
              {editing ? (
                <select
                  className="bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-badge)] px-3 py-1.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors"
                  value={state}
                  onChange={e => setState(e.target.value)}
                >
                  {STATES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              ) : (
                <StateChip state={issue.state} />
              )}
            </div>
          )}

          {/* Labels */}
          {issue.labels?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-2 font-mono">Labels</h3>
              <LabelPills labels={issue.labels} />
            </div>
          )}

          {/* Assignee */}
          {issue.assigneeId && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-2 font-mono">Assignee</h3>
              <p className="text-sm text-[var(--text-muted)] font-mono">{issue.assigneeId}</p>
            </div>
          )}

          {/* Linked PR */}
          {issue.pullRequest && (
            <div>
              <h3 className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-2 font-mono">Linked PR</h3>
              <LinkedPR pr={issue.pullRequest} />
            </div>
          )}

          {/* LLM estimate */}
          {issue.effortEstimate && <EstimateBlock estimate={issue.effortEstimate} />}
        </div>

        {/* Footer actions */}
        <div className="border-t border-[var(--border)] px-6 py-4 flex items-center gap-3">
          {!isGit && !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          )}
          {editing && (
            <>
              <Button size="sm" onClick={handleSave} disabled={saving} leftIcon={saving ? <Spinner /> : null}>
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          )}
          <span className="ml-auto text-xs text-[var(--text-faint)] font-mono">
            {issue.source === 'git' ? 'git-derived' : 'manual'}
          </span>
        </div>
      </div>
    </>
  )
}
