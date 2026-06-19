/**
 * useChat — drives the AI chat panel.
 *
 * Holds the running message list and sends each user question to the
 * NL→report endpoint (POST /api/reports/query → { answer, sql, rows }).
 *
 * Messages:
 *   { id, role: 'user',      text }
 *   { id, role: 'assistant', text, sql, rows, error }
 *
 * Usage:
 *   const { messages, sending, send, reset } = useChat()
 *   send('which PRs took longest to merge?')
 */
import { useCallback, useState } from 'react'
import { post } from './api.js'

let _seq = 0
const nextId = () => `m${Date.now()}-${_seq++}`

export function useChat() {
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)

  const send = useCallback(async (raw) => {
    const question = (raw ?? '').trim()
    if (!question || sending) return

    setMessages(prev => [...prev, { id: nextId(), role: 'user', text: question }])
    setSending(true)

    try {
      const data = await post('/api/reports/query', { question })
      setMessages(prev => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: data?.answer ?? '',
          sql: data?.sql ?? null,
          rows: Array.isArray(data?.rows) ? data.rows : null,
        },
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          text: '',
          error: err?.message ?? 'Something went wrong. Please try again.',
        },
      ])
    } finally {
      setSending(false)
    }
  }, [sending])

  const reset = useCallback(() => setMessages([]), [])

  return { messages, sending, send, reset }
}
