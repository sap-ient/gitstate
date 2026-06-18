/**
 * CreateIssueModal — form to create a native (manual) issue.
 * Makes the "manually tracked, not derived from git" distinction visible and tasteful.
 */
import { useState, useCallback, useEffect } from 'react'
import { Badge, Button } from './ui/index.js'

export function CreateIssueModal({ projects, onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onCreate({ title: title.trim(), body: body.trim(), projectId: projectId || undefined })
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to create issue')
    } finally {
      setSaving(false)
    }
  }, [title, body, projectId, onCreate, onClose])

  const inputCls = "w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50 placeholder-[var(--text-faint)] transition-colors"

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(11,17,32,0.7)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-badge)] flex items-center justify-center shrink-0 bg-[var(--bg-surface3)] border border-[var(--border)]">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487 18.5 2.85a1.5 1.5 0 0 1 2.12 2.12l-9.56 9.56a4.5 4.5 0 0 1-1.897 1.13L6 16.5l.719-3.263a4.5 4.5 0 0 1 1.13-1.897l8.01-8.01-.994-.994Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text)] font-display">New manual task</h2>
              <p className="text-xs text-[var(--text-faint)] mt-0.5">
                Tracked here · not derived from git · for non-dev work
              </p>
            </div>
            <button onClick={onClose} className="ml-auto text-[var(--text-faint)] hover:text-[var(--text)] transition-colors">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Callout — two-truth-modes context */}
        <div className="mx-6 mt-4 rounded-[var(--radius-badge)] px-4 py-3 flex items-start gap-2.5 bg-[var(--bg-surface3)]/60 border border-[var(--border)]">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="var(--text-muted)" strokeWidth="2" className="shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
          </svg>
          <p className="text-xs text-[var(--text-faint)] leading-relaxed">
            Dev work (code / PRs) is <strong className="text-[var(--text-muted)]">automatically derived from git</strong> —
            you don&apos;t create those here. This form is for non-dev work that lives outside a repo:
            meetings, research, design, client calls, ops tasks.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus required type="text"
              placeholder="e.g. Client kick-off call, Design review, Q3 planning"
              className={inputCls}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="What needs to be done? Context, deliverables, links…"
              className={inputCls + ' resize-y'}
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>

          {projects?.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
                Project
              </label>
              <select
                className={inputCls}
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">— no project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/[0.08] rounded px-3 py-2">{error}</p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button
              type="submit"
              disabled={saving || !title.trim()}
              leftIcon={saving && (
                <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
                </svg>
              )}
            >
              Create task
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Badge className="ml-auto">source: manual</Badge>
          </div>
        </form>
      </div>
    </>
  )
}
