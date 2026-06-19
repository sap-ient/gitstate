/**
 * ResultPanel — final wizard step. Summary of what was imported.
 */
import { CheckCircle2, FolderPlus, Plus, RefreshCw, SkipForward, ArrowRight } from 'lucide-react'
import { Card, Button } from '../ui/index.js'

function SummaryRow({ icon: Icon, value, label, tone = 'default' }) {
  const toneCls =
    tone === 'teal' ? 'text-[var(--brand-teal)]' : tone === 'muted' ? 'text-[var(--text-faint)]' : 'text-[var(--text-dim)]'
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon size={16} className={toneCls} />
      <span className="font-display text-lg font-semibold text-[var(--text)] tabular-nums w-10">{value}</span>
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

export function ResultPanel({ result, sourceLabel, onViewBoard, onImportMore }) {
  if (!result) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-green-500/10 border border-green-500/25 p-2">
          <CheckCircle2 size={22} className="text-green-400" />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">Import complete</h3>
          <p className="text-sm text-[var(--text-muted)]">Your {sourceLabel} issues are now in gitstate.</p>
        </div>
      </div>

      <Card padding="none">
        <div className="divide-y divide-[var(--border)]">
          <SummaryRow icon={Plus} value={result.issuesImported ?? 0} label="issues imported" tone="teal" />
          <SummaryRow icon={RefreshCw} value={result.issuesUpdated ?? 0} label="issues updated (already imported)" />
          <SummaryRow icon={FolderPlus} value={result.projectsCreated ?? 0} label="projects created" />
          {(result.skipped ?? 0) > 0 && (
            <SummaryRow icon={SkipForward} value={result.skipped} label="skipped" tone="muted" />
          )}
        </div>
      </Card>

      {result.truncated && (
        <p className="text-xs text-[var(--text-faint)]">
          Some issues were beyond this import's limit. Re-run with a narrower filter to bring in the rest —
          re-importing won't create duplicates.
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onImportMore}>
          Import more
        </Button>
        <Button variant="primary" onClick={onViewBoard} rightIcon={<ArrowRight size={15} />}>
          View board
        </Button>
      </div>
    </div>
  )
}
