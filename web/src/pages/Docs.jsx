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
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react'
import { Markdown } from '../components/Markdown.jsx'
import { get } from '../lib/api.js'

// ── Icon mapping ──────────────────────────────────────────────────────────────

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
      if (level === 1) continue
      const text = m[2].trim()
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

function SidebarItem({ doc, isActive, index, onClick }) {
  const Icon = iconForDoc(doc, index)
  return (
    <Link
      to={`/docs/${doc.slug}`}
      onClick={onClick}
      className={[
        'group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
        isActive
          ? 'bg-[var(--bg-surface3)] text-[var(--text)] font-medium'
          : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-surface2)]',
      ].join(' ')}
    >
      {/* Active bar */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
          style={{ background: 'var(--brand-teal)' }}
        />
      )}
      <span
        className={[
          'flex items-center justify-center w-5 h-5 shrink-0 transition-colors duration-150',
          isActive ? 'text-[var(--brand-teal)]' : 'text-[var(--text-faint)] group-hover:text-[var(--text-muted)]',
        ].join(' ')}
      >
        {createElement(Icon, { size: 14, strokeWidth: 1.75 })}
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
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <a
      href={`#${heading.id}`}
      onClick={handleClick}
      className={[
        'block text-xs leading-snug transition-colors duration-150 py-1 border-l-2',
        heading.level === 3 ? 'pl-4' : 'pl-3',
        isActive
          ? 'text-[var(--brand-teal)] border-[var(--brand-teal)] font-medium'
          : 'text-[var(--text-faint)] border-[var(--border)] hover:text-[var(--text-muted)] hover:border-[var(--border2)]',
      ].join(' ')}
    >
      {heading.text}
    </a>
  )
}

// ── Skeleton loader ───────────────────────────────────────────────────────────

function ContentSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-2">
      <div className="h-9 bg-[var(--bg-surface3)] rounded-lg w-2/3" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-5/6" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-4/5" />
      <div className="h-5 bg-[var(--bg-surface3)] rounded-lg w-1/2 mt-10" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-full" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-3/4" />
      <div className="h-28 bg-[var(--bg-surface3)] rounded-xl mt-6" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-5/6 mt-6" />
      <div className="h-4 bg-[var(--bg-surface3)] rounded w-full" />
    </div>
  )
}

