/**
 * Capacity page — /capacity
 * Shows: effective capacity per member (GET /api/capacity?period=),
 * leave list (GET /api/leave), add-leave form (POST /api/leave),
 * and availability editor (PUT /api/availability).
 */
import { useState } from 'react'
import { useCapacity } from '../lib/useCapacity.js'
import { Card, Badge, Button } from '../components/ui/index.js'

function Spinner({ size = 16 }) {
  return (
    <svg className="animate-spin shrink-0" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--brand-teal)" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function Initials({ name, email }) {
  const text = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email ?? '?').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] flex items-center justify-center text-[11px] font-bold text-[#0B1120] select-none shrink-0">
      {text}
    </div>
  )
}

function CapacityBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct > 85 ? '#22c55e' : pct > 50 ? 'var(--brand-teal)' : '#f59e0b'
  return (
    <div className="flex items-center gap-3 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-[var(--text-muted)] w-12 text-right shrink-0">{value}h</span>
    </div>
  )
}

function CapacityRow({ member, maxCapacity }) {
  const [editing, setEditing] = useState(false)
  const [hoursPerDay, setHoursPerDay] = useState(member.hoursPerDay ?? 8)
  const [daysPerWeek, setDaysPerWeek] = useState(member.daysPerWeek ?? 5)
  const [saving, setSaving] = useState(false)
  const { updateAvailability } = useCapacity()

  async function handleSave() {
    setSaving(true)
    try {
      await updateAvailability(member.userId, { hoursPerDay: Number(hoursPerDay), daysPerWeek: Number(daysPerWeek) })
      setEditing(false)
    } catch {
      // silently ignore — could show a toast here
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Initials name={member.name} email={member.email} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[var(--text)] block truncate">{member.name ?? member.email}</span>
          {member.name && member.email && (
            <span className="text-xs text-[var(--text-faint)] truncate block">{member.email}</span>
          )}
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          className="text-[10px] font-mono text-[var(--text-faint)] hover:text-[var(--brand-teal)] transition-colors"
        >
          {editing ? 'cancel' : 'edit'}
        </button>
      </div>

      {/* Capacity bar */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest w-20 shrink-0">Effective cap.</span>
        <CapacityBar value={member.effectiveHours ?? 0} max={maxCapacity} />
      </div>

      {/* Detail chips */}
      <div className="flex flex-wrap gap-2">
        {member.hoursPerDay != null && (
          <Badge>{member.hoursPerDay}h/day</Badge>
        )}
        {member.daysPerWeek != null && (
          <Badge>{member.daysPerWeek}d/wk</Badge>
        )}
        {member.onLeave && (
          <Badge color="yellow">on leave</Badge>
        )}
      </div>

      {/* Availability editor */}
      {editing && (
        <div className="rounded-[var(--radius-badge)] px-4 py-3 flex flex-col gap-3 bg-[var(--bg)] border border-[var(--border)]">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">Hours / day</label>
              <input
                type="number"
                min="1" max="24"
                className="bg-[var(--bg-surface)] text-xs text-[var(--text)] rounded px-2 py-1.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40"
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">Days / week</label>
              <input
                type="number"
                min="1" max="7"
                className="bg-[var(--bg-surface)] text-xs text-[var(--text)] rounded px-2 py-1.5 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40"
                value={daysPerWeek}
                onChange={e => setDaysPerWeek(e.target.value)}
              />
            </div>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving} leftIcon={saving ? <Spinner size={12} /> : null}>
            Save
          </Button>
        </div>
      )}
    </Card>
  )
}

function LeaveRow({ entry }) {
  const start = entry.startDate ? new Date(entry.startDate).toLocaleDateString() : '—'
  const end   = entry.endDate   ? new Date(entry.endDate).toLocaleDateString()   : '—'
  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--bg-surface2)] transition-colors last:border-0">
      <td className="px-4 py-2.5 text-sm text-[var(--text)]">{entry.userName ?? entry.userId ?? '—'}</td>
      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] font-mono">{start}</td>
      <td className="px-4 py-2.5 text-xs text-[var(--text-muted)] font-mono">{end}</td>
      <td className="px-4 py-2.5 text-xs text-[var(--text-faint)]">{entry.reason ?? entry.type ?? '—'}</td>
    </tr>
  )
}

