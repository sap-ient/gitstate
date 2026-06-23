/**
 * useAnalytics — hooks for the /api/analytics/* dashboard endpoints.
 *
 * Every hook follows the useOrg + race-safe (genRef) pattern used across the app.
 * They all take the shared filter object: { from, to, repo, author }.
 *
 * Exports:
 *   useSummary(filters)          → { data, loading, error, refetch }
 *   useHeatmap(filters)          → { data, loading, error, refetch }   data: [{date,count}]
 *   useCommitsOverTime(filters, bucket) → { data, loading, error, refetch }  data: [{date,count}]
 *   useCommitsByContributor(filters, bucket, top, other) → { ... }  data: [{login,...,points:[{date,count}]}]
 *   useChurnOverTime(filters, bucket) → { ... }  data: [{date,additions,deletions}]
 *   useChurnByContributor(filters, bucket, top, other) → { ... }  data: [{login,...,points:[{date,additions,deletions}]}]
 *   useContributors(filters)     → { data, loading, error, refetch }   data: [{login,...}]
 *   useRepoStats(filters)        → { data, loading, error, refetch }   data: [{repoId,...}]
 *   usePullRequests(filters)     → { data, loading, error, refetch }   data: {total,merged,...,throughput:[]}
 *   useIssueFlow(filters)        → { data, loading, error, refetch }   data: {open,...,opened:[],closedSeries:[],byProject:[]}
 *   useAgentShare(filters)       → { data, loading, error, refetch }   data: {agentCommits,humanCommits,agentPct,overTime:[]}
 *   useProjects(filters)         → { data, loading, error, refetch }   data: [{projectId,name,...}]
 *   useDayCommits(date, filters) → { data, loading, error }            data: [{sha,...}]  (date null = idle)
 */
import { useReducer, useEffect, useCallback, useRef } from 'react'
import { useOrg } from './useOrg.js'
import * as api from './api.js'

// ── Shared reducer ────────────────────────────────────────────────────────────

function makeInit(empty) {
  return { data: empty, loading: false, error: null }
}

function reducer(state, action) {
  switch (action.type) {
    case 'FETCH_START': return { ...state, loading: true, error: null }
    case 'FETCH_DONE':  return { ...state, loading: false, data: action.data }
    case 'FETCH_ERROR': return { ...state, loading: false, error: action.error }
    default: return state
  }
}

