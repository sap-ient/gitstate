/**
 * useBurndown — fetch burndown data for a project.
 * Params: { project } — required.
 * Returns: { points, loading, error, refetch }
 * points shape: Array<{ date: string, remaining: number, ideal: number }>
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

export function useBurndown(project) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const doFetch = useCallback(async () => {
    if (!activeOrgId || !project) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const data = await api.get(`/api/reports/burndown?project=${encodeURIComponent(project)}`)
      if (genRef.current !== gen) return
      const points = Array.isArray(data) ? data : (data?.points ?? [])
      dispatch({ type: 'FETCH_DONE', points })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load burndown' })
    }
  }, [activeOrgId, project])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { points: state.points, loading: state.loading, error: state.error, refetch: doFetch }
}
