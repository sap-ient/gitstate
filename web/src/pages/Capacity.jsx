/**
 * Capacity page — /capacity
 * Shows: effective capacity per member (GET /api/capacity?period=),
 * leave list (GET /api/leave), add-leave form (POST /api/leave),
 * and availability editor (PUT /api/availability).
 */
import { useState } from 'react'
import { useCapacity } from '../lib/useCapacity.js'

function Spinner() {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2DD4BF" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
    </svg>
  )
}

function Initials({ name, email }) {
  const text = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email ?? '?').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2DD4BF] to-[#6366F1] flex items-center justify-center text-[11px] font-bold text-[#0B1120] select-none shrink-0">
      {text}
    </div>
  )
}

function CapacityBar({ value, max }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct > 85 ? '#22c55e' : pct > 50 ? '#2DD4BF' : '#f59e0b'
  return (
    <div className="flex items-center gap-3 flex-1">
      <div className="flex-1 h-1.5 rounded-full bg-[#1e2d45] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono text-[#94a3b8] w-12 text-right shrink-0">{value}h</span>
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
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: '#111827', border: '1px solid #1e2d45' }}
    >
      <div className="flex items-center gap-3">
        <Initials name={member.name} email={member.email} />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[#e2e8f0] block truncate">{member.name ?? member.email}</span>
          {member.name && member.email && (
            <span className="text-xs text-[#475569] truncate block">{member.email}</span>
          )}
        </div>
        <button
          onClick={() => setEditing(v => !v)}
          className="text-[10px] font-mono text-[#475569] hover:text-[#2DD4BF] transition-colors"
        >
          {editing ? 'cancel' : 'edit'}
        </button>
      </div>

      {/* Capacity bar */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-[#475569] uppercase tracking-widest w-20 shrink-0">Effective cap.</span>
        <CapacityBar value={member.effectiveHours ?? 0} max={maxCapacity} />
      </div>

      {/* Detail chips */}
      <div className="flex flex-wrap gap-2">
        {member.hoursPerDay != null && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)', border: '1px solid #1e2d45' }}
          >
            {member.hoursPerDay}h/day
          </span>
        )}
        {member.daysPerWeek != null && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)', border: '1px solid #1e2d45' }}
          >
            {member.daysPerWeek}d/wk
          </span>
        )}
        {member.onLeave && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            on leave
          </span>
        )}
      </div>

      {/* Availability editor */}
      {editing && (
        <div
          className="rounded-lg px-4 py-3 flex flex-col gap-3"
          style={{ background: '#0d1628', border: '1px solid #1e2d45' }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#475569] uppercase tracking-widest">Hours / day</label>
              <input
                type="number"
                min="1" max="24"
                className="bg-[#111827] text-xs text-[#e2e8f0] rounded px-2 py-1.5 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40"
                value={hoursPerDay}
                onChange={e => setHoursPerDay(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-[#475569] uppercase tracking-widest">Days / week</label>
              <input
                type="number"
                min="1" max="7"
                className="bg-[#111827] text-xs text-[#e2e8f0] rounded px-2 py-1.5 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40"
                value={daysPerWeek}
                onChange={e => setDaysPerWeek(e.target.value)}
              />
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 px-3 py-1.5 rounded text-xs font-semibold text-[#0B1120] disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
          >
            {saving ? <Spinner /> : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

function LeaveRow({ entry }) {
  const start = entry.startDate ? new Date(entry.startDate).toLocaleDateString() : '—'
  const end   = entry.endDate   ? new Date(entry.endDate).toLocaleDateString()   : '—'
  return (
    <tr className="border-b border-[#0d1628] hover:bg-[#0d1628]/50 transition-colors">
      <td className="px-3 py-2.5 text-sm text-[#e2e8f0]">{entry.userName ?? entry.userId ?? '—'}</td>
      <td className="px-3 py-2.5 text-xs text-[#94a3b8] font-mono">{start}</td>
      <td className="px-3 py-2.5 text-xs text-[#94a3b8] font-mono">{end}</td>
      <td className="px-3 py-2.5 text-xs text-[#475569]">{entry.reason ?? entry.type ?? '—'}</td>
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
      setUserId('')
      setStartDate('')
      setEndDate('')
      setReason('')
      setOpen(false)
    } catch (e) {
      setErr(e.message ?? 'Failed to add leave')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#0B1120] transition-all duration-150"
        style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
      >
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {open ? 'Cancel' : 'Add leave'}
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 rounded-xl p-5 flex flex-col gap-4"
          style={{ background: '#111827', border: '1px solid #1e2d45' }}
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[#475569] uppercase tracking-widest">User ID or email</label>
              <input
                required
                className="bg-[#0d1628] text-sm text-[#e2e8f0] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
                placeholder="user@example.com"
                value={userId}
                onChange={e => setUserId(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[#475569] uppercase tracking-widest">Reason (optional)</label>
              <input
                className="bg-[#0d1628] text-sm text-[#e2e8f0] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
                placeholder="e.g. Annual leave"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[#475569] uppercase tracking-widest">Start date</label>
              <input
                type="date" required
                className="bg-[#0d1628] text-sm text-[#e2e8f0] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-[#475569] uppercase tracking-widest">End date</label>
              <input
                type="date" required
                className="bg-[#0d1628] text-sm text-[#e2e8f0] rounded-lg px-3 py-2 border border-[#1e2d45] outline-none focus:border-[#2DD4BF]/40 transition-colors"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {err && (
            <p className="text-xs text-[#ef4444]">{err}</p>
          )}

          <button
            type="submit"
            disabled={saving || !userId || !startDate || !endDate}
            className="self-start flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#0B1120] disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #2DD4BF, #6366F1)' }}
          >
            {saving ? <Spinner /> : 'Add leave'}
          </button>
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
        <h1 className="text-2xl font-bold text-[#e2e8f0] tracking-tight">Capacity</h1>
        <p className="text-sm text-[#64748b] mt-1">
          Effective capacity per member, adjusted for leave and availability.
        </p>
      </div>

      {/* Period filter */}
      <div
        className="flex items-center rounded-lg p-0.5 gap-0.5 w-fit"
        style={{ background: '#0d1628', border: '1px solid #1e2d45' }}
      >
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150"
            style={{
              background: period === p.id ? '#1a2d4a' : 'transparent',
              color: period === p.id ? '#2DD4BF' : '#64748b',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl px-5 py-4 text-sm text-[#ef4444]"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error} — the backend may not be running yet.
        </div>
      )}

      {/* Capacity cards */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#e2e8f0]">Team capacity</h2>
          {capacityLoading && <Spinner />}
        </div>

        {!capacityLoading && capacity.length === 0 && !error && (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: 'rgba(13,22,40,0.4)', border: '1px dashed #1e2d45' }}
          >
            <p className="text-xs text-[#475569]">No capacity data yet — sync team members to calculate availability.</p>
          </div>
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
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Leave schedule</h2>
            <p className="text-xs text-[#475569] mt-0.5">Planned absences that reduce effective capacity.</p>
          </div>
          <AddLeaveForm onAdd={addLeave} />
        </div>

        {leaveLoading && (
          <div className="flex items-center gap-3 py-6">
            <Spinner />
            <span className="text-xs text-[#475569]">Loading leave schedule…</span>
          </div>
        )}

        {!leaveLoading && leave.length === 0 && (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: 'rgba(13,22,40,0.4)', border: '1px dashed #1e2d45' }}
          >
            <p className="text-xs text-[#475569]">No leave scheduled. Add leave to show how it affects capacity.</p>
          </div>
        )}

        {!leaveLoading && leave.length > 0 && (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid #1e2d45' }}
          >
            <table className="w-full">
              <thead>
                <tr style={{ background: '#0d1628' }}>
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-[#475569] uppercase tracking-wider">Member</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-[#475569] uppercase tracking-wider">From</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-[#475569] uppercase tracking-wider">To</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-medium text-[#475569] uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody style={{ background: '#111827' }}>
                {leave.map((entry, i) => <LeaveRow key={i} entry={entry} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
