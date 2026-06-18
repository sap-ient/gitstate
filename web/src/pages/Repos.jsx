/**
 * Repos page — connect repos + list + trigger sync.
 */
import { useState, useCallback } from 'react'
import { useRepos } from '../lib/useRepos.js'
import { Card, Badge, Button } from '../components/ui/index.js'

const PLATFORMS = [
  { id: 'github', label: 'GitHub' },
  { id: 'gitlab', label: 'GitLab' },
]

function Spinner() {
  return (
    <svg className="animate-spin shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function FormInput({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-[var(--text-faint)] mt-1 font-mono">{hint}</p>}
    </div>
  )
}

function ConnectForm({ onConnect, onClose }) {
  const [platform, setPlatform] = useState('github')
  const [fullName, setFullName] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!fullName.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onConnect({ platform, fullName: fullName.trim(), token: token.trim() || undefined })
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to connect repo')
    } finally {
      setSaving(false)
    }
  }, [platform, fullName, token, onConnect, onClose])

  return (
    <Card padding="lg" className="mb-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text)] font-display">Connect a repository</h3>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">
            gitstate will read commits, PRs, and issues to derive project state.
          </p>
        </div>
        <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Platform */}
        <FormInput label="Platform">
          <div className="flex gap-2">
            {PLATFORMS.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={[
                  'flex items-center gap-2 px-4 py-2 rounded-[var(--radius-btn)] text-sm font-medium transition-all duration-150 border',
                  platform === p.id
                    ? 'bg-[var(--brand-teal)]/10 border-[var(--brand-teal)]/40 text-[var(--brand-teal)]'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border2)]',
                ].join(' ')}
              >
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                  {p.id === 'github' ? (
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  ) : (
                    <path d="M4.845.904C3.891.904 3.034 1.317 2.316 2.2.918 3.838.904 5.84.904 5.908v12.184c0 .069.014 2.07 1.412 3.707.718.882 1.576 1.297 2.529 1.297h16.31c.945 0 1.804-.41 2.524-1.29C25.082 20.166 25.096 18.16 25.096 18.092V5.908c0-.069-.014-2.07-1.412-3.708C22.966 1.317 22.109.904 21.155.904H4.845zm10.31 16.334h-4.31v-7.65h4.31v7.65z" />
                  )}
                </svg>
                {p.label}
              </button>
            ))}
          </div>
        </FormInput>

        <FormInput label={<>Repository <span className="text-red-400">*</span></>} hint="e.g. exo/gitstate">
          <input
            autoFocus
            required
            type="text"
            placeholder="owner/repo-name"
            className="w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50 placeholder-[var(--text-faint)] font-mono transition-colors"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />
        </FormInput>

        <FormInput label={<>Access token <span className="text-[var(--text-faint)] font-normal normal-case">(optional for public repos)</span></>}>
          <input
            type="password"
            placeholder="ghp_… or glpat-…"
            className="w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50 placeholder-[var(--text-faint)] font-mono transition-colors"
            value={token}
            onChange={e => setToken(e.target.value)}
          />
        </FormInput>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/[0.08] rounded px-3 py-2">{error}</p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={saving || !fullName.trim()} leftIcon={saving ? <Spinner /> : null}>
            Connect repository
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Card>
  )
}

function SyncButton({ repoId, syncing, onSync }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onSync(repoId) }}
      disabled={syncing}
      className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-faint)] hover:text-[var(--brand-teal)] transition-colors disabled:opacity-50"
      title="Trigger sync"
    >
      <svg
        width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"
        className={syncing ? 'animate-spin' : ''}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      {syncing ? 'Syncing…' : 'Sync'}
    </button>
  )
}

function RepoRow({ repo, onSync }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface2)] transition-colors">
      {/* Platform indicator */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: repo.platform === 'github' ? 'var(--brand-teal)' : '#f59e0b' }}
        title={repo.platform}
      />

      {/* Repo name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text)] font-mono truncate">{repo.fullName}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-[var(--text-faint)] font-mono">{repo.platform}</span>
          {repo.lastSyncedAt ? (
            <span className="text-xs text-[var(--text-faint)]">
              synced {new Date(repo.lastSyncedAt).toLocaleDateString()}
            </span>
          ) : (
            <Badge color="yellow">never synced</Badge>
          )}
        </div>
      </div>

      {/* Stats */}
      {repo.issueCount != null && (
        <div className="hidden sm:flex items-center gap-1 text-xs font-mono text-[var(--text-faint)]">
          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          {repo.issueCount} issues
        </div>
      )}

      <SyncButton repoId={repo.id} syncing={repo.syncing} onSync={onSync} />
    </div>
  )
}

export default function Repos() {
  const { repos, loading, error, connectRepo, syncRepo } = useRepos()
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Repositories</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">
            Connected repos are the source of truth for dev work.
          </p>
        </div>
        {!showForm && (
          <Button
            variant="primary"
            onClick={() => setShowForm(true)}
            leftIcon={
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            }
          >
            Connect repo
          </Button>
        )}
      </div>

      {/* Connect form */}
      {showForm && (
        <ConnectForm onConnect={connectRepo} onClose={() => setShowForm(false)} />
      )}

      {/* Repo list */}
      <Card padding="none" className="overflow-hidden">
        {/* List header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-surface2)]/50">
          <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest flex-1">Repository</span>
          <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest hidden sm:block w-24">Issues</span>
          <span className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest w-14">Sync</span>
        </div>

        {loading && (
          <div className="py-12 text-center">
            <svg className="animate-spin mx-auto" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
            </svg>
            <p className="text-xs text-[var(--text-faint)] mt-2">Loading repos…</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-10 px-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs text-[var(--text-faint)] mt-1">Connect a repo above to get started.</p>
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div className="py-16 text-center px-6">
            <div className="w-12 h-12 rounded-[var(--radius-card)] flex items-center justify-center mx-auto mb-4 bg-[var(--brand-teal)]/[0.06] border border-[var(--brand-teal)]/20">
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--brand-teal)" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-1">No repositories yet</h3>
            <p className="text-xs text-[var(--text-faint)] max-w-xs mx-auto mb-4">
              Connect a GitHub or GitLab repo and gitstate will derive project state from git — no ticket maintenance.
            </p>
            <Button variant="primary" onClick={() => setShowForm(true)}>Connect first repo</Button>
          </div>
        )}

        {!loading && repos.map(repo => (
          <RepoRow key={repo.id} repo={repo} onSync={syncRepo} />
        ))}
      </Card>

      <p className="text-xs text-[var(--text-faint)] font-mono mt-4">
        Derived from git · merged = done · PR open = in progress · no manual status updates
      </p>
    </div>
  )
}
