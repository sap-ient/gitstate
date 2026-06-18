/**
 * Projects page — list projects, create new ones, link to filtered board.
 * Shows burndown chart when a project card is selected.
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects } from '../lib/useProjects.js'
import { BurndownChart } from '../components/BurndownChart.jsx'
import { Card, Badge, Button } from '../components/ui/index.js'

function Spinner() {
  return (
    <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function InputField({ label, required, ...props }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        {...props}
        required={required}
        className="w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50 placeholder-[var(--text-faint)] transition-colors"
      />
    </div>
  )
}

function CreateProjectModal({ onClose, onCreate }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onCreate({ name: name.trim(), description: description.trim() })
      onClose()
    } catch (err) {
      setError(err.message ?? 'Failed to create project')
    } finally {
      setSaving(false)
    }
  }, [name, description, onCreate, onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(11,17,32,0.7)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-card)] bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl">
        <div className="px-6 pt-6 pb-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text)] font-display">New project</h2>
          <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <InputField
            label="Name"
            required
            autoFocus
            type="text"
            placeholder="e.g. Q3 Launch, API v2, Mobile App"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <div>
            <label className="block text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="What is this project for?"
              className="w-full bg-[var(--bg)] text-[var(--text)] text-sm rounded-[var(--radius-btn)] px-3 py-2.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/50 placeholder-[var(--text-faint)] resize-none transition-colors"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          {error && (
            <p className="text-xs text-red-400 bg-red-500/[0.08] rounded px-3 py-2">{error}</p>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={saving || !name.trim()} leftIcon={saving ? <Spinner /> : null}>
              Create project
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </>
  )
}

const STATUS_COLORS = {
  active: 'teal',
  stale: 'yellow',
  done: 'indigo',
}

function ProjectCard({ project, selected, onClick }) {
  const badgeColor = STATUS_COLORS[project.status ?? 'active'] ?? 'teal'

  return (
    <Card
      hoverable
      onClick={() => onClick(project)}
      className={[
        'cursor-pointer',
        selected ? 'ring-2 ring-[var(--brand-teal)]/40' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className={[
          'w-8 h-8 rounded-[var(--radius-badge)] flex items-center justify-center shrink-0',
          badgeColor === 'teal' ? 'bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/25' :
          badgeColor === 'yellow' ? 'bg-yellow-500/10 border border-yellow-500/25' :
          'bg-[var(--brand-indigo)]/10 border border-[var(--brand-indigo)]/25',
        ].join(' ')}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24"
            stroke={badgeColor === 'teal' ? 'var(--brand-teal)' : badgeColor === 'yellow' ? '#f59e0b' : 'var(--brand-indigo)'}
            strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text)] truncate">{project.name}</h3>
          {project.description && (
            <p className="text-xs text-[var(--text-faint)] mt-0.5 line-clamp-2">{project.description}</p>
          )}
        </div>
        <Badge color={badgeColor}>{project.status ?? 'active'}</Badge>
      </div>

      <div className="flex items-center gap-4 text-xs font-mono text-[var(--text-faint)]">
        {project.issueCount != null && <span>{project.issueCount} issues</span>}
        {project.repoCount != null && <span>{project.repoCount} repos</span>}
        {project.updatedAt && (
          <span className="ml-auto">{new Date(project.updatedAt).toLocaleDateString()}</span>
        )}
      </div>
    </Card>
  )
}

export default function Projects() {
  const navigate = useNavigate()
  const { projects, loading, error, createProject } = useProjects()
  const [showCreate, setShowCreate] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(null)

  const handleProjectClick = useCallback((project) => {
    setSelectedProjectId(prev => prev === project.id ? null : project.id)
  }, [])

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Projects</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">Group issues and repos · filter the board by project.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowCreate(true)}
          leftIcon={
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          }
        >
          New project
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
          </svg>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <Card className="border-red-500/20 bg-red-500/[0.04] mb-4">
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && projects.length === 0 && (
        <Card padding="xl" className="border-dashed text-center">
          <div className="w-12 h-12 rounded-[var(--radius-card)] flex items-center justify-center mx-auto mb-4 bg-[var(--brand-indigo)]/[0.06] border border-[var(--brand-indigo)]/20">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="var(--brand-indigo)" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-[var(--text)] mb-1">No projects yet</h3>
          <p className="text-xs text-[var(--text-faint)] max-w-xs mx-auto mb-4">
            Create a project to group issues and repos, then filter the work board by project.
          </p>
          <Button variant="primary" onClick={() => setShowCreate(true)}>Create first project</Button>
        </Card>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                selected={selectedProjectId === p.id}
                onClick={handleProjectClick}
              />
            ))}
          </div>

          {/* Burndown panel */}
          {selectedProjectId && (
            <Card padding="lg" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[var(--text)]">
                  Burndown — {projects.find(p => p.id === selectedProjectId)?.name ?? ''}
                </h2>
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => navigate(`/board?project=${selectedProjectId}`)}
                  >
                    Open board
                  </Button>
                  <button
                    onClick={() => setSelectedProjectId(null)}
                    className="text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <BurndownChart projectId={selectedProjectId} />
            </Card>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={createProject}
        />
      )}
    </div>
  )
}
