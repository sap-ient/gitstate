// Package admin — cogs.go
// Server-rendered "Cloud COGS" super-admin page: reconciles ACTUAL month-to-date
// infra spend (Fly.io + Neon billing APIs, fetched concurrently with a short
// timeout and cached in-process) against the billsim PROJECTION and MRR to show
// the real gross margin and a clear "tracking the model?" verdict.
//
// This file adds METHODS on *adminHandlers only; the orchestrator wires the
// route (GET /admin/cogs, behind RequireAdminAuth/RequireSuperAdmin) in
// routes.go. It does not touch the adminHandlers struct, router.go, or main.go.
package admin

import (
	"context"
	"fmt"
	"html/template"
	"net/http"
	"sync"
	"time"

	"github.com/exo/gitstate/internal/cogs"
	"github.com/exo/gitstate/internal/store"
)

// ── In-process cache for actual billing figures ───────────────────────────────
//
// Billing APIs are slow and rate-limited, so we cache the fetched actuals for
// ~15 minutes. The cache is process-global (a handler value isn't a singleton
// across this method's lifetime in a meaningful way, but the package-level cache
// is) and guarded by a mutex.

type actualsCache struct {
	mu        sync.Mutex
	fetchedAt time.Time
	fly       sourceResult
	neon      sourceResult
}

// sourceResult captures one billing source's outcome for rendering.
type sourceResult struct {
	USD          float64
	Configured   bool
	Err          string // human-readable; never contains secrets
}

const actualsTTL = 15 * time.Minute

var cogsCache actualsCache

// fetchActuals returns the Fly + Neon month-to-date figures, fetching them
// concurrently (each behind a short timeout) and caching the result for
// actualsTTL. A failed/absent source never blocks the other or the page.
func (h *adminHandlers) fetchActuals(ctx context.Context) (fly, neon sourceResult) {
	cogsCache.mu.Lock()
	if !cogsCache.fetchedAt.IsZero() && time.Since(cogsCache.fetchedAt) < actualsTTL {
		fly, neon = cogsCache.fly, cogsCache.neon
		cogsCache.mu.Unlock()
		return fly, neon
	}
	cogsCache.mu.Unlock()

	flyClient := cogs.NewFlyClient(h.cfg.Admin.FlyAPIToken, h.cfg.Admin.FlyOrgSlug)
	neonClient := cogs.NewNeonClient(h.cfg.Admin.NeonAPIKey, h.cfg.Admin.NeonProjectID)

	// Bound the whole fetch independently of the request context so a slow
	// upstream can't hold the page open longer than this.
	fctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); fly = runSource(fctx, flyClient.Configured(), flyClient.MonthToDateUSD) }()
	go func() { defer wg.Done(); neon = runSource(fctx, neonClient.Configured(), neonClient.MonthToDateUSD) }()
	wg.Wait()

	cogsCache.mu.Lock()
	cogsCache.fetchedAt = time.Now()
	cogsCache.fly, cogsCache.neon = fly, neon
	cogsCache.mu.Unlock()

	return fly, neon
}

// runSource invokes a MonthToDateUSD function and classifies the outcome.
func runSource(ctx context.Context, configured bool, f func(context.Context) (float64, error)) sourceResult {
	if !configured {
		return sourceResult{Configured: false}
	}
	usd, err := f(ctx)
	if err != nil {
		return sourceResult{Configured: true, Err: err.Error()}
	}
	return sourceResult{Configured: true, USD: usd}
}

// ── Page data ─────────────────────────────────────────────────────────────────

type cogsData struct {
	baseData

	// Actuals
	Fly         sourceResult
	Neon        sourceResult
	ActualUSD   float64
	AnySource   bool // at least one configured source returned a figure

	// Projection
	Proj cogs.Projection

	// Inputs
	PaidOrgs int
	FreeOrgs int
	Builders int
	MRRUSD   float64

	// Reconciliation
	Rec cogs.Reconciliation

	// Setup hints when a source is unconfigured.
	FlyEnv  string
	NeonEnv string
}

// cogs renders the Cloud COGS dashboard. Method name: (*adminHandlers).cogs.
func (h *adminHandlers) cogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	data := cogsData{
		baseData: h.base(r, "cogs"),
		FlyEnv:   "FLY_API_TOKEN",
		NeonEnv:  "NEON_API_KEY",
	}

	// ── Live counts + MRR from the audited admin pool ──
	var stats *store.AdminStats
	if agg := h.aggPool(); agg != nil {
		stats, _ = store.GetAdminStats(ctx, agg)
		plans, _ := store.GetPlanDistribution(ctx, agg)
		for _, p := range plans {
			if p.PlanKey == "free" || p.PlanKey == "" {
				data.FreeOrgs += p.Count
			} else {
				data.PaidOrgs += p.Count
			}
		}
		h.auditCrossOrgView(ctx, r, "admin.cogs.view")
	}
	if stats == nil {
		stats = &store.AdminStats{}
	}
	// If plan distribution was unavailable, fall back to the org total as free.
	if data.PaidOrgs == 0 && data.FreeOrgs == 0 {
		data.FreeOrgs = stats.TotalOrgs
	}
	// Builders: total members across the instance is the best available proxy
	// for billable builders (users ≈ builders on an engineering tool).
	data.Builders = stats.TotalUsers
	data.MRRUSD = float64(stats.MRREstimateCents) / 100.0

	// ── Actuals (concurrent, cached, degrade gracefully) ──
	data.Fly, data.Neon = h.fetchActuals(ctx)
	if data.Fly.Configured && data.Fly.Err == "" {
		data.ActualUSD += data.Fly.USD
		data.AnySource = true
	}
	if data.Neon.Configured && data.Neon.Err == "" {
		data.ActualUSD += data.Neon.USD
		data.AnySource = true
	}

	// ── Projection ──
	data.Proj = cogs.Projected(cogs.ProjectionInput{
		PaidOrgs: data.PaidOrgs,
		FreeOrgs: data.FreeOrgs,
		Builders: data.Builders,
		// LLM usage isn't metered in admin stats yet; left at 0 → infra-only
		// projection. Wire managed-LLM usage here when available.
		LLMUsageUSD: 0,
	})

	// ── Reconciliation ──
	// Only meaningful when at least one actual source is live; otherwise the
	// page is projection-only and we still show MRR/projection.
	data.Rec = cogs.Reconcile(data.ActualUSD, data.Proj.Total, data.MRRUSD)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := cogsTmpl.ExecuteTemplate(w, "layout.html", data); err != nil {
		fmt.Fprintf(w, "\n<!-- template error: %s -->", err)
	}
}

// ── Template ──────────────────────────────────────────────────────────────────
//
// Parsed in its own set against the shared layout.html so its content/title/
// topbar blocks don't collide with the analytics/users/orgs sets in routes.go.

var cogsFuncMap = func() template.FuncMap {
	m := template.FuncMap{}
	for k, v := range funcMap {
		m[k] = v
	}
	m["usd"] = func(v float64) string { return fmt.Sprintf("%.2f", v) }
	m["pct"] = func(v float64) string { return fmt.Sprintf("%.1f", v) }
	m["signed"] = func(v float64) string {
		if v >= 0 {
			return fmt.Sprintf("+%.2f", v)
		}
		return fmt.Sprintf("%.2f", v)
	}
	return m
}()

var cogsTmpl = template.Must(
	template.New("").Funcs(cogsFuncMap).
		ParseFS(templateFS, "templates/layout.html", "templates/cogs.html"),
)