function AddLeaveForm({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [userId, setUserId]       = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [reason, setReason]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!userId || !startDate || !endDate) return
    setSaving(true)
    setErr(null)
    try {
      await onAdd({ userId, startDate, endDate, reason })
      setUserId(''); setStartDate(''); setEndDate(''); setReason('')
      setOpen(false)
    } catch (e) {
      setErr(e.message ?? 'Failed to add leave')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "bg-[var(--bg)] text-sm text-[var(--text)] rounded-[var(--radius-btn)] px-3 py-2 border border-[var(--border)] outline-none focus:border-[var(--brand-teal)]/40 transition-colors w-full"

  return (
    <div>
      <Button
        variant={open ? 'outline' : 'primary'}
        size="sm"
        onClick={() => setOpen(v => !v)}
        leftIcon={!open && (
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        )}
      >
        {open ? 'Cancel' : 'Add leave'}
      </Button>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4">
          <Card padding="md" className="flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">User ID or email</label>
                <input required className={inputCls} placeholder="user@example.com" value={userId} onChange={e => setUserId(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">Reason (optional)</label>
                <input className={inputCls} placeholder="e.g. Annual leave" value={reason} onChange={e => setReason(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">Start date</label>
                <input type="date" required className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">End date</label>
                <input type="date" required className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            {err && <p className="text-xs text-red-400">{err}</p>}
            <Button type="submit" disabled={saving || !userId || !startDate || !endDate} className="self-start" leftIcon={saving ? <Spinner size={12} /> : null}>
              Add leave
            </Button>
          </Card>
        </form>
      )}
    </div>
  )
}

const PERIODS = [
  { id: '7d',  label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
]

export default function Capacity() {
  const [period, setPeriod] = useState('30d')
  const { capacity, leave, capacityLoading, leaveLoading, error, addLeave } = useCapacity({ period })

  const maxCapacity = Math.max(1, ...capacity.map(m => m.effectiveHours ?? 0))

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Capacity</h1>
        <p className="text-sm text-[var(--text-faint)] mt-1">
          Effective capacity per member, adjusted for leave and availability.
        </p>
      </div>

      {/* Period filter */}
      <div className="flex items-center rounded-[var(--radius-btn)] p-0.5 gap-0.5 w-fit bg-[var(--bg)] border border-[var(--border)]">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={[
              'px-3 py-1.5 rounded-[6px] text-xs font-medium transition-all duration-150',
              period === p.id
                ? 'bg-[var(--bg-surface2)] text-[var(--brand-teal)]'
                : 'text-[var(--text-faint)] hover:text-[var(--text-muted)]',
            ].join(' ')}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/[0.04]">
          <p className="text-sm text-red-400">{error} — the backend may not be running yet.</p>
        </Card>
      )}

      {/* Capacity cards */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--text)]">Team capacity</h2>
          {capacityLoading && <Spinner />}
        </div>

        {!capacityLoading && capacity.length === 0 && !error && (
          <Card padding="lg" className="border-dashed text-center">
            <p className="text-xs text-[var(--text-faint)]">No capacity data yet — sync team members to calculate availability.</p>
          </Card>
        )}

        {capacity.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {capacity.map(m => (
              <CapacityRow key={m.userId ?? m.email} member={m} maxCapacity={maxCapacity} />
            ))}
          </div>
        )}
      </section>

      {/* Leave */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text)]">Leave schedule</h2>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">Planned absences that reduce effective capacity.</p>
          </div>
          <AddLeaveForm onAdd={addLeave} />
        </div>

        {leaveLoading && (
          <div className="flex items-center gap-3 py-6">
            <Spinner />
            <span className="text-xs text-[var(--text-faint)]">Loading leave schedule…</span>
          </div>
        )}

        {!leaveLoading && leave.length === 0 && (
          <Card padding="lg" className="border-dashed text-center">
            <p className="text-xs text-[var(--text-faint)]">No leave scheduled. Add leave to show how it affects capacity.</p>
          </Card>
        )}

        {!leaveLoading && leave.length > 0 && (
          <Card padding="none" className="overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-surface2)]/50 border-b border-[var(--border)]">
                  <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider">Member</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider">From</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider">To</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-medium text-[var(--text-faint)] uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody>
                {leave.map((entry, i) => <LeaveRow key={i} entry={entry} />)}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  )
}
