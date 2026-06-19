/**
 * PreviewPanel — step 3 of the wizard. Shows counts + a sample of issues that
 * will import, WITHOUT writing anything. The user confirms before importing.
 */
import { FolderGit2, ListChecks, AlertTriangle, ArrowLeft, Download, Inbox } from 'lucide-react'
import { Card, Button, Badge } from '../ui/index.js'
import { StateBadge } from './StateBadge.jsx'

function CountStat({ icon: Icon, value, label }) {
  return (
    <Card padding="md" className="flex items-center gap-3">
      <div className="rounded-[var(--radius-btn)] bg-[var(--bg-surface3)] p-2 text-[var(--brand-teal)]">
        <Icon size={18} />
      </div>
      <div>
        <div className="font-display text-2xl font-semibold text-[var(--text)] leading-none">{value}</div>
        <div className="text-[11px] uppercase tracking-widest text-[var(--text-faint)] mt-1">{label}</div>
      </div>
    </Card>
  )
}

export function PreviewPanel({ preview, sourceLabel, onBack, onConfirm, importing }) {
  if (!preview) return null

  const sample = preview.sampleIssues ?? []
  const empty = (preview.issueCount ?? 0) === 0 && sample.length === 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <CountStat icon={ListChecks} value={preview.issueCount ?? 0} label="Issues" />
        <CountStat icon={FolderGit2} value={preview.projectCount ?? 0} label="Projects" />
        <CountStat icon={Inbox} value={sample.length} label="In sample" />
      </div>

      {preview.truncated && (
        <div className="flex items-start gap-2 rounded-[var(--radius-btn)] border border-yellow-500/25 bg-yellow-500/10 px-3 py-2.5">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-yellow-400" />
          <p className="text-xs text-[var(--text-muted)] leading-snug">
            There are more issues than a single import can fetch. The most recent batch will import;
            narrow your filter to bring in the rest.
          </p>
        </div>
      )}

      {empty ? (
        <Card padding="lg" className="text-center">
          <Inbox size={28} className="mx-auto text-[var(--text-faint)]" />
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            No issues matched. Check your filter or credentials and try again.
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <div className="px-4 py-2.5 border-b border-[var(--border)] text-[11px] uppercase tracking-widest text-[var(--text-faint)]">
            Sample — first {sample.length} issues
          </div>
          <div className="divide-y divide-[var(--border)]">
            {sample.map((iss) => (
              <div key={iss.externalId} className="flex items-center gap-3 px-4 py-2.5">
                <code className="font-mono text-[11px] text-[var(--text-faint)] shrink-0 w-24 truncate">
                  {iss.externalId}
                </code>
                <span className="flex-1 min-w-0 truncate text-sm text-[var(--text-dim)]">
                  {iss.title}
                </span>
                {iss.project && (
                  <Badge color="indigo" className="shrink-0 hidden sm:inline-flex">
                    {iss.project}
                  </Badge>
                )}
                <StateBadge state={iss.state} />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} leftIcon={<ArrowLeft size={15} />}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={onConfirm}
          disabled={importing || empty}
          leftIcon={<Download size={15} />}
        >
          {importing ? 'Importing…' : `Import from ${sourceLabel}`}
        </Button>
      </div>
    </div>
  )
}
