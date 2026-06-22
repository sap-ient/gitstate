/**
 * Shared "Sign in with" provider metadata + button, used by both Login and Signup.
 * Providers render greyed-out and disabled when the server hasn't configured that
 * provider's OAuth credentials (config.auth.providers[name] === false), so the
 * option is always visible but clearly unavailable.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// Login providers shown on the auth pages, in order.
const LOGIN_PROVIDERS = ['github', 'gitlab']

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

export function OAuthButton({ name, meta, enabled }) {
  const base = "flex items-center justify-center gap-2.5 w-full px-4 py-2.5 rounded-[var(--radius-btn)] border text-sm font-medium transition-all duration-150"
  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title="Not configured on this server — set this provider's OAuth client id + secret to enable it."
        className={`${base} border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-faint)] opacity-60 cursor-not-allowed`}
      >
        <span className="opacity-50">{meta.icon}</span>
        {meta.label}
        <span className="ml-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-faint)]">· off</span>
      </button>
    )
  }
  return (
    <a
      href={`${BASE}/auth/oauth/${name}/start`}
      className={`${base} border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text)] hover:bg-[var(--bg-surface2)] hover:border-[var(--border2)]`}
    >
      {meta.icon}
      {meta.label}
    </a>
  )
}

/** ProviderButtons renders the full greyed-aware login-provider button list. */
export function ProviderButtons({ providers }) {
  return (
    <div className="space-y-2.5 mb-6">
      {LOGIN_PROVIDERS.map((name) => (
        <OAuthButton key={name} name={name} meta={PROVIDER_META[name]} enabled={!!(providers ?? {})[name]} />
      ))}
    </div>
  )
}
