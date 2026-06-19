// Package api — enghealth.go
// REST handler for the Engineering Health dashboard. ONE endpoint:
//
//	GET /api/eng-health?from=&to=
//
// surfaces DORA-ish delivery, review health, bus-factor / truck-factor, and
// tech-debt hotspots — all COMPUTED from data gitstate already has (cycle_times,
// bug_introductions/SZZ, author_survival/blame, commit_files, pull_requests,
// involvement). No new external integrations.
//
// HONESTY CONTRACT: real deployment-frequency and MTTR need CI data gitstate
// doesn't ingest. We DO NOT fabricate them:
//   - deployFrequency is a clearly-marked merge-based PROXY (proxy:true + note).
//   - mttr is a placeholder marked needsCI:true with a null value.
//   - changeFailureRate IS real — it's derived from the SZZ bug_introductions
//     table — and is presented as the hero signal.
//
// Behind RequireAuth + OrgScope; every read runs in db.WithOrg so RLS enforces
// the org boundary (A2/S1). from/to default to the last 90 days.
package api

import (
	"log/slog"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
)

// RegisterEngHealthRoutes wires the Engineering Health endpoint onto mux behind
// RequireAuth + OrgScope. The single GET reads everything in one db.WithOrg tx.
func RegisterEngHealthRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {
	h := &engHealthHandlers{db: database}

	requireAuth := middleware.RequireAuth(cfg.Auth.JWTSigningKey)
	orgScope := middleware.OrgScope(database.Pool())
	auth := func(handler http.Handler) http.Handler {
		return requireAuth(orgScope(handler))
	}

	mux.Handle("GET /api/eng-health", auth(http.HandlerFunc(h.engHealth)))
}

type engHealthHandlers struct {
	db *db.DB
}

// ── Response shapes ─────────────────────────────────────────────────────────────

type engHealthResponse struct {
	Window    windowResp    `json:"window"`
	Dora      doraResp      `json:"dora"`
	Review    reviewResp    `json:"review"`
	BusFactor busFactorResp `json:"busFactor"`
	TechDebt  []debtResp    `json:"techDebt"`
	// HasDeepData is false when the git-analysis pipeline (SZZ/blame/commit_files)
	// hasn't run yet, so the frontend can show an honest "run analysis" hint
	// instead of pretending zeros are real.
	HasDeepData bool `json:"hasDeepData"`
}

type windowResp struct {
	From string `json:"from"`
	To   string `json:"to"`
	Days int    `json:"days"`
}

type doraResp struct {
	// Change failure rate — REAL, from SZZ. The hero stat.
	ChangeFailureRate  *float64      `json:"changeFailureRate"` // [0,1] or null (no merged PRs)
	ChangeFailureReal  bool          `json:"changeFailureReal"` // always true — derived from SZZ
	ChangeFailureNote  string        `json:"changeFailureNote"`
	MergedPRs          int           `json:"mergedPrs"`
	BugFixChanges      int           `json:"bugFixChanges"`
	BugFixLines        int           `json:"bugFixLines"`
	ChangeFailureTrend []cfPointResp `json:"changeFailureTrend"`

	// Lead time — REAL, from cycle_times / PR spans.
	LeadTimeP50Hours *float64        `json:"leadTimeP50Hours"`
	LeadTimeP90Hours *float64        `json:"leadTimeP90Hours"`
	LeadTimeTrend    []leadPointResp `json:"leadTimeTrend"`

	// Deploy frequency — REAL (deploys/week) when deployments exist, else a
	// clearly-marked merge-based PROXY.
	DeployFrequency proxyMetric `json:"deployFrequency"`

	// MTTR — REAL (mean incident resolution hours) when incidents exist, else an
	// honest needs-CI placeholder.
	MTTR needsCIMetric `json:"mttr"`

	// CI change-failure rate — REAL (failed deploys ÷ total deploys) when
	// deployments exist. Sits alongside the SZZ change-failure signal. Null when
	// no deployments.
	CIChangeFailureRate *float64 `json:"ciChangeFailureRate"`
	CIDeploys           int      `json:"ciDeploys"`
	CIDeployFailures    int      `json:"ciDeployFailures"`
	HasCIData           bool     `json:"hasCiData"`
}

