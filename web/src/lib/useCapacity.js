/**
 * useCapacity — capacity, leave, and availability data.
 * Returns capacity per member, leave list, and mutation helpers.
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import * as api from './api.js'

const init = {
  capacity: [],
  leave: [],
  capacityLoading: false,
  leaveLoading: false,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'CAP_START':    return { ...state, capacityLoading: true, error: null }
    case 'CAP_DONE':     return { ...state, capacityLoading: false, capacity: action.capacity }
    case 'CAP_ERROR':    return { ...state, capacityLoading: false, error: action.error }
    case 'LEAVE_START':  return { ...state, leaveLoading: true }
    case 'LEAVE_DONE':   return { ...state, leaveLoading: false, leave: action.leave }
    case 'LEAVE_ERROR':  return { ...state, leaveLoading: false }
    case 'ADD_LEAVE':    return { ...state, leave: [action.entry, ...state.leave] }
    default: return state
  }
}

export function useCapacity(filters = {}) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const { period } = filters

  const fetchCapacity = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'CAP_START' })
    try {
      const params = new URLSearchParams()
      if (period) params.set('period', period)
      const qs = params.toString()
      const data = await api.get(`/api/capacity${qs ? `?${qs}` : ''}`)
      if (genRef.current !== gen) return
      const capacity = Array.isArray(data) ? data : (data?.members ?? [])
      dispatch({ type: 'CAP_DONE', capacity })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'CAP_ERROR', error: e.message ?? 'Failed to load capacity' })
    }
  }, [activeOrgId, period])

  const fetchLeave = useCallback(async () => {
    if (!activeOrgId) return
    dispatch({ type: 'LEAVE_START' })
    try {
      const data = await api.get('/api/leave')
      const leave = Array.isArray(data) ? data : (data?.leave ?? [])
      dispatch({ type: 'LEAVE_DONE', leave })
    } catch {
      dispatch({ type: 'LEAVE_ERROR' })
    }
  }, [activeOrgId])

  useEffect(() => {
    fetchCapacity().catch(() => {})
    fetchLeave().catch(() => {})
  }, [fetchCapacity, fetchLeave])

  const addLeave = useCallback(async (entry) => {
    const created = await api.post('/api/leave', entry)
    dispatch({ type: 'ADD_LEAVE', entry: created ?? entry })
    return created
  }, [])

  const updateAvailability = useCallback(async (userId, availability) => {
    return api.put('/api/availability', { userId, ...availability })
  }, [])

  return {
    capacity: state.capacity,
    leave: state.leave,
    capacityLoading: state.capacityLoading,
    leaveLoading: state.leaveLoading,
    error: state.error,
    refetch: () => { fetchCapacity().catch(() => {}); fetchLeave().catch(() => {}) },
    addLeave,
    updateAvailability,
  }
}
