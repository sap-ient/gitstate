/**
 * StateBadge — renders a gitstate issue state as a colored badge.
 * Shared by the preview sample table.
 */
import { Badge } from '../ui/index.js'

const STATE_META = {
  open: { color: 'blue', label: 'Open' },
  in_progress: { color: 'yellow', label: 'In Progress' },
  done: { color: 'green', label: 'Done' },
  closed: { color: 'default', label: 'Closed' },
}

export function StateBadge({ state }) {
  const meta = STATE_META[state] ?? { color: 'default', label: state || '—' }
  return <Badge color={meta.color}>{meta.label}</Badge>
}