type proxyMetric struct {
	Value *float64 `json:"value"` // deploys/week (real) or merges/week (proxy)
	Unit  string   `json:"unit"`
	Proxy bool     `json:"proxy"` // true = merge-based proxy; false = real CI deploys
	Real  bool     `json:"real"`  // true = backed by deployments table
	Note  string   `json:"note"`
}

type needsCIMetric struct {
	Value   *float64 `json:"value"` // real MTTR hours when incidents exist, else null
	Unit    string   `json:"unit"`
	NeedsCI bool     `json:"needsCI"` // true = honest placeholder (no incident data)
	Real    bool     `json:"real"`    // true = backed by incidents table
	Note    string   `json:"note"`
	Open    int      `json:"open"` // incidents still open in window (texture)
}

type cfPointResp struct {
	Week     string   `json:"week"`
	Merged   int      `json:"merged"`
	BugFixes int      `json:"bugFixes"`
	Rate     *float64 `json:"rate"` // bugFixes/merged for the week, or null
}

type leadPointResp struct {
	Week        string  `json:"week"`
	MedianHours float64 `json:"medianHours"`
	Count       int     `json:"count"`
}

type reviewResp struct {
	MedianReviewLatencyHours *float64           `json:"medianReviewLatencyHours"`
	MergedPRs                int                `json:"mergedPrs"`
	MergedWithoutReview      int                `json:"mergedWithoutReview"`
	WithoutReviewRate        *float64           `json:"withoutReviewRate"` // [0,1] or null
	WithoutReviewProxy       bool               `json:"withoutReviewProxy"`
	WithoutReviewNote        string             `json:"withoutReviewNote"`
	ReviewerLoad             []reviewerLoadResp `json:"reviewerLoad"`
}

type reviewerLoadResp struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	ReviewsDone int    `json:"reviewsDone"`
}

type busFactorResp struct {
	TruckFactor      int         `json:"truckFactor"`
	TotalSurviving   int         `json:"totalSurviving"`
	OwnerShare       []ownerResp `json:"ownerShare"`
	Areas            []areaResp  `json:"areas"`
	SingleOwnerAreas []areaResp  `json:"singleOwnerAreas"` // areas where one author owns ≥80%
	Note             string      `json:"note"`
}

type ownerResp struct {
	Author         string  `json:"author"`
	SurvivingLines int     `json:"survivingLines"`
	Share          float64 `json:"share"`
}

type areaResp struct {
	Area         string  `json:"area"`
	TopAuthor    string  `json:"topAuthor"`
	OwnershipPct float64 `json:"ownershipPct"`
	ContributorN int     `json:"contributorN"`
	TotalLines   int     `json:"totalLines"`
}

type debtResp struct {
	Path      string  `json:"path"`
	RiskScore float64 `json:"riskScore"` // 0..100 composite
	Churn     int     `json:"churn"`
	BugFixes  int     `json:"bugFixes"`
	BugLines  int     `json:"bugLines"`
	TestRatio float64 `json:"testRatio"`
	Authors   int     `json:"authors"`
	Why       string  `json:"why"`
}

// ── Handler ─────────────────────────────────────────────────────────────────────

