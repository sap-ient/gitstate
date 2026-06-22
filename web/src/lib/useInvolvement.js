/**
 * useInvolvement — fetch per-person involvement texture from /api/metrics/involvement.
 * Params: { project, period } — all optional.
 * Returns: { members, loading, error, refetch }
 * members shape: Array<{
 *   userId, name, email, avatarUrl?,
 *   featuresShipped: number, reviewsDone: number,
 *   areasOwned: number,           // distinct areas/repos owned
 *   activeRecently: boolean, lastActive?: string,
 *   isAgent: boolean,
 *   dimensions: { commitCount, linesAdded, linesDeleted, isAgent }
 * }>
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import * as api from './api.js'

const init = { members: [], loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, members: action.members }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function useInvolvement(filters = {}) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const { project, period } = filters

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const params = new URLSearchParams()
      if (project) params.set('project', project)
      if (period)  params.set('period', period)
      const qs = params.toString()
      const data = await api.get(`/api/metrics/involvement${qs ? `?${qs}` : ''}`)
      if (genRef.current !== gen) return
      const members = Array.isArray(data) ? data : (data?.members ?? [])
      dispatch({ type: 'FETCH_DONE', members })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load involvement' })
    }
  }, [activeOrgId, project, period])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { members: state.members, loading: state.loading, error: state.error, refetch: doFetch }
}
