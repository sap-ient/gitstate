/**
 * useCycleTime — fetch cycle-time lead times from /api/metrics/cycle-time.
 * Params: { repo, from, to } — all optional.
 * Returns: { points, loading, error, refetch }
 * points shape: Array<{ date: string, days: number, title?: string, repo?: string }>
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import * as api from './api.js'

const init = { points: [], loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, points: action.points }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function useCycleTime(filters = {}) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const { repo, from, to } = filters

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const params = new URLSearchParams()
      if (repo) params.set('repo', repo)
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      const qs = params.toString()
      const data = await api.get(`/api/metrics/cycle-time${qs ? `?${qs}` : ''}`)
      if (genRef.current !== gen) return
      const points = Array.isArray(data) ? data : (data?.points ?? [])
      dispatch({ type: 'FETCH_DONE', points })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load cycle time' })
    }
  }, [activeOrgId, repo, from, to])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { points: state.points, loading: state.loading, error: state.error, refetch: doFetch }
}
