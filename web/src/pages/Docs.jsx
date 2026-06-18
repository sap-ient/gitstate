/**
 * Docs — in-app documentation experience.
 * Routes: /docs  and  /docs/:slug
 *
 * Reads slug from useParams(). Defaults to the first doc (overview) when
 * no slug is present. Renders markdown via the Markdown component.
 *
 * Orchestrator wraps this in MarketingLayout (nav/footer) — this file
 * owns only the docs chrome (sidebar + content + ToC).
 */
import { useState, useEffect, useRef, useCallback, createElement } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  BookOpen,
  Rocket,
  GitMerge,
  Receipt,
  Users,
  Settings,
  Plug,
  Terminal,
  FileText,
  Hash,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import { Markdown } from '../components/Markdown.jsx'
import { BrowserFrame } from '../components/ui'
import { get } from '../lib/api.js'

// ── Icon mapping ──────────────────────────────────────────────────────────────
// Picks a lucide icon for a doc by matching keywords in its slug/title.

const ICON_RULES = [
  [/(overview|intro|start|welcome|getting)/, Rocket],
  [/(state|board|git|status|workflow)/, GitMerge],
  [/(invoice|billing|payment|pricing)/, Receipt],
  [/(team|seat|member|stakeholder|people)/, Users],
  [/(connect|integration|github|gitlab|webhook|api)/, Plug],
  [/(cli|command|terminal)/, Terminal],
  [/(config|setting|admin)/, Settings],
]

function iconForDoc(doc, index) {
  const key = `${doc?.slug ?? ''} ${doc?.title ?? ''}`.toLowerCase()
  if (index === 0) return Rocket
  for (const [re, Icon] of ICON_RULES) {
    if (re.test(key)) return Icon
  }
  return FileText
}

// ── Heading extractor ─────────────────────────────────────────────────────────

/**
 * Parse headings from markdown text.
 * Returns [{ level, text, id }] for h2 and h3.
 */
