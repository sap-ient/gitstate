/**
 * useCycleTime — fetch cycle-time lead times from /api/metrics/cycle-time.
 * Params: { repo, from, to } — all optional.
 * Returns: { points, loading, error, refetch }
 * points shape: Array<{
 *   date: string,        // merge date (YYYY-MM-DD) — the chart's chronological x-axis
 *   days: number|null,   // lead time (first commit → merge) in days
 *   reviewDays: number|null, // time open / in review (PR open → merge) in days
 *   title?: string, repo?: string
 * }>
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

  const { repo, from, to, author } = filters

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const params = new URLSearchParams()
      if (repo) params.set('repo', repo)
      if (from) params.set('from', from)
      if (to)   params.set('to', to)
      // author may be a raw login/email OR a `contributor:<id>` token — the backend
      // expands the latter into the contributor's full identity set.
      if (author) params.set('author', author)
      const qs = params.toString()
      const data = await api.get(`/api/metrics/cycle-time${qs ? `?${qs}` : ''}`)
      if (genRef.current !== gen) return
      const raw = Array.isArray(data) ? data : (data?.points ?? [])
      // API rows: { leadTimeSecs, reviewSecs, mergedAt, title, repo, prId, ... }.
      // The chart plots lead time chronologically by MERGE date (not compute date).
      const secsToDays = s => (typeof s === 'number' ? s / 86400 : null)
      const points = raw
        .map(r => ({
          date: typeof r.mergedAt === 'string' && r.mergedAt
            ? r.mergedAt.slice(0, 10)
            : (typeof r.computedAt === 'string' ? r.computedAt.slice(0, 10) : (r.date ?? '')),
          days: typeof r.leadTimeSecs === 'number' ? r.leadTimeSecs / 86400
            : (typeof r.days === 'number' ? r.days : null),
          reviewDays: secsToDays(r.reviewSecs),
          title: r.title,
          repo: r.repo,
          prId: r.prId,
        }))
        // Drop rows without a measurable lead time so the chart/stats stay honest
        // (no zero-spikes for PRs that have no first-commit timestamp).
        .filter(p => typeof p.days === 'number' && !Number.isNaN(p.days))
      dispatch({ type: 'FETCH_DONE', points })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load cycle time' })
    }
  }, [activeOrgId, repo, from, to, author])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { points: state.points, loading: state.loading, error: state.error, refetch: doFetch }
}
