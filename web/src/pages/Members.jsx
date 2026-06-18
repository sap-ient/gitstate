/**
 * Members page — /settings/members
 * List members of the active org, invite by email+role, change role, remove.
 * Invite/remove controls only shown to owner/admin.
 */
import { useReducer, useEffect, useCallback } from 'react'
import { useOrg } from '../lib/useOrg.js'
import * as api from '../lib/api.js'
import { Card, Badge, Button } from '../components/ui/index.js'

const ROLES = ['owner', 'admin', 'member', 'stakeholder', 'billing']

const ROLE_BADGE_COLORS = {
  owner: 'yellow',
  admin: 'indigo',
  member: 'default',
  stakeholder: 'teal',
  billing: 'blue',
}

function RoleBadge({ role }) {
  const color = ROLE_BADGE_COLORS[role] ?? 'default'
  return (
    <Badge color={color}>
      {role}
      {role === 'stakeholder' && <span className="opacity-60"> · free</span>}
    </Badge>
  )
}

function Avatar({ name, email }) {
  const initials = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email ?? '?').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brand-teal)] to-[var(--brand-indigo)] flex items-center justify-center text-[11px] font-bold text-[#0B1120] shrink-0 select-none">
      {initials}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

// ── Reducers ──────────────────────────────────────────────────────────────────

function membersReducer(state, action) {
  switch (action.type) {
    case 'LOADING': return { ...state, loading: true, error: null }
    case 'LOADED': return { ...state, loading: false, members: action.members }
    case 'ERROR': return { ...state, loading: false, error: action.error }
    case 'UPDATE_ROLE':
      return {
        ...state,
        members: state.members.map(m =>
          m.userId === action.userId ? { ...m, role: action.role } : m
        ),
      }
    case 'REMOVE':
      return { ...state, members: state.members.filter(m => m.userId !== action.userId) }
    case 'SET_ROLE_CHANGING':
      return { ...state, roleChanging: { ...state.roleChanging, [action.userId]: action.value } }
    case 'SET_REMOVING':
      return { ...state, removing: { ...state.removing, [action.userId]: action.value } }
    default:
      return state
  }
}

function inviteReducer(state, action) {
  switch (action.type) {
    case 'SENDING': return { ...state, inviting: true, inviteError: null, inviteSuccess: null }
    case 'SUCCESS': return { ...state, inviting: false, inviteEmail: '', inviteSuccess: action.msg }
    case 'ERROR': return { ...state, inviting: false, inviteError: action.error }
    case 'SET_EMAIL': return { ...state, inviteEmail: action.value }
    case 'SET_ROLE': return { ...state, inviteRole: action.value }
    default:
      return state
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Members() {
  const { activeOrg, orgRole } = useOrg()
  const canManage = orgRole === 'owner' || orgRole === 'admin'

  const [membersState, membersDispatch] = useReducer(membersReducer, {
    members: [],
    loading: false,
    error: null,
    roleChanging: {},
    removing: {},
  })

  const [inviteState, inviteDispatch] = useReducer(inviteReducer, {
    inviteEmail: '',
    inviteRole: 'member',
    inviting: false,
    inviteError: null,
    inviteSuccess: null,
  })

  const orgId = activeOrg?.id

  const fetchMembers = useCallback(async (id) => {
    if (!id) return
    membersDispatch({ type: 'LOADING' })
    try {
      const data = await api.get(`/api/orgs/${id}/members`)
      membersDispatch({ type: 'LOADED', members: Array.isArray(data) ? data : [] })
    } catch (err) {
      membersDispatch({ type: 'ERROR', error: err?.message ?? 'Failed to load members' })
    }
  }, [])

  useEffect(() => {
    fetchMembers(orgId).catch(() => {})
  }, [orgId, fetchMembers])

  async function handleInvite(e) {
    e.preventDefault()
    if (!orgId || !inviteState.inviteEmail.trim()) return
    inviteDispatch({ type: 'SENDING' })
    try {
      await api.post(`/api/orgs/${orgId}/members`, {
        email: inviteState.inviteEmail.trim(),
        role: inviteState.inviteRole,
      })
      inviteDispatch({ type: 'SUCCESS', msg: `Invite sent to ${inviteState.inviteEmail.trim()}` })
      await fetchMembers(orgId)
    } catch (err) {
      inviteDispatch({ type: 'ERROR', error: err?.message ?? 'Failed to send invite' })
    }
  }

  async function handleRoleChange(userId, newRole) {
    if (!orgId) return
    membersDispatch({ type: 'SET_ROLE_CHANGING', userId, value: true })
    try {
      await api.patch(`/api/orgs/${orgId}/members/${userId}`, { role: newRole })
      membersDispatch({ type: 'UPDATE_ROLE', userId, role: newRole })
    } catch {
      // silently revert on error — future: toast
    } finally {
      membersDispatch({ type: 'SET_ROLE_CHANGING', userId, value: false })
    }
  }

  async function handleRemove(userId, memberEmail) {
    if (!orgId) return
    if (!window.confirm(`Remove ${memberEmail ?? userId} from the organization?`)) return
    membersDispatch({ type: 'SET_REMOVING', userId, value: true })
    try {
      await api.del(`/api/orgs/${orgId}/members/${userId}`)
      membersDispatch({ type: 'REMOVE', userId })
    } catch {
      // future: toast
    } finally {
      membersDispatch({ type: 'SET_REMOVING', userId, value: false })
    }
  }

  const { members, loading, error, roleChanging, removing } = membersState
  const { inviteEmail, inviteRole, inviting, inviteError, inviteSuccess } = inviteState

  if (!activeOrg) {
    return (
      <div className="max-w-2xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Members</h1>
        </div>
        <Card padding="xl" className="text-center">
          <p className="text-sm text-[var(--text-faint)]">No active organization. Create or select one from the sidebar.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Members</h1>
        <p className="text-sm text-[var(--text-faint)] mt-1">
          Manage who has access to <span className="text-[var(--text-dim)] font-medium">{activeOrg.name}</span>.
          {' '}Stakeholders are always <span className="text-[var(--brand-teal)] font-medium">free</span> — no seat cost.
        </p>
      </div>

      {/* Invite form */}
      {canManage && (
        <Card padding="lg" className="mb-4">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Invite a member</h2>
          <p className="text-xs text-[var(--text-faint)] mb-4">
            Stakeholder seats are <span className="text-[var(--brand-teal)] font-medium">free</span> — perfect for clients and external viewers.
          </p>
          <form onSubmit={handleInvite} className="flex gap-2 flex-wrap">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={e => inviteDispatch({ type: 'SET_EMAIL', value: e.target.value })}
              placeholder="colleague@example.com"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-[var(--radius-btn)] bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--brand-teal)] focus:ring-1 focus:ring-[var(--brand-teal)]/30 transition-all"
            />
            <select
              value={inviteRole}
              onChange={e => inviteDispatch({ type: 'SET_ROLE', value: e.target.value })}
              className="px-3 py-2 rounded-[var(--radius-btn)] bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] outline-none focus:border-[var(--brand-teal)] transition-all cursor-pointer"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>
                  {r === 'stakeholder' ? 'Stakeholder (free)' : r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <Button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              leftIcon={inviting ? <Spinner /> : null}
            >
              {inviting ? 'Sending…' : 'Invite'}
            </Button>
          </form>
          {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
          {inviteSuccess && <p className="mt-2 text-xs text-[var(--brand-teal)]">{inviteSuccess}</p>}
        </Card>
      )}

      {/* Members list */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">
            Members
            {!loading && members.length > 0 && (
              <span className="ml-2 text-xs font-mono text-[var(--text-faint)]">({members.length})</span>
            )}
          </h2>
          {loading && <Spinner />}
        </div>

        {error && (
          <div className="px-6 py-4 text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && members.length === 0 && (
          <div className="px-6 py-8 text-center text-sm text-[var(--text-faint)]">
            No members yet. Invite someone above.
          </div>
        )}

        {members.map((member, idx) => (
          <div
            key={member.userId}
            className={`flex items-center gap-3 px-6 py-4 ${idx < members.length - 1 ? 'border-b border-[var(--border)]' : ''}`}
          >
            <Avatar name={member.name} email={member.email} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text)] truncate">
                {member.name ?? member.email ?? member.userId}
              </p>
              {member.name && member.email && (
                <p className="text-xs text-[var(--text-faint)] truncate">{member.email}</p>
              )}
            </div>

            {/* Role selector / badge */}
            {canManage ? (
              <select
                value={member.role}
                disabled={!!roleChanging[member.userId]}
                onChange={e => handleRoleChange(member.userId, e.target.value)}
                className="px-2 py-1 rounded-[var(--radius-badge)] bg-[var(--bg)] border border-[var(--border)] text-xs font-mono text-[var(--text-muted)] outline-none focus:border-[var(--brand-teal)] transition-all cursor-pointer disabled:opacity-50"
              >
                {ROLES.map(r => (
                  <option key={r} value={r}>
                    {r === 'stakeholder' ? 'stakeholder (free)' : r}
                  </option>
                ))}
              </select>
            ) : (
              <RoleBadge role={member.role} />
            )}

            {/* Remove button */}
            {canManage && (
              <button
                onClick={() => handleRemove(member.userId, member.email)}
                disabled={!!removing[member.userId]}
                className="ml-1 p-1.5 rounded-[var(--radius-badge)] text-[var(--text-faint)] hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                title="Remove member"
              >
                {removing[member.userId] ? (
                  <Spinner />
                ) : (
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                )}
              </button>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}
