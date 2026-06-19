/**
 * usePlanning — capacity-aware planning & forecasting data.
 *
 * Pulls the unified planning payload from GET /api/planning?weeks=N&project= :
 *   • capacity   — effective person-days per member per upcoming week (leave/OOO dips)
 *   • velocity   — recent throughput (merged PRs / closed issues), mean + trend
 *   • backlog    — sized open work (effort estimates, median fallback)
 *   • forecast   — projected completion date + optimistic/pessimistic band
 *   • whatFits   — how much of the backlog lands in the horizon
 *   • warnings   — over-allocation / OOO / understaffed-week / thin-data flags
 *   • assumptions — the surfaced model parameters (kept honest)
 *
 * Robust to empties and to the backend not running yet (sets `error`).
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import { get } from './api.js'

const init = {
  data: null,
  loading: true,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'START': return { ...state, loading: true, error: null }
    case 'DONE':  return { data: action.data, loading: false, error: null }
    case 'ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function usePlanning({ weeks = 8, project = '' } = {}) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const fetchPlanning = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'START' })
    try {
      const params = new URLSearchParams()
      if (weeks) params.set('weeks', String(weeks))
      if (project) params.set('project', project)
      const qs = params.toString()
      const data = await get(`/api/planning${qs ? `?${qs}` : ''}`)
      if (genRef.current !== gen) return
      dispatch({ type: 'DONE', data })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'ERROR', error: e?.message ?? 'Failed to load planning' })
    }
  }, [activeOrgId, weeks, project])

  useEffect(() => { fetchPlanning().catch(() => {}) }, [fetchPlanning])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch: () => { fetchPlanning().catch(() => {}) },
  }
}
