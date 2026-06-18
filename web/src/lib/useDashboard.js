/**
 * useDashboard — fetch the /api/reports/dashboard rollup.
 * Returns: { data, loading, error, refetch }
 * data shape: {
 *   open: number, inProgress: number, done: number,
 *   throughput: number, cycleTrend: Array<{date,days}>,
 *   status: { riskSummary, shippedSummary, raw }
 * }
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import * as api from './api.js'

const init = { data: null, loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, data: action.data }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function useDashboard() {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const data = await api.get('/api/reports/dashboard')
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_DONE', data })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load dashboard' })
    }
  }, [activeOrgId])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { data: state.data, loading: state.loading, error: state.error, refetch: doFetch }
}
