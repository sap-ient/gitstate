/**
 * useEstimation — fetch the effort-estimator calibration + accuracy payloads.
 *
 * Two independent backend endpoints (both JWT/token-authed, org-scoped):
 *   GET /api/estimation/accuracy
 *     → [{ cohortKey, n, maeSecs, biasRatio, underPct, updatedAt }]
 *       biasRatio = mean(predicted/actual): <1 ⇒ under-estimating.
 *       underPct  = (1 − biasRatio)·100   (positive ⇒ runs N% low).
 *   GET /api/estimation/calibration
 *     → [{ cohortKey, difficultyBucket(1–10), medianSecs, p25Secs, p75Secs,
 *          meanSecs, n, updatedAt }]   — the difficulty→observed-time curve.
 *
 * Follows the app's useOrg + race-safe (genRef) reducer pattern. Imports `get`
 * from api.js (never edits it). Both arrays degrade to [] on a fresh org.
 *
 * Returns: { accuracy, calibration, loading, error, refetch }
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import { get } from './api.js'

const init = { accuracy: [], calibration: [], loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, accuracy: action.accuracy, calibration: action.calibration }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function useEstimation() {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const [accuracy, calibration] = await Promise.all([
        get('/api/estimation/accuracy'),
        get('/api/estimation/calibration'),
      ])
      if (genRef.current !== gen) return
      dispatch({
        type: 'FETCH_DONE',
        accuracy: Array.isArray(accuracy) ? accuracy : [],
        calibration: Array.isArray(calibration) ? calibration : [],
      })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load estimation calibration' })
    }
  }, [activeOrgId])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return {
    accuracy: state.accuracy,
    calibration: state.calibration,
    loading: state.loading,
    error: state.error,
    refetch: doFetch,
  }
}