func (h *engHealthHandlers) engHealth(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())

	now := time.Now().UTC()
	win := store.EngHealthWindow{From: now.AddDate(0, 0, -90), To: now}
	if s := r.URL.Query().Get("from"); s != "" {
		if t, ok := parseEngDate(s); ok {
			win.From = t
		}
	}
	if s := r.URL.Query().Get("to"); s != "" {
		if t, ok := parseEngDate(s); ok {
			win.To = t
		}
	}
	if !win.From.IsZero() && !win.To.IsZero() && win.To.Before(win.From) {
		win.From, win.To = win.To, win.From
	}

	var (
		lead     store.LeadTimeStats
		delivery store.DeliveryCounts
		ci       store.CIDelivery
		cfTrend  []store.ChangeFailurePoint
		review   store.ReviewHealth
		bus      store.BusFactor
		debt     []store.DebtHotspot
	)

	err := h.db.WithOrg(r.Context(), orgID, func(tx pgx.Tx) error {
		var e error
		if lead, e = store.LeadTimeSamples(r.Context(), tx, orgID, win); e != nil {
			return e
		}
		if delivery, e = store.DeliverySignals(r.Context(), tx, orgID, win); e != nil {
			return e
		}
		if ci, e = store.CIDeliverySignals(r.Context(), tx, orgID, win); e != nil {
			return e
		}
		if cfTrend, e = store.ChangeFailureTrend(r.Context(), tx, orgID, win); e != nil {
			return e
		}
		if review, e = store.ReviewSignals(r.Context(), tx, orgID, win); e != nil {
			return e
		}
		if bus, e = store.BusFactorAnalysis(r.Context(), tx, orgID, 2, 60); e != nil {
			return e
		}
		if debt, e = store.DebtHotspots(r.Context(), tx, orgID, win, 3, 60); e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		slog.Error("eng-health api error", "org_id", orgID, "err", err)
		writeError(w, http.StatusInternalServerError, "compute engineering health")
		return
	}

	resp := assembleEngHealth(win, lead, delivery, ci, cfTrend, review, bus, debt)
	writeJSON(w, http.StatusOK, resp)
}

