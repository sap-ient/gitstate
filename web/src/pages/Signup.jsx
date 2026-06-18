import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup, ApiError } from '../lib/api.js'
import { useAuth } from '../lib/useAuth.js'
import { LogoFull } from '../components/Logo.jsx'

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  )
}

export default function Signup() {
  const navigate = useNavigate()
  const { setToken, isAuthed } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isAuthed) navigate('/', { replace: true })
  }, [isAuthed, navigate])

  function validate() {
    if (!name.trim()) return 'Full name is required.'
    if (!email.trim()) return 'Email is required.'
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const validationErr = validate()
    if (validationErr) {
      setError(validationErr)
      return
    }
    setError(null)
    setLoading(true)
    try {
      // API: POST /auth/signup { email, name, password }
      //      → { accessToken, refreshToken, user }
      const data = await signup(email, name.trim(), password)
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

  // Live confirm-match indicator
  const confirmMismatch = confirm.length > 0 && confirm !== password

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.06]"
          style={{ background: 'radial-gradient(ellipse at center, #6366F1, #2DD4BF)' }}
        />
      </div>

      <div className="relative w-full max-w-[400px]">
        <div className="flex justify-center mb-8">
          <LogoFull height={38} />
        </div>

        <div className="bg-[#111827] border border-[#1e2d45] rounded-2xl p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-[#e2e8f0] mb-1 text-center tracking-tight">
            Create your account
          </h1>
          <p className="text-sm text-[#64748b] text-center mb-7">
            Start tracking your projects from git
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Full name */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5" htmlFor="name">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1628] border border-[#1e2d45] text-sm text-[#e2e8f0] placeholder-[#334155] outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/30 transition-all duration-150"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5" htmlFor="email">
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
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1628] border border-[#1e2d45] text-sm text-[#e2e8f0] placeholder-[#334155] outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/30 transition-all duration-150"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0d1628] border border-[#1e2d45] text-sm text-[#e2e8f0] placeholder-[#334155] outline-none focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/30 transition-all duration-150"
              />
              {password.length > 0 && (
                <PasswordStrength password={password} />
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-medium text-[#94a3b8] mb-1.5" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                className={[
                  'w-full px-3.5 py-2.5 rounded-lg bg-[#0d1628] border text-sm text-[#e2e8f0] placeholder-[#334155] outline-none transition-all duration-150',
                  confirmMismatch
                    ? 'border-red-500/50 focus:border-red-400 focus:ring-1 focus:ring-red-400/20'
                    : 'border-[#1e2d45] focus:border-[#2DD4BF] focus:ring-1 focus:ring-[#2DD4BF]/30',
                ].join(' ')}
              />
              {confirmMismatch && (
                <p className="text-xs text-red-400 mt-1">Passwords don&apos;t match.</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold text-[#0B1120] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? '#2DD4BF'
                  : 'linear-gradient(135deg, #2DD4BF, #6366F1)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner />
                  Creating account…
                </span>
              ) : 'Create account'}
            </button>
          </form>

          <p className="text-center text-xs text-[#334155] mt-5 leading-relaxed">
            By signing up you agree to the{' '}
            <a href="#" className="text-[#2DD4BF]/70 hover:text-[#2DD4BF]">Terms</a>
            {' '}and{' '}
            <a href="#" className="text-[#2DD4BF]/70 hover:text-[#2DD4BF]">Privacy Policy</a>.
          </p>
        </div>

        <p className="text-center text-sm text-[#64748b] mt-6">
          Already have an account?{' '}
          <Link
            to="/login"
            className="text-[#2DD4BF] hover:text-[#5eead4] font-medium transition-colors duration-150"
          >
            Sign in
          </Link>
        </p>

        <p className="text-center text-xs text-[#334155] mt-3 font-mono">
          open-source · self-hostable · AGPL-3.0
        </p>
      </div>
    </div>
  )
}

/** Visual password-strength meter. */
function PasswordStrength({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const strength = checks.filter(Boolean).length

  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength]
  const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#2DD4BF']

  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="h-0.5 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i <= strength ? colors[strength] : '#1e2d45',
            }}
          />
        ))}
      </div>
      {label && (
        <p className="text-xs" style={{ color: colors[strength] }}>
          {label}
        </p>
      )}
    </div>
  )
}
