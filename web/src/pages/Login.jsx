import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login, fetchConfig, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/useAuth.js'
import { LogoFull } from '../components/Logo.jsx'

function OAuthButton({ href, children, icon }) {
  return (
    <a
      href={href}
      className="flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-surface2)] hover:border-[var(--border2)] transition-all duration-150"
    >
      {icon}
      {children}
    </a>
  )
}

const PROVIDER_META = {
  github: {
    label: 'Continue with GitHub',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.26.82-.57 0-.28-.01-1.02-.02-2-3.34.72-4.04-1.59-4.04-1.59-.55-1.38-1.34-1.75-1.34-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.22 1.84 1.22 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.57-2.67-.3-5.47-1.31-5.47-5.84 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 3-.4c1.02 0 2.05.13 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.24 1.88 1.24 3.17 0 4.54-2.81 5.53-5.49 5.83.43.36.81 1.08.81 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.69.83.57C20.56 21.91 24 17.5 24 12.29 24 5.78 18.63.5 12 .5z" />
      </svg>
    ),
  },
  gitlab: {
    label: 'Continue with GitLab',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#E24329" d="M12 21.42 15.31 11.2H8.69L12 21.42Z" />
        <path fill="#FC6D26" d="M12 21.42 8.69 11.2H4.05L12 21.42Z" />
        <path fill="#FCA326" d="M4.05 11.2 3.04 14.3a.69.69 0 0 0 .25.77L12 21.42 4.05 11.2Z" />
        <path fill="#E24329" d="M4.05 11.2h4.64L6.69 5.05a.34.34 0 0 0-.65 0L4.05 11.2Z" />
        <path fill="#FC6D26" d="M12 21.42 15.31 11.2h4.64L12 21.42Z" />
        <path fill="#FCA326" d="m19.95 11.2 1.01 3.1a.69.69 0 0 1-.25.77L12 21.42l7.95-10.22Z" />
        <path fill="#E24329" d="M19.95 11.2h-4.64l2-6.15a.34.34 0 0 1 .65 0l1.99 6.15Z" />
      </svg>
    ),
  },
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

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
  const enabledProviders = Object.entries(providers).filter(([, enabled]) => enabled)
  const showOAuth = !configLoading && enabledProviders.length > 0

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
              <div className="space-y-2.5 mb-6">
                {enabledProviders.map(([name]) => {
                  const meta = PROVIDER_META[name]
                  if (!meta) return null
                  return (
                    <OAuthButton
                      key={name}
                      href={`${BASE}/auth/oauth/${name}/start`}
                      icon={meta.icon}
                    >
                      {meta.label}
                    </OAuthButton>
                  )
                })}
              </div>
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
