/**
 * Import page — wizard to bring existing Jira / Linear issues into gitstate.
 *
 * Steps: source → credentials → preview → result.
 * Credentials are entered, used for the request, and never stored or logged.
 */
import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DownloadCloud, Check } from 'lucide-react'
import { useImport, SOURCES } from '../lib/useImport.js'
import { SourcePicker } from '../components/import/SourcePicker.jsx'
import { CredentialsForm } from '../components/import/CredentialsForm.jsx'
import { PreviewPanel } from '../components/import/PreviewPanel.jsx'
import { ResultPanel } from '../components/import/ResultPanel.jsx'
import { Card } from '../components/ui/index.js'
import { Reveal } from '../components/Reveal.jsx'

const STEPS = ['Source', 'Connect', 'Preview', 'Done']

function Stepper({ current }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={[
                'flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-mono',
                done
                  ? 'bg-[var(--brand-teal)] border-[var(--brand-teal)] text-[var(--bg)]'
                  : active
                    ? 'border-[var(--brand-teal)] text-[var(--brand-teal)]'
                    : 'border-[var(--border)] text-[var(--text-faint)]',
              ].join(' ')}
            >
              {done ? <Check size={11} /> : i + 1}
            </span>
            <span className={active ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}>{label}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-[var(--border)]" />}
          </li>
        )
      })}
    </ol>
  )
}

export default function Import() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [source, setSource] = useState(null)
  const [form, setForm] = useState({})

  const {
    preview, result, error, previewLoading, importLoading,
    runPreview, runImport, reset, setError,
  } = useImport()

  const sourceLabel = source ? SOURCES[source].label : ''

  const pickSource = useCallback((id) => {
    setSource(id)
    setForm({})
    setError(null)
    setStep(1)
  }, [setError])

  const handlePreview = useCallback(async () => {
    try {
      await runPreview(source, form)
      setStep(2)
    } catch {
      // error surfaced in form via `error`
    }
  }, [runPreview, source, form])

  const handleImport = useCallback(async () => {
    try {
      await runImport(source, form)
      setStep(3)
    } catch {
      // error surfaced; stay on preview
    }
  }, [runImport, source, form])

  const startOver = useCallback(() => {
    reset()
    setForm({})
    setSource(null)
    setStep(0)
  }, [reset])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start gap-3 mb-2">
        <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-[var(--radius-btn)] bg-[var(--brand-teal)]/10 border border-[var(--brand-teal)]/20 shrink-0">
          <DownloadCloud size={17} className="text-[var(--brand-teal)]" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Import issues</h1>
          <p className="text-sm text-[var(--text-faint)] mt-1">
            Migrate from Jira or Linear. Re-importing is safe — issues are matched on their
            original key, so nothing gets duplicated.
          </p>
        </div>
      </div>

      <div className="my-6">
        <Stepper current={step} />
      </div>

      <Reveal key={step}>
        {step === 0 && (
          <SourcePicker selected={source} onSelect={pickSource} />
        )}

        {step === 1 && source && (
          <Card padding="lg">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[var(--text)]">
                Connect {sourceLabel}
              </h2>
              <button
                type="button"
                onClick={startOver}
                className="text-xs text-[var(--text-faint)] hover:text-[var(--text-dim)] transition-colors"
              >
                Change source
              </button>
            </div>
            <CredentialsForm
              source={source}
              form={form}
              onChange={setForm}
              onSubmit={handlePreview}
              loading={previewLoading}
              error={error}
            />
          </Card>
        )}

        {step === 2 && (
          <PreviewPanel
            preview={preview}
            sourceLabel={sourceLabel}
            onBack={() => { setError(null); setStep(1) }}
            onConfirm={handleImport}
            importing={importLoading}
          />
        )}

        {step === 3 && (
          <ResultPanel
            result={result}
            sourceLabel={sourceLabel}
            onViewBoard={() => navigate('/board')}
            onImportMore={startOver}
          />
        )}
      </Reveal>

      {step === 2 && error && (
        <p className="mt-4 text-sm text-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_10%,transparent)] border border-[color-mix(in_srgb,var(--bad)_25%,transparent)] rounded-[var(--radius-btn)] px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