function extractHeadings(markdown) {
  if (!markdown) return []
  const lines = markdown.split('\n')
  const headings = []
  let inFence = false

  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const m = line.match(/^(#{1,3})\s+(.+)$/)
    if (m) {
      const level = m[1].length
      if (level === 1) continue // skip h1 — it's the page title
      const text = m[2].trim()
      // rehype-slug generates ids from lowercased, space-to-dash, stripped special chars
      const id = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
      headings.push({ level, text, id })
    }
  }
  return headings
}

// ── Sidebar item ──────────────────────────────────────────────────────────────

function SidebarItem({ doc, isActive, index }) {
  const icon = iconForDoc(doc, index)
  return (
    <Link
      to={`/docs/${doc.slug}`}
      className={[
        'group relative flex items-center gap-2.5 pl-3.5 pr-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
        isActive
          ? 'bg-[var(--bg-surface2)] text-[var(--text)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface2)]/60',
      ].join(' ')}
    >
      {/* Active accent bar */}
      <span
        aria-hidden="true"
        className={[
          'absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-200',
          isActive ? 'h-5 opacity-100' : 'h-0 opacity-0',
        ].join(' ')}
        style={{ background: 'linear-gradient(to bottom, #2DD4BF, #6366F1)' }}
      />
      <span
        className={[
          'flex items-center justify-center w-6 h-6 rounded-md shrink-0 transition-colors duration-150',
          isActive
            ? 'bg-[var(--brand-teal)]/12 text-[var(--brand-teal)]'
            : 'bg-[var(--bg-surface3)]/50 text-[var(--text-faint)] group-hover:text-[var(--text-muted)]',
        ].join(' ')}
      >
        {createElement(icon, { size: 13, strokeWidth: 2 })}
      </span>
      <span className="truncate">{doc.title}</span>
    </Link>
  )
}

// ── ToC item ──────────────────────────────────────────────────────────────────

function TocItem({ heading, isActive }) {
  const handleClick = (e) => {
    e.preventDefault()
    const el = document.getElementById(heading.id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <a
      href={`#${heading.id}`}
      onClick={handleClick}
      className={[
        'group flex items-center gap-1.5 text-xs leading-relaxed transition-colors duration-150 py-1 border-l-2',
        heading.level === 3 ? 'pl-5' : 'pl-3',
        isActive
          ? 'text-[var(--brand-teal)] border-[var(--brand-teal)] font-medium'
          : 'text-[var(--text-faint)] border-transparent hover:text-[var(--text-muted)] hover:border-[var(--border2)]',
      ].join(' ')}
    >
      {heading.level === 2 && (
        <Hash
          size={10}
          strokeWidth={2.5}
          className={isActive ? 'text-[var(--brand-teal)]/70' : 'text-[var(--text-faint)]/40'}
        />
      )}
      <span className="truncate">{heading.text}</span>
    </a>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function ContentSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-2">
      <div className="h-8 bg-[var(--bg-surface3)] rounded-lg w-2/3" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-5/6" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-4/5" />
      <div className="h-6 bg-[var(--bg-surface3)] rounded-lg w-1/2 mt-8" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-3/4" />
      <div className="h-24 bg-[var(--bg-surface3)] rounded-xl mt-4" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-5/6 mt-4" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-full" />
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5 px-1">
      {[70, 90, 80, 65, 85].map((w, i) => (
        <div
          key={i}
          className="h-8 bg-[var(--bg-surface3)] rounded-lg"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Docs() {
  const { slug } = useParams()
  const navigate = useNavigate()

  // Doc list state
  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState(null)

  // Active doc content state
  const [doc, setDoc] = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState(null)

  // ToC active heading tracking
  const [activeHeadingId, setActiveHeadingId] = useState(null)
  const contentRef = useRef(null)
  const observerRef = useRef(null)

  // ── Fetch doc list ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await get('/api/docs')
        if (cancelled) return
        const sorted = [...(data ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        setDocs(sorted)
        setDocsLoading(false)
      } catch (err) {
        if (cancelled) return
        setDocsError(err.message ?? 'Failed to load docs')
        setDocsLoading(false)
      }
    }
    load()

    return () => { cancelled = true }
  }, [])

  // ── Default redirect to first doc ───────────────────────────────────────────

  useEffect(() => {
    if (!slug && docs.length > 0) {
      navigate(`/docs/${docs[0].slug}`, { replace: true })
    }
  }, [slug, docs, navigate])

  // ── Fetch active doc content ────────────────────────────────────────────────

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    const load = async () => {
      setDocLoading(true)
      try {
        const data = await get(`/api/docs/${slug}`)
        if (cancelled) return
        setDoc(data)
        setDocLoading(false)
        setDocError(null)
        setActiveHeadingId(null)
      } catch (err) {
        if (cancelled) return
        setDoc(null)
        setDocLoading(false)
        setDocError(err.status === 404 ? 'not-found' : (err.message ?? 'Failed to load document'))
      }
    }

    load()

    return () => { cancelled = true }
  }, [slug])

  // ── Intersection observer for ToC active state ──────────────────────────────

  const setupObserver = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect()
    }
    if (!contentRef.current) return

    const headingEls = contentRef.current.querySelectorAll('h1[id], h2[id], h3[id]')
    if (!headingEls.length) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible heading
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) {
          setActiveHeadingId(visible[0].target.id)
        }
      },
      {
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0,
      }
    )

    headingEls.forEach((el) => observerRef.current.observe(el))
  }, [])

  useEffect(() => {
    if (!doc) return
    // Let the DOM render the markdown first, then wire up the observer
    const timer = setTimeout(setupObserver, 150)
    return () => {
      clearTimeout(timer)
      observerRef.current?.disconnect()
    }
  }, [doc, setupObserver])

  // ── Derived state ───────────────────────────────────────────────────────────

  const headings = extractHeadings(doc?.content ?? '')

  // First doc in the (order-sorted) list is the overview — anchor it with a shot.
  const isOverview = docs.length > 0 && doc != null && docs[0].slug === slug

  // ── Internal docs link interceptor ─────────────────────────────────────────
  // Handles <a href="/docs/some-slug"> inside rendered markdown

  const handleContentClick = useCallback(
    (e) => {
      const anchor = e.target.closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      if (href.startsWith('/docs/')) {
        e.preventDefault()
        navigate(href)
      }
    },
    [navigate]
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--bg)' }}
    >
      {/* Subtle ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: [
            'radial-gradient(ellipse 60% 40% at 20% 10%, rgba(99,102,241,0.04) 0%, transparent 60%)',
            'radial-gradient(ellipse 50% 35% at 80% 90%, rgba(45,212,191,0.03) 0%, transparent 60%)',
          ].join(', '),
        }}
      />

      <div className="relative z-10 flex max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">

        {/* ── Left sidebar ──────────────────────────────────────────────────── */}
        <aside className="hidden md:flex flex-col shrink-0 w-56 lg:w-64 sticky top-0 self-start h-screen pt-10 pb-8 pr-6">
          {/* Section label */}
          <div className="mb-4 px-2 flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--brand-teal)]/12 text-[var(--brand-teal)]">
              <BookOpen size={13} strokeWidth={2} />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--text-faint)]">
              Documentation
            </span>
          </div>

          {/* Nav list */}
          <nav className="flex-1 overflow-y-auto space-y-0.5 scrollbar-none">
            {docsLoading ? (
              <SidebarSkeleton />
            ) : docsError ? (
              <p className="px-3 text-xs text-[var(--text-faint)]">
                Could not load docs index.
              </p>
            ) : (
              docs.map((d, i) => (
                <SidebarItem key={d.slug} doc={d} isActive={d.slug === slug} index={i} />
              ))
            )}
          </nav>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 py-10 px-0 md:px-8 lg:px-12">

          {/* Mobile doc selector */}
          <div className="md:hidden mb-6">
            <select
              value={slug ?? ''}
              onChange={(e) => navigate(`/docs/${e.target.value}`)}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text)] focus:outline-none focus:border-[var(--brand-teal)] transition-colors"
            >
              {docs.map((d) => (
                <option key={d.slug} value={d.slug}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>

          {/* Content area */}
          <div className="max-w-[720px]">
            {docLoading ? (
              <ContentSkeleton />
            ) : docError === 'not-found' ? (
              <div className="py-16 text-center">
                <p
                  className="text-6xl font-mono font-bold mb-4"
                  style={{
                    background: 'linear-gradient(135deg, #2DD4BF 0%, #6366F1 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  404
                </p>
                <h1 className="text-xl font-semibold text-[var(--text)] mb-2">
                  Document not found
                </h1>
                <p className="text-sm text-[var(--text-muted)] mb-8">
                  This doc doesn't exist or was moved.
                </p>
                {docs.length > 0 && (
                  <Link
                    to={`/docs/${docs[0].slug}`}
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--brand-teal)] hover:underline"
                  >
                    Go to overview
                  </Link>
                )}
              </div>
            ) : docError ? (
              <div className="py-12">
                <div
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6"
                >
                  <p className="text-sm font-mono text-[var(--text-faint)] mb-1">Error</p>
                  <p className="text-[var(--text-muted)] text-sm">{docError}</p>
                </div>
              </div>
            ) : doc ? (
              <article
                ref={contentRef}
                onClick={handleContentClick}
              >
                {/* Breadcrumb */}
                <div className="flex items-center gap-1.5 mb-5 text-xs font-mono text-[var(--text-faint)]">
                  <Link to="/docs" className="hover:text-[var(--text-muted)] transition-colors">
                    Docs
                  </Link>
                  <ChevronRight size={12} strokeWidth={2} className="opacity-50" />
                  <span className="text-[var(--text-muted)]">{doc.title}</span>
                </div>

                {/* Product screenshot banner — only on the overview (first) doc */}
                {isOverview && (
                  <div className="relative mb-8">
                    <div
                      className="absolute -inset-4 pointer-events-none z-0"
                      style={{
                        background:
                          'radial-gradient(ellipse 70% 60% at 50% 40%, rgba(45,212,191,0.07) 0%, transparent 70%)',
                      }}
                      aria-hidden="true"
                    />
                    <div className="relative z-10">
                      <BrowserFrame
                        src="/shots/dashboard.png"
                        alt="gitstate dashboard — work state derived from git"
                        url="app.gitstate.dev/dashboard"
                      />
                    </div>
                  </div>
                )}

                <div
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 mb-8"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}
                >
                  <Markdown>{doc.content}</Markdown>
                </div>

                {/* Prev / Next navigation */}
                {docs.length > 1 && (() => {
                  const idx = docs.findIndex((d) => d.slug === slug)
                  const prev = idx > 0 ? docs[idx - 1] : null
                  const next = idx < docs.length - 1 ? docs[idx + 1] : null
                  return (
                    <nav className="grid grid-cols-2 gap-4 pt-2">
                      {prev ? (
                        <Link
                          to={`/docs/${prev.slug}`}
                          className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3.5 hover:border-[var(--brand-teal)]/40 hover:bg-[var(--bg-surface2)] transition-all duration-150 min-w-0"
                        >
                          <ArrowLeft
                            size={16}
                            strokeWidth={2}
                            className="shrink-0 text-[var(--text-faint)] group-hover:text-[var(--brand-teal)] group-hover:-translate-x-0.5 transition-all"
                          />
                          <span className="flex flex-col items-start gap-0.5 min-w-0">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
                              Previous
                            </span>
                            <span className="text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate w-full">
                              {prev.title}
                            </span>
                          </span>
                        </Link>
                      ) : (
                        <div />
                      )}
                      {next ? (
                        <Link
                          to={`/docs/${next.slug}`}
                          className="group flex items-center justify-end gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3.5 hover:border-[var(--brand-teal)]/40 hover:bg-[var(--bg-surface2)] transition-all duration-150 min-w-0 text-right"
                        >
                          <span className="flex flex-col items-end gap-0.5 min-w-0">
                            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)]">
                              Next
                            </span>
                            <span className="text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate w-full">
                              {next.title}
                            </span>
                          </span>
                          <ArrowRight
                            size={16}
                            strokeWidth={2}
                            className="shrink-0 text-[var(--text-faint)] group-hover:text-[var(--brand-teal)] group-hover:translate-x-0.5 transition-all"
                          />
                        </Link>
                      ) : (
                        <div />
                      )}
                    </nav>
                  )
                })()}
              </article>
            ) : null}
          </div>
        </main>

        {/* ── Right ToC ─────────────────────────────────────────────────────── */}
        {headings.length > 0 && (
          <aside className="hidden xl:flex flex-col shrink-0 w-48 sticky top-0 self-start h-screen pt-10 pb-8 pl-6">
            <div className="mb-3">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--text-faint)]">
                On this page
              </span>
            </div>
            <nav className="flex-1 overflow-y-auto space-y-0.5 scrollbar-none">
              {headings.map((h) => (
                <TocItem key={h.id} heading={h} isActive={activeHeadingId === h.id} />
              ))}
            </nav>
          </aside>
        )}
      </div>
    </div>
  )
}