// assembleEngHealth turns the raw store facts into the API response, deriving
// every rate / percentile / risk score in Go (kept pure for testability).
func assembleEngHealth(
	win store.EngHealthWindow,
	lead store.LeadTimeStats,
	delivery store.DeliveryCounts,
	ci store.CIDelivery,
	cfTrend []store.ChangeFailurePoint,
	review store.ReviewHealth,
	bus store.BusFactor,
	debt []store.DebtHotspot,
) engHealthResponse {
	days := delivery.WindowDays
	if days <= 0 && !win.From.IsZero() && !win.To.IsZero() {
		days = int(win.To.Sub(win.From).Hours()/24) + 1
	}

	resp := engHealthResponse{
		Window: windowResp{
			From: fmtEngTime(win.From),
			To:   fmtEngTime(win.To),
			Days: days,
		},
	}

	// ── DORA ──────────────────────────────────────────────────────────────────
	resp.Dora.MergedPRs = delivery.MergedPRs
	resp.Dora.BugFixChanges = delivery.BugFixes
	resp.Dora.BugFixLines = delivery.BugFixLines
	resp.Dora.ChangeFailureReal = true
	resp.Dora.ChangeFailureNote = "SZZ-derived: distinct bug-fix commits ÷ merged PRs in window."
	if delivery.MergedPRs > 0 {
		cfr := float64(delivery.BugFixes) / float64(delivery.MergedPRs)
		cfr = clamp01(cfr)
		resp.Dora.ChangeFailureRate = &cfr
	}

	for _, p := range cfTrend {
		var rate *float64
		if p.Merged > 0 {
			r := clamp01(float64(p.BugFixes) / float64(p.Merged))
			rate = &r
		}
		resp.Dora.ChangeFailureTrend = append(resp.Dora.ChangeFailureTrend, cfPointResp{
			Week: fmtEngDate(p.Week), Merged: p.Merged, BugFixes: p.BugFixes, Rate: rate,
		})
	}

	if len(lead.SampleHours) > 0 {
		p50 := store.Percentile(lead.SampleHours, 0.5)
		p90 := store.Percentile(lead.SampleHours, 0.9)
		resp.Dora.LeadTimeP50Hours = &p50
		resp.Dora.LeadTimeP90Hours = &p90
	}
	for _, p := range lead.Trend {
		resp.Dora.LeadTimeTrend = append(resp.Dora.LeadTimeTrend, leadPointResp{
			Week: fmtEngDate(p.Week), MedianHours: round1(p.MedianHours), Count: p.Count,
		})
	}

	// Deploy frequency — REAL when deployments exist, else merge-based PROXY.
	if ci.HasDeployments {
		resp.Dora.DeployFrequency = proxyMetric{
			Unit: "deploys/week",
			Real: true,
			Note: "real: deployments ingested via webhooks/CI in this window",
		}
		dDays := ci.WindowDays
		if dDays <= 0 {
			dDays = days
		}
		if dDays > 0 {
			perWeek := round1(float64(ci.Deploys) / (float64(dDays) / 7.0))
			resp.Dora.DeployFrequency.Value = &perWeek
		}
	} else {
		resp.Dora.DeployFrequency = proxyMetric{
			Unit:  "merges/week",
			Proxy: true,
			Note:  "merge-based proxy — connect CI for true deployment frequency",
		}
		if days > 0 && delivery.MergedPRs > 0 {
			perWeek := round1(float64(delivery.MergedPRs) / (float64(days) / 7.0))
			resp.Dora.DeployFrequency.Value = &perWeek
		} else if delivery.MergedPRs == 0 {
			zero := 0.0
			resp.Dora.DeployFrequency.Value = &zero
		}
	}

	// MTTR — REAL when incidents exist, else honest placeholder.
	if ci.HasIncidents {
		resp.Dora.MTTR = needsCIMetric{
			Unit: "hours",
			Real: true,
			Open: ci.IncidentsOpen,
			Note: "real: mean incident resolution time (resolved incidents in window)",
		}
		if ci.IncidentsResolved > 0 {
			mttr := round1(ci.MTTRHours)
			resp.Dora.MTTR.Value = &mttr
		}
	} else {
		resp.Dora.MTTR = needsCIMetric{
			Unit:    "hours",
			NeedsCI: true,
			Note:    "needs CI/incident data — record deployments/incidents for real MTTR",
		}
	}

	// CI change-failure rate — REAL (failed deploys ÷ total deploys) when present.
	if ci.HasDeployments {
		resp.Dora.HasCIData = true
		resp.Dora.CIDeploys = ci.Deploys
		resp.Dora.CIDeployFailures = ci.DeployFailures
		if ci.Deploys > 0 {
			r := clamp01(float64(ci.DeployFailures) / float64(ci.Deploys))
			resp.Dora.CIChangeFailureRate = &r
		}
	}

	// ── Review health ─────────────────────────────────────────────────────────
	resp.Review.MergedPRs = review.MergedPRs
	resp.Review.MergedWithoutReview = review.MergedWithoutReview
	if len(review.ReviewLatencySecs) > 0 {
		medSecs := store.Percentile(review.ReviewLatencySecs, 0.5)
		medHours := round1(medSecs / 3600.0)
		resp.Review.MedianReviewLatencyHours = &medHours
	}
	if review.MergedPRs > 0 {
		wr := clamp01(float64(review.MergedWithoutReview) / float64(review.MergedPRs))
		resp.Review.WithoutReviewRate = &wr
	}
	resp.Review.WithoutReviewProxy = true
	resp.Review.WithoutReviewNote = "proxy: merged PRs with no recorded review window (review_secs null/0)."
	for _, rl := range review.ReviewerLoad {
		resp.Review.ReviewerLoad = append(resp.Review.ReviewerLoad, reviewerLoadResp{
			Name: rl.Name, Email: rl.Email, ReviewsDone: rl.ReviewsDone,
		})
	}

	// ── Bus factor / truck factor ─────────────────────────────────────────────
	resp.BusFactor.TruckFactor = bus.TruckFactor
	resp.BusFactor.TotalSurviving = bus.TotalSurviving
	resp.BusFactor.Note = "truck-factor = fewest people who together own >50% of surviving (blame) code."
	for _, o := range bus.OwnerShare {
		resp.BusFactor.OwnerShare = append(resp.BusFactor.OwnerShare, ownerResp{
			Author: o.Author, SurvivingLines: o.SurvivingLines, Share: round3(o.Share),
		})
	}
	for _, a := range bus.Areas {
		ar := areaResp{
			Area:         a.Area,
			TopAuthor:    a.TopAuthor,
			OwnershipPct: round3(a.OwnershipPct),
			ContributorN: a.ContributorN,
			TotalLines:   a.TotalSurviving,
		}
		resp.BusFactor.Areas = append(resp.BusFactor.Areas, ar)
		// Single-owner risk: one author owns ≥80% AND not the only contributor-of-1
		// trivial case is still surfaced (a lone owner IS the risk).
		if a.OwnershipPct >= 0.8 {
			resp.BusFactor.SingleOwnerAreas = append(resp.BusFactor.SingleOwnerAreas, ar)
		}
	}

	// ── Tech debt hotspots ────────────────────────────────────────────────────
	// Composite risk: normalise churn (log), bug density, and (1 - testRatio).
	maxChurn := 0
	for _, d := range debt {
		if d.Churn > maxChurn {
			maxChurn = d.Churn
		}
	}
	hot := make([]debtResp, 0, len(debt))
	for _, d := range debt {
		score, why := debtRisk(d, maxChurn)
		hot = append(hot, debtResp{
			Path:      d.Path,
			RiskScore: round1(score),
			Churn:     d.Churn,
			BugFixes:  d.BugFixes,
			BugLines:  d.BugLines,
			TestRatio: round3(d.TestRatio),
			Authors:   d.Authors,
			Why:       why,
		})
	}
	// Final ranking by composite risk, take top 15.
	sortDebtByRisk(hot)
	if len(hot) > 15 {
		hot = hot[:15]
	}
	resp.TechDebt = hot

	resp.HasDeepData = bus.TotalSurviving > 0 || delivery.BugFixes > 0 || len(debt) > 0 ||
		ci.HasDeployments || ci.HasIncidents

	return resp
}

