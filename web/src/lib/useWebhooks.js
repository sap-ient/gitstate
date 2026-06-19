/**
 * useWebhooks — load the org's inbound-webhook config (payload URLs + whether a
 * secret is set per provider + last-event indicator) and rotate secrets.
 *
 *   GET  /api/webhooks/config  → { publicUrl, providers: [{ provider, payloadUrl,
 *                                  secretSet, enabled, lastEventAt }] }
 *   POST /api/webhooks/config  → { provider, secret, payloadUrl }   (secret revealed ONCE)
 *
 * Follows the app's useOrg + race-safe (genRef) pattern. Imports get/post from
 * api.js (never edits it). The rotated secret is returned to the caller so the UI
 * can reveal it once; it is never persisted in this hook's state.
 *
 * Returns: { data, loading, error, refetch, rotate }
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import { get, post } from './api.js'

const init = { data: null, loading: false, error: null }

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, data: action.data }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

export function useWebhooks() {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, init)
  const genRef = useRef(0)

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const data = await get('/api/webhooks/config')
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_DONE', data })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load webhook config' })
    }
  }, [activeOrgId])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  // rotate generates/replaces the per-provider secret and returns the new secret
  // (revealed once). Refetches config afterwards so secretSet/last-event refresh.
  const rotate = useCallback(async (provider) => {
    const res = await post('/api/webhooks/config', { provider })
    doFetch().catch(() => {})
    return res
  }, [doFetch])

  return { data: state.data, loading: state.loading, error: state.error, refetch: doFetch, rotate }
}
