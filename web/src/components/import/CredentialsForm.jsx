/**
 * CredentialsForm — step 2 of the wizard. Per-source credential fields.
 * Credentials are held in local state and sent only on the request; the honest
 * security note is always visible.
 */
import { ShieldCheck } from 'lucide-react'
import { Button } from '../ui/index.js'

function Field({ label, hint, optional, children }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1.5">
        {label}
        {optional && <span className="normal-case tracking-normal text-[var(--text-faint)] font-mono">optional</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-[var(--text-faint)] mt-1 font-mono">{hint}</p>}
    </div>
  )
}

const inputCls =
  'w-full rounded-[var(--radius-btn)] bg-[var(--bg-surface3)] border border-[var(--border)] ' +
  'px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] ' +
  'focus:outline-none focus:border-[var(--brand-teal)] transition-colors'

export function CredentialsForm({ source, form, onChange, onSubmit, loading, error }) {
  const set = (k) => (e) => onChange({ ...form, [k]: e.target.value })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {source === 'jira' ? (
        <>
          <Field label="Site URL" hint="e.g. https://acme.atlassian.net">
            <input
              className={inputCls}
              type="url"
              placeholder="https://your-team.atlassian.net"
              value={form.baseUrl ?? ''}
              onChange={set('baseUrl')}
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Account Email">
            <input
              className={inputCls}
              type="email"
              placeholder="you@company.com"
              value={form.email ?? ''}
              onChange={set('email')}
              autoComplete="off"
              required
            />
          </Field>
          <Field label="API Token" hint="Create at id.atlassian.com → Security → API tokens">
            <input
              className={inputCls}
              type="password"
              placeholder="••••••••••••••••"
              value={form.apiToken ?? ''}
              onChange={set('apiToken')}
              autoComplete="off"
              required
            />
          </Field>
          <Field label="JQL Filter" optional hint='Defaults to "order by created DESC". Limit what imports.'>
            <input
              className={inputCls + ' font-mono'}
              type="text"
              placeholder="project = ENG AND statusCategory != Done"
              value={form.jql ?? ''}
              onChange={set('jql')}
              autoComplete="off"
            />
          </Field>
        </>
      ) : (
        <>
          <Field label="API Key" hint="Create at linear.app → Settings → Security & access → API keys">
            <input
              className={inputCls}
              type="password"
              placeholder="lin_api_••••••••••••"
              value={form.apiKey ?? ''}
              onChange={set('apiKey')}
              autoComplete="off"
              required
            />
          </Field>
          <Field label="Team ID" optional hint="Scope to one team. Leave blank to import all teams.">
            <input
              className={inputCls + ' font-mono'}
              type="text"
              placeholder="e.g. a1b2c3d4-…"
              value={form.teamId ?? ''}
              onChange={set('teamId')}
              autoComplete="off"
            />
          </Field>
        </>
      )}

      <div className="flex items-start gap-2 rounded-[var(--radius-btn)] border border-[var(--border)] bg-[var(--bg-surface2)] px-3 py-2.5">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--brand-teal)]" />
        <p className="text-xs text-[var(--text-muted)] leading-snug">
          Your credentials are used for this import only — they are{' '}
          <span className="text-[var(--text-dim)] font-medium">never stored and never logged</span>.
          They live in this browser tab until you leave the page.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-[var(--radius-btn)] px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? 'Connecting…' : 'Preview import'}
        </Button>
      </div>
    </form>
  )
}