// debtRisk computes a 0..100 composite risk score and a human "why" string.
//
//	risk = 100 * (0.45*churnN + 0.40*bugN + 0.15*untestedN)
//
// where churnN = log-normalised churn, bugN = saturating bug-fix density, and
// untestedN = 1 - testRatio. Churn-only files score moderate; churn + bugs +
// no tests score high.
func debtRisk(d store.DebtHotspot, maxChurn int) (float64, string) {
	churnN := 0.0
	if maxChurn > 0 && d.Churn > 0 {
		churnN = math.Log1p(float64(d.Churn)) / math.Log1p(float64(maxChurn))
	}
	// Bug density saturates: 0 fixes → 0, 1 → ~0.5, 3+ → ~1.
	bugN := 1.0 - math.Exp(-0.7*float64(d.BugFixes))
	untestedN := 1.0 - clamp01(d.TestRatio)

	score := 100.0 * (0.45*churnN + 0.40*bugN + 0.15*untestedN)
	if score > 100 {
		score = 100
	}

	why := "high churn"
	switch {
	case d.BugFixes > 0 && d.TestRatio < 0.05:
		why = "churn-heavy, SZZ-implicated, and untested"
	case d.BugFixes > 0:
		why = "churn + SZZ bug history"
	case d.TestRatio < 0.05:
		why = "high churn with little/no test coupling"
	}
	return score, why
}

// ── small helpers ────────────────────────────────────────────────────────────

func sortDebtByRisk(d []debtResp) {
	// simple insertion-free sort via stdlib through a closure
	for i := 1; i < len(d); i++ {
		for j := i; j > 0 && less(d[j], d[j-1]); j-- {
			d[j], d[j-1] = d[j-1], d[j]
		}
	}
}

func less(a, b debtResp) bool {
	if a.RiskScore != b.RiskScore {
		return a.RiskScore > b.RiskScore
	}
	if a.Churn != b.Churn {
		return a.Churn > b.Churn
	}
	return a.Path < b.Path
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// round1 is provided by contribution.go (same package). round3 is local to the
// eng-health response (3-dp shares).
func round3(v float64) float64 { return math.Round(v*1000) / 1000 }

func parseEngDate(s string) (time.Time, bool) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.UTC(), true
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t.UTC(), true
	}
	return time.Time{}, false
}

func fmtEngTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func fmtEngDate(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format("2006-01-02")
}
