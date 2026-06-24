/**
 * useChat — drives the agentic AI chat panel.
 *
 * Owns:
 *   - the running message thread,
 *   - the live SSE stream from POST /api/chat (token/tool/action/done/error),
 *   - the selected model (persisted to localStorage),
 *   - the stop / regenerate controls.
 *
 * Message shapes:
 *   { id, role: 'user',      content }
 *   { id, role: 'assistant', parts: Part[], streaming, error }
 *
 * A Part is an ordered fragment of an assistant turn so tool cards and action
 * buttons interleave naturally with streamed prose:
 *   { kind: 'text',   text }
 *   { kind: 'tool',   id, name, args, status: 'running'|'done'|'error', result, error }
 *   { kind: 'action', id, action, status: 'idle'|'running'|'done'|'error', result, error }
 *
 * Usage:
 *   const c = useChat()
 *   c.send('how is our cycle time trending?')
 *   c.stop(); c.regenerate(); c.runAction(messageId, partId)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchModels, streamChat, runChatAction, ApiError } from './api.js'

let _seq = 0
const nextId = () => `m${Date.now()}-${_seq++}`

const MODEL_KEY = 'gs_chat_model'

/** Cheapest model wins the default (sum of in+out our-rates). */
function pickDefaultModel(models) {
  if (!models?.length) return null
  let best = models[0]
  let bestCost = Infinity
  for (const m of models) {
    const cost = (m.ourInputUsdPerMTok ?? m.inputUsdPerMTok ?? 0) +
      (m.ourOutputUsdPerMTok ?? m.outputUsdPerMTok ?? 0)
    if (cost < bestCost) { bestCost = cost; best = m }
  }
  return best.id
}

/** Convert the thread into the {role, content} list the backend expects. */
function toWireMessages(messages) {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role,
      content: m.role === 'user'
        ? m.content
        : (m.parts ?? []).filter(p => p.kind === 'text').map(p => p.text).join(''),
    }))
    .filter(m => m.content?.trim())
}

