/**
 * useImport — drives the Jira / Linear import wizard.
 *
 * Credentials live only in component state and the request body; they are never
 * persisted client-side and the backend never stores or logs them.
 */
import { useState, useCallback } from 'react'
import { post } from '../lib/api.js'

/** Provider metadata used by the wizard. */
export const SOURCES = {
  jira: {
    id: 'jira',
    label: 'Jira',
    blurb: 'Atlassian Jira Cloud — import via your account email + API token.',
  },
  linear: {
    id: 'linear',
    label: 'Linear',
    blurb: 'Linear — import via a personal API key, optionally scoped to one team.',
  },
}

/**
 * Build the request body for a given source from the form fields.
 * Only the fields a provider needs are sent.
 */
function credsForSource(source, form) {
  if (source === 'jira') {
    return {
      baseUrl: (form.baseUrl ?? '').trim(),
      email: (form.email ?? '').trim(),
      apiToken: (form.apiToken ?? '').trim(),
      jql: (form.jql ?? '').trim(),
    }
  }
  // linear
  return {
    apiKey: (form.apiKey ?? '').trim(),
    teamId: (form.teamId ?? '').trim(),
  }
}

export function useImport() {
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const reset = useCallback(() => {
    setPreview(null)
    setResult(null)
    setError(null)
    setPreviewLoading(false)
    setImportLoading(false)
  }, [])

  /** POST /api/import/{source}/preview — fetch a sample + counts, no writes. */
  const runPreview = useCallback(async (source, form) => {
    setError(null)
    setResult(null)
    setPreviewLoading(true)
    try {
      const body = credsForSource(source, form)
      const data = await post(`/api/import/${source}/preview`, body)
      setPreview(data)
      return data
    } catch (e) {
      setError(e?.message ?? 'Preview failed')
      throw e
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  /** POST /api/import/{source} — run the import, returns a summary. */
  const runImport = useCallback(async (source, form) => {
    setError(null)
    setImportLoading(true)
    try {
      const body = credsForSource(source, form)
      const data = await post(`/api/import/${source}`, body)
      setResult(data)
      return data
    } catch (e) {
      setError(e?.message ?? 'Import failed')
      throw e
    } finally {
      setImportLoading(false)
    }
  }, [])

  return {
    preview,
    result,
    error,
    previewLoading,
    importLoading,
    runPreview,
    runImport,
    reset,
    setError,
  }
}
