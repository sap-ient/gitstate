import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, fetchConfig, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/useAuth.js'
import { LogoFull } from '../components/Logo.jsx'
import { ProviderButtons } from '../components/OAuthProviders.jsx'

export default function Login() {
  const navigate = useNavigate()
  const { setToken, isAuthed } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [config, setConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(true)

  // Handle OAuth redirect: backend sends back #access=...&refresh=...
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const params = new URLSearchParams(hash.replace(/^#/, ''))
    const accessToken = params.get('access')
    const refreshToken = params.get('refresh')
    if (accessToken) {
      setToken(accessToken, refreshToken ?? undefined)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      navigate('/', { replace: true })
    }
  }, [setToken, navigate])

  useEffect(() => {
    if (isAuthed) navigate('/', { replace: true })
  }, [isAuthed, navigate])

  useEffect(() => {
    let cancelled = false
    fetchConfig()
      .then(data => { if (!cancelled) setConfig(data) })
      .catch(() => { if (!cancelled) setConfig(null) })
      .finally(() => { if (!cancelled) setConfigLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data?.accessToken, data?.refreshToken)
      navigate('/')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Unable to reach the server. Try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const providers = config?.auth?.providers ?? {}
  // Always render the GitHub/GitLab buttons once config has loaded — greyed-out
  // (disabled) when that provider isn't configured on this server.
  const showOAuth = !configLoading

  const inputCls = "w-full px-3.5 py-2.5 rounded-[var(--radius-btn)] bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none focus:border-[var(--brand-teal)] focus:ring-1 focus:ring-[var(--brand-teal)]/30 transition-all duration-150"

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: 'var(--bg)' }}>
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(ellipse at center, var(--brand-teal), var(--brand-indigo))' }}
        />
      </div>

      <div className="relative w-full max-w-[400px]">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <LogoFull height={38} />
        </div>

        <div
          className="rounded-[var(--radius-card)] p-8 shadow-2xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <h1 className="text-xl font-semibold text-[var(--text)] mb-1 text-center tracking-tight font-display">
            Welcome back
          </h1>
          <p className="text-sm text-[var(--text-muted)] text-center mb-7">
            Sign in to your workspace
          </p>

          {showOAuth && (
            <>
              <ProviderButtons providers={providers} />
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-xs text-[var(--text-faint)] font-mono">or</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[var(--text-muted)]" htmlFor="password">
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-[var(--brand-teal)] hover:opacity-80 transition-opacity duration-150"
                  onClick={() => {/* forgot password — Wave B */}}
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            <div aria-live="polite">
              {error && (
                <div role="alert" className="flex items-start gap-2 px-3.5 py-2.5 rounded-[var(--radius-badge)] bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  {error}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-[var(--radius-btn)] text-sm font-semibold text-[#0B1120] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? 'var(--brand-teal)'
                  : 'linear-gradient(135deg, var(--brand-teal), var(--brand-indigo))',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Signing in…
                </span>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[var(--text-muted)] mt-6">
          Don&apos;t have an account?{' '}
          <Link
            to="/signup"
            className="text-[var(--brand-teal)] hover:opacity-80 font-medium transition-opacity duration-150"
          >
            Create one
          </Link>
        </p>

        <p className="text-center text-xs text-[var(--text-faint)] mt-3 font-mono">
          <Link to="/welcome" className="hover:text-[var(--text-muted)] transition-colors">
            open-source
          </Link>
          {' '}· self-hostable · AGPL-3.0
        </p>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}