function SidebarSkeleton() {
  return (
    <div className="animate-pulse space-y-1 px-1">
      {[70, 90, 80, 65, 85, 75].map((w, i) => (
        <div key={i} className="h-8 bg-[var(--bg-surface3)] rounded-lg" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

// ── Sidebar (shared between desktop and mobile drawer) ───────────────────────

function SidebarNav({ docs, docsLoading, docsError, slug, onItemClick }) {
  return (
    <>
      {/* Label */}
      <div className="flex items-center gap-2 mb-4 px-1">
        <span className="flex items-center justify-center w-5 h-5 text-[var(--brand-teal)] opacity-70">
          <BookOpen size={13} strokeWidth={1.75} />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--text-faint)]">
          Documentation
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 scrollbar-none" aria-label="Documentation pages">
        {docsLoading ? (
          <SidebarSkeleton />
        ) : docsError ? (
          <p className="px-3 text-xs text-[var(--text-faint)]">Could not load docs index.</p>
        ) : (
          docs.map((d, i) => (
            <SidebarItem
              key={d.slug}
              doc={d}
              isActive={d.slug === slug}
              index={i}
              onClick={onItemClick}
            />
          ))
        )}
      </nav>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Docs() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [docs, setDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState(null)

  const [doc, setDoc] = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState(null)

  const [activeHeadingId, setActiveHeadingId] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)

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

  // ── Default redirect ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!slug && docs.length > 0) {
      navigate(`/docs/${docs[0].slug}`, { replace: true })
    }
  }, [slug, docs, navigate])

  // ── Fetch active doc ────────────────────────────────────────────────────────

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

  // ── ToC intersection observer ───────────────────────────────────────────────

  const setupObserver = useCallback(() => {
    if (observerRef.current) observerRef.current.disconnect()
    if (!contentRef.current) return
    const headingEls = contentRef.current.querySelectorAll('h1[id], h2[id], h3[id]')
    if (!headingEls.length) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible.length > 0) setActiveHeadingId(visible[0].target.id)
      },
      { rootMargin: '-10% 0px -80% 0px', threshold: 0 }
    )
    headingEls.forEach((el) => observerRef.current.observe(el))
  }, [])

  useEffect(() => {
    if (!doc) return
    const timer = setTimeout(setupObserver, 150)
    return () => {
      clearTimeout(timer)
      observerRef.current?.disconnect()
    }
  }, [doc, setupObserver])

  // ── Derived state ───────────────────────────────────────────────────────────

  const headings = extractHeadings(doc?.content ?? '')

  // ── Internal docs link interceptor ─────────────────────────────────────────

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

  // ── Prev / Next ─────────────────────────────────────────────────────────────

  const idx = docs.findIndex((d) => d.slug === slug)
  const prev = idx > 0 ? docs[idx - 1] : null
  const next = idx >= 0 && idx < docs.length - 1 ? docs[idx + 1] : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* ── Mobile drawer overlay ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer panel ────────────────────────────────────────────── */}
      <div
        className={[
          'fixed inset-y-0 left-0 z-50 w-72 flex flex-col px-4 pt-6 pb-8 md:hidden',
          'transition-transform duration-250 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)' }}
        aria-label="Docs navigation drawer"
      >
        {/* Close button */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs font-mono uppercase tracking-widest text-[var(--text-faint)]">Menu</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-surface2)] transition-colors"
            aria-label="Close navigation"
          >
            <X size={15} />
          </button>
        </div>
        <SidebarNav
          docs={docs}
          docsLoading={docsLoading}
          docsError={docsError}
          slug={slug}
          onItemClick={() => setMobileOpen(false)}
        />
      </div>

      {/* ── Page grid ─────────────────────────────────────────────────────── */}
      {/*
        Grid: [sidebar 220px] [content auto, max 760px] [toc 200px]
        The content column is not "flex-1" — it stays at a fixed reading width.
        The whole grid is centered inside a max-width shell.
      */}
      <div
        className="mx-auto px-4 sm:px-6"
        style={{ maxWidth: '1280px', minHeight: '100vh' }}
      >
        <div className="flex gap-0">

          {/* ── Left sidebar ────────────────────────────────────────────────── */}
          <aside
            className="hidden md:flex flex-col shrink-0 w-52 lg:w-60 xl:w-64"
            style={{
              position: 'sticky',
              top: '64px',        /* height of the marketing nav */
              height: 'calc(100vh - 64px)',
              paddingTop: '2.5rem',
              paddingBottom: '2rem',
              paddingRight: '1.5rem',
              overflowY: 'auto',
            }}
          >
            <SidebarNav
              docs={docs}
              docsLoading={docsLoading}
              docsError={docsError}
              slug={slug}
              onItemClick={null}
            />
          </aside>

          {/* ── Content column ──────────────────────────────────────────────── */}
          <main
            className="flex-1 min-w-0 py-10 md:py-12"
            style={{
              /* On md+ add horizontal padding; left padding also separates from sidebar */
              paddingLeft: 'clamp(1rem, 4vw, 3rem)',
              paddingRight: 'clamp(1rem, 4vw, 3rem)',
              /* Hairline border separating sidebar from content */
              borderLeft: 'none',
            }}
          >
            {/* Mobile header bar (hamburger + breadcrumb) */}
            <div className="flex items-center gap-3 mb-8 md:hidden">
              <button
                onClick={() => setMobileOpen(true)}
                className="flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border2)] transition-colors"
                aria-label="Open navigation"
              >
                <Menu size={15} />
              </button>
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
                <Link to="/docs" className="hover:text-[var(--text-muted)] transition-colors">Docs</Link>
                {doc && (
                  <>
                    <ChevronRight size={11} className="opacity-40" />
                    <span className="text-[var(--text-muted)] truncate">{doc.title}</span>
                  </>
                )}
              </div>
            </div>

            {/* ── Content ─────────────────────────────────────────────────── */}
            <div style={{ maxWidth: '760px' }}>

              {docLoading ? (
                <ContentSkeleton />
              ) : docError === 'not-found' ? (
                <div className="py-20 text-center">
                  <p
                    className="text-7xl font-mono font-bold mb-4 select-none"
                    style={{
                      background: 'linear-gradient(135deg, #2DD4BF 0%, #6366F1 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    404
                  </p>
                  <h1 className="text-xl font-semibold text-[var(--text)] mb-2 font-display">
                    Document not found
                  </h1>
                  <p className="text-sm text-[var(--text-muted)] mb-8">
                    This doc doesn&apos;t exist or was moved.
                  </p>
                  {docs.length > 0 && (
                    <Link
                      to={`/docs/${docs[0].slug}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-teal)] hover:underline"
                    >
                      <ArrowLeft size={14} />
                      Go to overview
                    </Link>
                  )}
                </div>
              ) : docError ? (
                <div className="py-12">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-6">
                    <p className="text-xs font-mono text-[var(--text-faint)] mb-1 uppercase tracking-widest">Error</p>
                    <p className="text-[var(--text-muted)] text-sm">{docError}</p>
                  </div>
                </div>
              ) : doc ? (
                <article ref={contentRef} onClick={handleContentClick}>

                  {/* Breadcrumb — desktop only (mobile has its own in header bar) */}
                  <div className="hidden md:flex items-center gap-1.5 mb-8 text-xs text-[var(--text-faint)]">
                    <Link to="/docs" className="hover:text-[var(--text-muted)] transition-colors">Docs</Link>
                    <ChevronRight size={11} className="opacity-40" />
                    <span className="text-[var(--text-muted)]">{doc.title}</span>
                  </div>

                  {/* Prose */}
                  <div className="docs-prose">
                    <Markdown>{doc.content}</Markdown>
                  </div>

                  {/* Divider */}
                  <hr className="my-12 border-t border-[var(--border)]" />

                  {/* Prev / Next */}
                  {(prev || next) && (
                    <nav className="grid grid-cols-2 gap-4" aria-label="Document navigation">
                      {prev ? (
                        <Link
                          to={`/docs/${prev.slug}`}
                          className="group flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 hover:border-[var(--border2)] hover:bg-[var(--bg-surface2)] transition-all duration-150"
                        >
                          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] group-hover:text-[var(--brand-teal)] transition-colors">
                            <ArrowLeft size={11} />
                            Previous
                          </span>
                          <span className="text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate">
                            {prev.title}
                          </span>
                        </Link>
                      ) : (
                        <div />
                      )}
                      {next ? (
                        <Link
                          to={`/docs/${next.slug}`}
                          className="group flex flex-col items-end gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-4 hover:border-[var(--border2)] hover:bg-[var(--bg-surface2)] transition-all duration-150 text-right"
                        >
                          <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--text-faint)] group-hover:text-[var(--brand-teal)] transition-colors">
                            Next
                            <ArrowRight size={11} />
                          </span>
                          <span className="text-sm font-medium text-[var(--text-muted)] group-hover:text-[var(--text)] transition-colors truncate">
                            {next.title}
                          </span>
                        </Link>
                      ) : (
                        <div />
                      )}
                    </nav>
                  )}
                </article>
              ) : null}
            </div>
          </main>

          {/* ── Right ToC ─────────────────────────────────────────────────── */}
          <aside
            className={['hidden xl:flex flex-col shrink-0 w-52', headings.length > 0 ? '' : 'pointer-events-none'].join(' ')}
            style={{
              position: 'sticky',
              top: '64px',
              height: 'calc(100vh - 64px)',
              paddingTop: '2.5rem',
              paddingBottom: '2rem',
              paddingLeft: '1.5rem',
              overflowY: 'auto',
            }}
          >
            {headings.length > 0 && (
              <>
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--text-faint)] mb-3">
                  On this page
                </p>
                <nav className="flex flex-col gap-0 scrollbar-none" aria-label="Table of contents">
                  {headings.map((h) => (
                    <TocItem key={h.id} heading={h} isActive={activeHeadingId === h.id} />
                  ))}
                </nav>
              </>
            )}
          </aside>

        </div>
      </div>
    </div>
  )
}