/** Build a `?from=&to=&repo=&author=` query string from the filter object. */
function filterQS(filters = {}, extra = {}) {
  const params = new URLSearchParams()
  const { from, to, repo, author } = filters
  if (from)   params.set('from', from)
  if (to)     params.set('to', to)
  if (repo)   params.set('repo', repo)
  if (author) params.set('author', author)
  for (const [k, v] of Object.entries(extra)) {
    if (v != null && v !== '') params.set(k, v)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Generic analytics fetch hook factory.
 * @param {string} path        endpoint suffix after /api/analytics/
 * @param {object} filters     shared filter object
 * @param {*} empty            empty-state value (array or null)
 * @param {function} normalize maps the raw payload → consumer shape
 * @param {object} extra       extra query params (e.g. { bucket })
 */
function useAnalyticsResource(path, filters, empty, normalize, extra) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, empty, makeInit)
  const genRef = useRef(0)

  const { from, to, repo, author } = filters
  const extraKey = extra ? JSON.stringify(extra) : ''

  const doFetch = useCallback(async () => {
    if (!activeOrgId) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    try {
      const qs = filterQS({ from, to, repo, author }, extra)
      const raw = await api.get(`/api/analytics/${path}${qs}`)
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_DONE', data: normalize(raw) })
    } catch (e) {
      if (genRef.current !== gen) return
      dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load analytics' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId, from, to, repo, author, path, extraKey])

  useEffect(() => { doFetch().catch(() => {}) }, [doFetch])

  return { data: state.data, loading: state.loading, error: state.error, refetch: doFetch }
}

const asArray = (raw) => (Array.isArray(raw) ? raw : (raw?.items ?? []))

// ── Public hooks ──────────────────────────────────────────────────────────────

export function useSummary(filters = {}) {
  return useAnalyticsResource('summary', filters, null, (raw) => raw ?? null)
}

export function useHeatmap(filters = {}) {
  return useAnalyticsResource('heatmap', filters, [], asArray)
}

export function useCommitsOverTime(filters = {}, bucket = 'day') {
  return useAnalyticsResource('commits-over-time', filters, [], asArray, { bucket })
}

export function useContributors(filters = {}) {
  return useAnalyticsResource('contributors', filters, [], asArray)
}

/**
 * Per-contributor commit timeline: the top-N contributors as separate 0-filled
 * series sharing a bucket axis. data: [{login,email,name,isAgent,points:[{date,count}]}]
 * @param {object} filters shared filter object
 * @param {string} bucket  day|week|month (same auto-bucket as commits-over-time)
 * @param {number} top     top-N contributors (default 5)
 * @param {boolean} other  append an "Everyone else" aggregate line
 */
export function useCommitsByContributor(filters = {}, bucket = 'day', top = 5, other = false) {
  return useAnalyticsResource('commits-by-contributor', filters, [], asArray, {
    bucket, top, other: other ? 1 : undefined,
  })
}

/**
 * Lines-of-code churn over time: per-bucket summed additions/deletions over the
 * filtered commit set. data: [{date, additions, deletions}]
 * @param {object} filters shared filter object
 * @param {string} bucket  day|week|month (same auto-bucket as commits-over-time)
 */
export function useChurnOverTime(filters = {}, bucket = 'day') {
  return useAnalyticsResource('churn-over-time', filters, [], asArray, { bucket })
}

/**
 * Per-contributor churn timeline: the top-N contributors as separate 0-filled
 * series sharing a bucket axis. data: [{login,email,name,isAgent,contributorId,points:[{date,additions,deletions}]}]
 * @param {object} filters shared filter object
 * @param {string} bucket  day|week|month
 * @param {number} top     top-N contributors (default 5)
 * @param {boolean} other  append an "Everyone else" aggregate line
 */
export function useChurnByContributor(filters = {}, bucket = 'day', top = 5, other = false) {
  return useAnalyticsResource('churn-by-contributor', filters, [], asArray, {
    bucket, top, other: other ? 1 : undefined,
  })
}

export function useRepoStats(filters = {}) {
  return useAnalyticsResource('repos', filters, [], asArray)
}

/** Pull-request analytics: totals, merge-rate, lead-time, throughput. data: object|null */
export function usePullRequests(filters = {}) {
  return useAnalyticsResource('pull-requests', filters, null, (raw) => raw ?? null)
}

/** Issue-flow: state breakdown + opened/closedSeries over time + byProject. data: object|null */
export function useIssueFlow(filters = {}) {
  return useAnalyticsResource('issue-flow', filters, null, (raw) => raw ?? null)
}

/** Agent vs human commit split (+ over time). data: object|null */
export function useAgentShare(filters = {}) {
  return useAnalyticsResource('agent-share', filters, null, (raw) => raw ?? null)
}

/** Per-project table. data: [{projectId,name,commits,...}] */
export function useProjects(filters = {}) {
  return useAnalyticsResource('projects', filters, [], asArray)
}

/**
 * useDayCommits — drill-down for a single day. `date` null/'' → idle (no fetch).
 * Respects the active filters so the drill-down stays consistent with the heatmap.
 */
export function useDayCommits(date, filters = {}) {
  const { activeOrgId } = useOrg()
  const [state, dispatch] = useReducer(reducer, [], makeInit)
  const genRef = useRef(0)

  const { repo, author } = filters

  useEffect(() => {
    if (!activeOrgId || !date) return
    const gen = ++genRef.current
    dispatch({ type: 'FETCH_START' })
    ;(async () => {
      try {
        const qs = filterQS({ repo, author })
        const raw = await api.get(`/api/analytics/day/${date}${qs}`)
        if (genRef.current !== gen) return
        dispatch({ type: 'FETCH_DONE', data: asArray(raw) })
      } catch (e) {
        if (genRef.current !== gen) return
        dispatch({ type: 'FETCH_ERROR', error: e.message ?? 'Failed to load commits' })
      }
    })()
  }, [activeOrgId, date, repo, author])

  return { data: state.data, loading: state.loading, error: state.error }
}
