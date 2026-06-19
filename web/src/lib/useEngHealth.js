/**
 * useEngHealth — fetch the Engineering Health dashboard payload.
 *
 * GET /api/eng-health?from=&to=  →  one object with:
 *   { window, dora, review, busFactor, techDebt[], hasDeepData }
 *
 * Follows the app's useOrg + race-safe (genRef) reducer pattern. Imports `get`
 * from api.js (never edits it). Params: { from, to } (YYYY-MM-DD), both optional.
 *
 * Returns: { data, loading, error, refetch }
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import { get } from './api.js'

const init = { data: null, loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, data: action.data }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function useEngHealth(filters = {}) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const { from, to } = filters

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      const qs = params.toString()
      const data = await get(`/api/eng-health${qs ? `?${qs}` : ''}`)
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_DONE', data })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load engineering health' })
    }
  }, [activeOrgId, from, to])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { data: state.data, loading: state.loading, error: state.error, refetch: doFetch }
}
