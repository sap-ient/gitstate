import { Outlet, Navigate } from 'react-router-dom'
import { createContext, useContext, useState } from 'react'
import { Sidebar } from './Sidebar.jsx'
import { TopBar } from './TopBar.jsx'
import { ChatPanel } from './chat/ChatPanel.jsx'
import { useAuth } from '../lib/useAuth.js'

const ChatCtx = createContext(null)

/** Access the chat panel open/close state from anywhere in the shell. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChatPanel() {
  const ctx = useContext(ChatCtx)
  if (!ctx) throw new Error('useChatPanel must be used inside AppShell')
  return ctx
}

/**
 * App shell — sidebar + (top bar + content row).
 * The content row holds a centered, generous container for the routed
 * <Outlet/> plus an optional right-hand AI chat rail. Chat open/closed
 * state is lifted here so it persists across navigation and the TopBar
 * button can toggle it.
 * Redirects to /login if not authenticated.
 */
export function AppShell() {
  const { isAuthed } = useAuth()
  const [chatOpen, setChatOpen] = useState(false)

  if (!isAuthed) return <Navigate to="/login" replace />

  const chat = {
    chatOpen,
    openChat: () => setChatOpen(true),
    closeChat: () => setChatOpen(false),
    toggleChat: () => setChatOpen(v => !v),
  }

  return (
    <ChatCtx.Provider value={chat}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-[var(--radius-btn)] focus:bg-[var(--bg-surface)] focus:text-[var(--text)] focus:border focus:border-[var(--brand-teal)] focus:shadow-[var(--shadow-float)] focus:outline-none"
      >
        Skip to content
      </a>
      <div className="flex min-h-screen bg-[var(--bg)]">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar />
          <div className="flex flex-1 min-h-0">
            <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 overflow-y-auto">
              <div className="mx-auto w-full max-w-[1400px] px-8 py-8">
                <Outlet />
              </div>
            </main>
            {chatOpen && (
              <aside className="w-[380px] shrink-0 border-l border-[var(--border)] bg-[var(--bg-surface)] flex flex-col h-[calc(100vh-3.5rem)] sticky top-14">
                <ChatPanel onClose={chat.closeChat} />
              </aside>
            )}
          </div>
        </div>
      </div>
    </ChatCtx.Provider>
  )
}
