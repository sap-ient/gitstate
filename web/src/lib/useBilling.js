/**
 * useBilling — billing data hooks.
 * Fetches plans, subscription, usage, and invoices from the billing API.
 * Handles 404/403 gracefully (billing disabled in OSS builds).
 */
import { useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { useOrg } from './useOrg.js'
import * as api from './api.js'

// ── Public billing flag (cached) ──────────────────────────────────────────────
// GET /api/config exposes the public billing config. Billing is only enabled
// when the instance is configured for it (billing.chargeCurrency is set). We
// gate every billing fetch on this so OSS / billing-disabled builds never spam
// 404s on /api/billing/* across navigation. Fetched once and cached at module
// scope (a shared in-flight promise dedupes concurrent hook mounts).
let _billingFlag = null            // null = unknown, true/false once resolved
let _billingFlagPromise = null

function resolveBillingEnabled() {
  if (_billingFlag !== null) return Promise.resolve(_billingFlag)
  if (!_billingFlagPromise) {
    _billingFlagPromise = api.fetchConfig()
      .then((cfg) => {
        _billingFlag = Boolean(cfg?.billing?.chargeCurrency)
        return _billingFlag
      })
      .catch(() => {
        // Config unavailable → assume billing disabled (degrade gracefully,
        // no billing requests fired).
        _billingFlag = false
        return _billingFlag
      })
  }
  return _billingFlagPromise
}

/** Hook: resolves whether billing is enabled on this instance (cached). */
export function useBillingEnabled() {
  // Seed from the cached flag so a resolved value renders immediately with no
  // effect-driven setState.
  const [enabled, setEnabled] = useState(_billingFlag)
  useEffect(() => {
    if (_billingFlag !== null) return // already resolved → state already seeded
    let active = true
    resolveBillingEnabled().then((v) => active && setEnabled(v))
    return () => { active = false }
  }, [])
  return enabled // null while loading, then true | false
}

// ── Generic data hook factory ─────────────────────────────────────────────────

const initState = { data: null, loading: false, error: null, disabled: false }

function makeReducer() {
  return function reducer(state, action) {
    switch (action.type) {
      case 'FETCH_START':   return { ...state, loading: true, error: null, disabled: false }
      case 'FETCH_DONE':    return { ...state, loading: false, data: action.data }
      case 'FETCH_ERROR':   return { ...state, loading: false, error: action.error }
      case 'FETCH_DISABLED':return { ...state, loading: false, disabled: true, data: null }
      default: return state
    }
  }
}

function makeFetcher(path) {
  return function useFetcher(orgId) {
    const [state, dispatch] = useReducer(makeReducer(), initState)
    const genRef = useRef(0)

    const doFetch = useCallback(async () => {
      if (!orgId) return
      const gen = ++genRef.current
      dispatch({ type: 'FETCH_START' })
      try {
        // Gate on the public billing flag — don't hit /api/billing/* (and
        // generate 404 noise) when billing isn't configured on this instance.
        const enabled = await resolveBillingEnabled()
        if (genRef.current !== gen) return
        if (!enabled) {
          dispatch({ type: 'FETCH_DISABLED' })
          return
        }
        const data = await api.get(path)
        if (genRef.current !== gen) return
        dispatch({ type: 'FETCH_DONE', data })
      } catch (e) {
        if (genRef.current !== gen) return
        if (e.status === 404 || e.status === 403) {
          dispatch({ type: 'FETCH_DISABLED' })
        } else {
          dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load' })
        }
      }
    }, [orgId])

    useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

    return { ...state, refetch: doFetch }
  }
}

// ── Plans hook ────────────────────────────────────────────────────────────────

export function usePlans() {
  const { activeOrgId } = useOrg()
  const fetcher = makeFetcher('/api/billing/plans')
  return fetcher(activeOrgId)
}

// ── Subscription hook ─────────────────────────────────────────────────────────

export function useSubscription() {
  const { activeOrgId } = useOrg()
  const fetcher = makeFetcher('/api/billing/subscription')
  return fetcher(activeOrgId)
}

// ── Usage hook ────────────────────────────────────────────────────────────────

export function useUsage() {
  const { activeOrgId } = useOrg()
  const fetcher = makeFetcher('/api/billing/usage')
  return fetcher(activeOrgId)
}

// ── Invoices hook ─────────────────────────────────────────────────────────────

export function useInvoices() {
  const { activeOrgId } = useOrg()
  const fetcher = makeFetcher('/api/billing/invoices')
  return fetcher(activeOrgId)
}

// ── Invoice detail hook ───────────────────────────────────────────────────────

export function useInvoiceDetail(id) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(makeReducer(), initState)
  const genRef = useRef(0)

  const doFetch = useCallback(async () => {
    if (!activeOrgId || !id) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const enabled = await resolveBillingEnabled()
      if (genRef.current !== gen) return
      if (!enabled) {
        dispatch({ type: 'FETCH_DISABLED' })
        return
      }
      const data = await api.get(`/api/billing/invoices/${id}`)
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_DONE', data })
    } catch (e) {
      if (genRef.current !== gen) return
      if (e.status === 404 || e.status === 403) {
        dispatch({ type: 'FETCH_DISABLED' })
      } else {
        dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load invoice' })
      }
    }
  }, [activeOrgId, id])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { ...state, refetch: doFetch }
}