export function useChat() {
  const [messages, setMessages] = useState([])
  const [models, setModels] = useState([])
  const [modelId, setModelId] = useState(() => localStorage.getItem(MODEL_KEY) || null)
  const [sending, setSending] = useState(false)
  const [gatewayDisabled, setGatewayDisabled] = useState(false)

  const abortRef = useRef(null)

  // Load the model catalogue once; choose a default if none persisted.
  useEffect(() => {
    let alive = true
    fetchModels()
      .then(list => {
        if (!alive || !Array.isArray(list)) return
        setModels(list)
        setModelId(prev => {
          if (prev && list.some(m => m.id === prev)) return prev
          const def = pickDefaultModel(list)
          if (def) localStorage.setItem(MODEL_KEY, def)
          return def
        })
      })
      .catch(() => { /* offline price list is non-fatal */ })
    return () => { alive = false }
  }, [])

  const chooseModel = useCallback((id) => {
    setModelId(id)
    if (id) localStorage.setItem(MODEL_KEY, id)
  }, [])

  /** Patch a single assistant message by id (immutable update). */
  const patchAssistant = useCallback((id, fn) => {
    setMessages(prev => prev.map(m => (m.id === id ? fn(m) : m)))
  }, [])

  /** Run the SSE stream for an already-appended assistant placeholder. */
  const runStream = useCallback(async (wireMessages, assistantId) => {
    const controller = new AbortController()
    abortRef.current = controller
    setSending(true)

    // Append text to the trailing text part, or start one.
    const appendText = (text) => patchAssistant(assistantId, (m) => {
      const parts = [...m.parts]
      const last = parts[parts.length - 1]
      if (last && last.kind === 'text') {
        parts[parts.length - 1] = { ...last, text: last.text + text }
      } else {
        parts.push({ kind: 'text', text })
      }
      return { ...m, parts }
    })

    try {
      await streamChat(
        { messages: wireMessages, model: modelId },
        ({ type, data }) => {
          switch (type) {
            case 'token':
              if (data?.text) appendText(data.text)
              break
            case 'tool_call':
              patchAssistant(assistantId, (m) => ({
                ...m,
                parts: [...m.parts, {
                  kind: 'tool', id: data.id ?? nextId(),
                  name: data.name ?? 'tool', args: data.args ?? null,
                  status: 'running', result: null, error: null,
                }],
              }))
              break
            case 'tool_result':
              patchAssistant(assistantId, (m) => ({
                ...m,
                parts: m.parts.map(p =>
                  p.kind === 'tool' && p.id === data.id
                    ? { ...p, status: data.error ? 'error' : 'done', result: data.result ?? null, error: data.error ?? null, name: data.name ?? p.name }
                    : p),
              }))
              break
            case 'action':
              patchAssistant(assistantId, (m) => ({
                ...m,
                parts: [...m.parts, {
                  kind: 'action', id: nextId(),
                  action: data, status: 'idle', result: null, error: null,
                }],
              }))
              break
            case 'done':
              // If the server sends a final content, ensure it's reflected (some
              // servers stream only `done` with no prior tokens).
              patchAssistant(assistantId, (m) => {
                const hasText = m.parts.some(p => p.kind === 'text' && p.text)
                if (!hasText && data?.content) {
                  return { ...m, parts: [{ kind: 'text', text: data.content }, ...m.parts.filter(p => p.kind !== 'text')] }
                }
                return m
              })
              break
            case 'error':
              patchAssistant(assistantId, (m) => ({ ...m, error: data?.error ?? 'The assistant hit an error.' }))
              break
            default:
              break
          }
        },
        { signal: controller.signal },
      )
    } catch (err) {
      if (err?.name === 'AbortError') {
        // User stopped — keep whatever streamed so far.
      } else if (err instanceof ApiError && err.status === 503) {
        setGatewayDisabled(true)
        patchAssistant(assistantId, (m) => ({ ...m, error: 'AI chat isn’t enabled on this server yet.' }))
      } else {
        patchAssistant(assistantId, (m) => ({ ...m, error: err?.message ?? 'Something went wrong. Please try again.' }))
      }
    } finally {
      patchAssistant(assistantId, (m) => ({ ...m, streaming: false }))
      setSending(false)
      abortRef.current = null
    }
  }, [modelId, patchAssistant])

  const send = useCallback((raw) => {
    const content = (raw ?? '').trim()
    if (!content || sending) return

    const userMsg = { id: nextId(), role: 'user', content }
    const assistantId = nextId()
    const assistantMsg = { id: assistantId, role: 'assistant', parts: [], streaming: true, error: null }

    // Build the wire history including this new user turn.
    let wire
    setMessages(prev => {
      const next = [...prev, userMsg, assistantMsg]
      wire = toWireMessages([...prev, userMsg])
      return next
    })
    runStream(wire, assistantId)
  }, [sending, runStream])

  /** Stop the in-flight stream. */
  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  /** Re-run the last user turn, replacing the last assistant message. */
  const regenerate = useCallback(() => {
    if (sending) return
    setMessages(prev => {
      // Drop the trailing assistant message; re-derive history up to last user.
      const lastUserIdx = [...prev].map(m => m.role).lastIndexOf('user')
      if (lastUserIdx === -1) return prev
      const history = prev.slice(0, lastUserIdx + 1)
      const wire = toWireMessages(history)
      const assistantId = nextId()
      const assistantMsg = { id: assistantId, role: 'assistant', parts: [], streaming: true, error: null }
      // Defer the stream until after state commits.
      queueMicrotask(() => runStream(wire, assistantId))
      return [...history, assistantMsg]
    })
  }, [sending, runStream])

  /** Confirm-and-execute an assistant-proposed action (button click only). */
  const runAction = useCallback(async (messageId, partId) => {
    let action
    patchAssistant(messageId, (m) => ({
      ...m,
      parts: m.parts.map(p => {
        if (p.id === partId && p.kind === 'action') { action = p.action; return { ...p, status: 'running', error: null } }
        return p
      }),
    }))
    if (!action) return

    const setPart = (patch) => patchAssistant(messageId, (m) => ({
      ...m,
      parts: m.parts.map(p => (p.id === partId ? { ...p, ...patch } : p)),
    }))

    try {
      const result = await runChatAction(action)
      // plan_upgrade (or any checkout) → redirect to Paystack.
      const url = result?.authorization_url || result?.url
      if (action.type === 'plan_upgrade' || (url && /paystack|checkout/i.test(url))) {
        setPart({ status: 'done', result })
        if (url) { window.location.href = url; return }
      }
      setPart({ status: 'done', result })
    } catch (err) {
      setPart({ status: 'error', error: err?.message ?? 'Action failed.' })
    }
  }, [patchAssistant])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
  }, [])

  const selectedModel = models.find(m => m.id === modelId) ?? null
  const canRegenerate = !sending && messages.some(m => m.role === 'user')

  return {
    messages, sending, send, stop, regenerate, reset, runAction,
    models, modelId, selectedModel, chooseModel,
    gatewayDisabled, canRegenerate,
  }
}
