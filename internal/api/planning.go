// Package api — planning.go
// Capacity-aware planning & forecasting: connects availability/leave (capacity),
// throughput (velocity), and sized backlog (effort estimates) into a single
// "what can we realistically ship by date X, and who is over-allocated or OOO?"
// answer.
//
// RegisterPlanningRoutes is wired by the orchestrator (router.go); this file does
// NOT edit router.go (route-wiring rule from PROGRESS.md). All reads run inside
// db.WithOrg so RLS enforces the org boundary.
package api

import (
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/exo/gitstate/internal/capacity"
	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5"
)

// Planning model constants.
const (
	// fallbackDifficulty is used for issues that have NO effort estimate, only
	// when the backlog also has no estimated issues to take a median from. It is
	// a deliberately honest "we don't know" sizing of a medium task (1–10 scale).
	fallbackDifficulty = 5.0

	// hoursPerDifficultyPoint converts an effort-estimate point (model-judged
	// difficulty, 1–10) into person-days of work. A "5" ≈ 5 person-days. This is
	// the single tunable assumption surfaced to the user in the forecast card.
	daysPerDifficultyPoint = 1.0

	// confidenceSpread is the ± fraction applied to velocity to form the optimistic
	// / pessimistic completion band (e.g. 0.25 → finish dates at 1.25× and 0.75×
	// the mean weekly rate).
	confidenceSpread = 0.25

	maxForecastWeeks = 260 // cap projection at ~5 years to avoid runaway dates
)

// RegisterPlanningRoutes wires the planning endpoint onto mux behind
// RequireAuth + OrgScope.
//
//	GET /api/planning?weeks=N&project=  → capacity timeline, velocity, forecast, warnings
func RegisterPlanningRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {
	h := &planningHandlers{db: database, cfg: cfg}
	requireAuth := middleware.RequireAuth(cfg.Auth.JWTSigningKey)
	orgScope := middleware.OrgScope(database.Pool())
	auth := func(next http.Handler) http.Handler { return requireAuth(orgScope(next)) }

	mux.Handle("GET /api/planning", auth(http.HandlerFunc(h.getPlanning)))
}

type planningHandlers struct {
	db  *db.DB
	cfg *config.Config
}

// ── Response shapes ───────────────────────────────────────────────────────────

type planningResponse struct {
	GeneratedAt string              `json:"generatedAt"`
	Weeks       int                 `json:"weeks"`
	ProjectID   string              `json:"projectId,omitempty"`
	Members     []planningMember    `json:"members"`
	Capacity    []weekCapacity      `json:"capacity"`
	Velocity    velocityReadout     `json:"velocity"`
	Backlog     backlogReadout      `json:"backlog"`
	Forecast    forecastReadout     `json:"forecast"`
	WhatFits    whatFitsReadout     `json:"whatFits"`
	Warnings    []planningWarning   `json:"warnings"`
	Assumptions planningAssumptions `json:"assumptions"`
}

type planningMember struct {
	UserID string `json:"userId"`
	Name   string `json:"name,omitempty"`
	Email  string `json:"email,omitempty"`
	Role   string `json:"role,omitempty"`
}

// memberWeek is one member's effective availability in one week.
type memberWeek struct {
	UserID        string  `json:"userId"`
	Name          string  `json:"name,omitempty"`
	AvailableDays float64 `json:"availableDays"` // raw working days available
	LeaveDays     float64 `json:"leaveDays"`     // working days lost to approved leave
	EffectiveDays float64 `json:"effectiveDays"` // available − leave (≥ 0)
	OnLeave       bool    `json:"onLeave"`       // any approved leave this week
	OOO           bool    `json:"ooo"`           // effectively unavailable all week
	OverAllocated bool    `json:"overAllocated"` // logged/assigned exceeds effective (heuristic)
}

// weekCapacity is the team-wide capacity for a single upcoming week.
type weekCapacity struct {
	WeekStart     string       `json:"weekStart"` // YYYY-MM-DD (Monday)
	WeekEnd       string       `json:"weekEnd"`   // YYYY-MM-DD (exclusive)
	AvailableDays float64      `json:"availableDays"`
	LeaveDays     float64      `json:"leaveDays"`
	EffectiveDays float64      `json:"effectiveDays"`
	OOOCount      int          `json:"oooCount"`
	Understaffed  bool         `json:"understaffed"` // effective well below the typical week
	Members       []memberWeek `json:"members"`
}

type velocityReadout struct {
	Points       []store.VelocityPoint `json:"points"`
	MeanPerWeek  float64               `json:"meanPerWeek"` // blended completed units / week
	MeanIssues   float64               `json:"meanIssues"`
	MeanPRs      float64               `json:"meanPRs"`
	TrendPerWeek float64               `json:"trendPerWeek"` // slope of completed units (least-squares)
	TrendLabel   string                `json:"trendLabel"`   // "accelerating" | "steady" | "slowing"
	SampleWeeks  int                   `json:"sampleWeeks"`
	HasData      bool                  `json:"hasData"`
}

type backlogReadout struct {
	OpenCount        int     `json:"openCount"`
	EstimatedCount   int     `json:"estimatedCount"`   // issues with a real effort estimate
	UnestimatedCount int     `json:"unestimatedCount"` // issues using the fallback
	TotalEffortDays  float64 `json:"totalEffortDays"`  // sized total remaining effort (person-days)
	MedianDifficulty float64 `json:"medianDifficulty"` // median over estimated issues (or fallback)
	UsedFallback     bool    `json:"usedFallback"`
}

type forecastReadout struct {
	Feasible        bool    `json:"feasible"`        // false when velocity is zero (cannot project)
	WeeksToComplete float64 `json:"weeksToComplete"` // expected, at mean velocity
	CompletionDate  string  `json:"completionDate"`  // YYYY-MM-DD, "" when not feasible
	OptimisticDate  string  `json:"optimisticDate"`  // at 1.25× velocity
	PessimisticDate string  `json:"pessimisticDate"` // at 0.75× velocity
	Summary         string  `json:"summary"`         // human "at this rate …" sentence
}

type whatFitsReadout struct {
	HorizonWeeks    int     `json:"horizonWeeks"`
	CapacityDays    float64 `json:"capacityDays"` // effective person-days over the horizon
	BacklogDays     float64 `json:"backlogDays"`  // sized remaining effort
	FitsDays        float64 `json:"fitsDays"`     // min(capacity, backlog) realistically landing
	FitsPct         float64 `json:"fitsPct"`      // share of backlog that fits in the horizon
	UnderstaffedWks int     `json:"understaffedWeeks"`
}

type planningWarning struct {
	Kind    string `json:"kind"`  // "over_allocation" | "ooo" | "understaffed" | "no_velocity" | "thin_data"
	Level   string `json:"level"` // "warn" | "info"
	UserID  string `json:"userId,omitempty"`
	Week    string `json:"week,omitempty"` // YYYY-MM-DD
	Message string `json:"message"`
}

type planningAssumptions struct {
	DaysPerDifficultyPoint float64 `json:"daysPerDifficultyPoint"`
	FallbackDifficulty     float64 `json:"fallbackDifficulty"`
	ConfidenceSpread       float64 `json:"confidenceSpread"`
	VelocityBasisWeeks     int     `json:"velocityBasisWeeks"`
	Notes                  string  `json:"notes"`
}

// ── Handler ───────────────────────────────────────────────────────────────────

// getPlanning handles GET /api/planning?weeks=N&project=.
func (h *planningHandlers) getPlanning(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())
	if orgID == "" {
		writeError(w, http.StatusBadRequest, "X-Org-ID header required")
		return
	}

	weeks := 8
	if v := r.URL.Query().Get("weeks"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 52 {
			weeks = n
		}
	}
	projectID := r.URL.Query().Get("project")

	// velocityBasis is how many trailing weeks of throughput inform the rate.
	const velocityBasis = 12

	var (
		members []*store.PlanningMember
		backlog []*store.BacklogIssue
		velPts  []store.VelocityPoint
	)

	err := h.db.WithOrg(r.Context(), orgID, func(tx pgx.Tx) error {
		var e error
		if members, e = store.ListPlanningMembers(r.Context(), tx, orgID); e != nil {
			return e
		}
		if backlog, e = store.OpenBacklog(r.Context(), tx, orgID, projectID); e != nil {
			return e
		}
		if velPts, e = store.WeeklyVelocity(r.Context(), tx, orgID, projectID, velocityBasis); e != nil {
			return e
		}
		return nil
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load planning data")
		return
	}

	memberIDs := make([]string, 0, len(members))
	nameByID := map[string]string{}
	respMembers := make([]planningMember, 0, len(members))
	for _, m := range members {
		memberIDs = append(memberIDs, m.UserID)
		nameByID[m.UserID] = displayName(m)
		respMembers = append(respMembers, planningMember{UserID: m.UserID, Name: m.Name, Email: m.Email, Role: m.Role})
	}

	// 1) Per-week capacity timeline (reuses capacity.EffectiveCapacity, which does
	//    availability − approved leave on working days). Hours → person-days /8.
	weekStarts := upcomingWeekStarts(time.Now().UTC(), weeks)
	capWeeks := make([]weekCapacity, 0, len(weekStarts))
	var warnings []planningWarning

	// Establish a "typical" effective-days baseline to flag leave-heavy weeks.
	weekEffective := make([]float64, 0, len(weekStarts))

	for _, ws := range weekStarts {
		we := ws.AddDate(0, 0, 7)
		period := capacity.Period{Start: ws, End: we}

		var caps []*capacity.MemberCapacity
		if len(memberIDs) > 0 {
			caps, err = capacity.EffectiveCapacity(r.Context(), h.db, orgID, period, memberIDs)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "could not compute weekly capacity")
				return
			}
		}

		wc := weekCapacity{
			WeekStart: ws.Format("2006-01-02"),
			WeekEnd:   we.Format("2006-01-02"),
			Members:   make([]memberWeek, 0, len(caps)),
		}
		for _, c := range caps {
			availDays := c.AvailableHours / 8.0
			leaveDays := c.ApprovedLeaveHours / 8.0
			effDays := c.EffectiveHours / 8.0
			onLeave := leaveDays > 0.01
			ooo := availDays > 0.01 && effDays < 0.01 // had capacity but it's all gone to leave
			mw := memberWeek{
				UserID:        c.UserID,
				Name:          nameByID[c.UserID],
				AvailableDays: plRound1(availDays),
				LeaveDays:     plRound1(leaveDays),
				EffectiveDays: plRound1(effDays),
				OnLeave:       onLeave,
				OOO:           ooo,
			}
			wc.Members = append(wc.Members, mw)
			wc.AvailableDays += availDays
			wc.LeaveDays += leaveDays
			wc.EffectiveDays += effDays
			if ooo {
				wc.OOOCount++
				warnings = append(warnings, planningWarning{
					Kind:    "ooo",
					Level:   "info",
					UserID:  c.UserID,
					Week:    wc.WeekStart,
					Message: nameByID[c.UserID] + " is fully out-of-office the week of " + wc.WeekStart,
				})
			}
		}
		wc.AvailableDays = plRound1(wc.AvailableDays)
		wc.LeaveDays = plRound1(wc.LeaveDays)
		wc.EffectiveDays = plRound1(wc.EffectiveDays)
		weekEffective = append(weekEffective, wc.EffectiveDays)
		capWeeks = append(capWeeks, wc)
	}

	// Flag understaffed weeks: effective person-days < 70% of the median week.
	medEff := median(weekEffective)
	understaffedCount := 0
	if medEff > 0 {
		for i := range capWeeks {
			if capWeeks[i].EffectiveDays < 0.7*medEff {
				capWeeks[i].Understaffed = true
				understaffedCount++
				warnings = append(warnings, planningWarning{
					Kind:    "understaffed",
					Level:   "warn",
					Week:    capWeeks[i].WeekStart,
					Message: "Week of " + capWeeks[i].WeekStart + " is leave-heavy — effective capacity is well below a normal week",
				})
			}
		}
	}

	// 2) Velocity readout from trailing throughput.
	vel := computeVelocity(velPts)

	// 3) Backlog sized by effort.
	back := sizeBacklog(backlog)

	// 4) Forecast: backlog effort ÷ velocity → completion band.
	fore := forecast(back, vel)

	// 5) What-fits: horizon capacity vs backlog.
	var horizonDays float64
	for _, wc := range capWeeks {
		horizonDays += wc.EffectiveDays
	}
	fits := whatFits(weeks, horizonDays, back.TotalEffortDays, understaffedCount)

	// Top-level warnings for forecast feasibility / thin data.
	if !vel.HasData {
		warnings = append(warnings, planningWarning{
			Kind:    "no_velocity",
			Level:   "warn",
			Message: "No recent merged PRs or closed issues — velocity is unknown, so completion dates can't be projected yet",
		})
	}
	if back.OpenCount > 0 && back.UnestimatedCount == back.OpenCount {
		warnings = append(warnings, planningWarning{
			Kind:    "thin_data",
			Level:   "info",
			Message: "No issues have effort estimates — backlog sizing uses a flat medium-task fallback and is approximate",
		})
	} else if back.UsedFallback {
		warnings = append(warnings, planningWarning{
			Kind:    "thin_data",
			Level:   "info",
			Message: strconvItoa(back.UnestimatedCount) + " of " + strconvItoa(back.OpenCount) + " issues lack an effort estimate — those use the median as a fallback",
		})
	}

	if warnings == nil {
		warnings = []planningWarning{}
	}

	resp := planningResponse{
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Weeks:       weeks,
		ProjectID:   projectID,
		Members:     respMembers,
		Capacity:    capWeeks,
		Velocity:    vel,
		Backlog:     back,
		Forecast:    fore,
		WhatFits:    fits,
		Warnings:    warnings,
		Assumptions: planningAssumptions{
			DaysPerDifficultyPoint: daysPerDifficultyPoint,
			FallbackDifficulty:     fallbackDifficulty,
			ConfidenceSpread:       confidenceSpread,
			VelocityBasisWeeks:     velocityBasis,
			Notes:                  "Velocity blends merged PRs and closed issues per week. Effort is sized from model-judged difficulty (1–10), 1 point ≈ 1 person-day. Capacity is availability minus approved leave on working days.",
		},
	}
	writeJSON(w, http.StatusOK, resp)
}

// ── Pure helpers (testable math) ──────────────────────────────────────────────

// upcomingWeekStarts returns n consecutive Monday-anchored week-start dates,
// beginning with the Monday of the week containing `now` (UTC, midnight).
func upcomingWeekStarts(now time.Time, n int) []time.Time {
	// ISO week starts Monday. Go: Sunday=0 … Saturday=6.
	wd := int(now.Weekday())
	if wd == 0 {
		wd = 7 // treat Sunday as day 7
	}
	monday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).
		AddDate(0, 0, -(wd - 1))
	out := make([]time.Time, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, monday.AddDate(0, 0, i*7))
	}
	return out
}

// completedUnits blends a velocity point into a single "units shipped" number.
// We take max(issues, prs) rather than a sum so the two truth-modes (native
// issues vs git PRs) don't double-count the same delivered work.
func completedUnits(p store.VelocityPoint) float64 {
	if p.Issues > p.PRs {
		return float64(p.Issues)
	}
	return float64(p.PRs)
}

func computeVelocity(pts []store.VelocityPoint) velocityReadout {
	out := velocityReadout{Points: pts, SampleWeeks: len(pts)}
	if out.Points == nil {
		out.Points = []store.VelocityPoint{}
	}
	if len(pts) == 0 {
		out.TrendLabel = "steady"
		return out
	}

	var sumUnits, sumIssues, sumPRs float64
	units := make([]float64, len(pts))
	for i, p := range pts {
		u := completedUnits(p)
		units[i] = u
		sumUnits += u
		sumIssues += float64(p.Issues)
		sumPRs += float64(p.PRs)
	}
	n := float64(len(pts))
	out.MeanPerWeek = plRound2(sumUnits / n)
	out.MeanIssues = plRound2(sumIssues / n)
	out.MeanPRs = plRound2(sumPRs / n)
	out.TrendPerWeek = plRound2(leastSquaresSlope(units))
	out.HasData = sumUnits > 0

	switch {
	case out.TrendPerWeek > 0.15:
		out.TrendLabel = "accelerating"
	case out.TrendPerWeek < -0.15:
		out.TrendLabel = "slowing"
	default:
		out.TrendLabel = "steady"
	}
	return out
}

// leastSquaresSlope fits y = a + b·x over x=0..n-1 and returns b (units/week).
func leastSquaresSlope(ys []float64) float64 {
	n := float64(len(ys))
	if n < 2 {
		return 0
	}
	var sx, sy, sxx, sxy float64
	for i, y := range ys {
		x := float64(i)
		sx += x
		sy += y
		sxx += x * x
		sxy += x * y
	}
	denom := n*sxx - sx*sx
	if denom == 0 {
		return 0
	}
	return (n*sxy - sx*sy) / denom
}

func sizeBacklog(issues []*store.BacklogIssue) backlogReadout {
	out := backlogReadout{OpenCount: len(issues)}
	if len(issues) == 0 {
		return out
	}

	// Median difficulty across issues that DO have an estimate → fallback basis.
	var estimated []float64
	for _, b := range issues {
		if b.Difficulty != nil && *b.Difficulty > 0 {
			estimated = append(estimated, *b.Difficulty)
		}
	}
	out.EstimatedCount = len(estimated)
	out.UnestimatedCount = out.OpenCount - out.EstimatedCount

	fallback := fallbackDifficulty
	if len(estimated) > 0 {
		fallback = median(estimated)
		out.MedianDifficulty = plRound2(fallback)
	} else {
		out.MedianDifficulty = fallbackDifficulty
	}
	out.UsedFallback = out.UnestimatedCount > 0

	var totalPoints float64
	for _, b := range issues {
		if b.Difficulty != nil && *b.Difficulty > 0 {
			totalPoints += *b.Difficulty
		} else {
			totalPoints += fallback
		}
	}
	out.TotalEffortDays = plRound1(totalPoints * daysPerDifficultyPoint)
	return out
}

func forecast(back backlogReadout, vel velocityReadout) forecastReadout {
	out := forecastReadout{}
	if back.OpenCount == 0 {
		out.Feasible = true
		out.WeeksToComplete = 0
		out.CompletionDate = time.Now().UTC().Format("2006-01-02")
		out.Summary = "Backlog is empty — nothing queued to ship."
		return out
	}
	// Convert mean weekly velocity (units/week) into person-days/week by sizing the
	// mean completed unit at the backlog's median difficulty. This keeps velocity
	// and effort in the same currency (person-days).
	unitDays := back.MedianDifficulty * daysPerDifficultyPoint
	if unitDays <= 0 {
		unitDays = fallbackDifficulty * daysPerDifficultyPoint
	}
	daysPerWeek := vel.MeanPerWeek * unitDays
	if daysPerWeek <= 0 {
		out.Feasible = false
		out.Summary = "Velocity is zero over the recent window, so a completion date can't be projected. Ship something to seed the forecast."
		return out
	}

	now := time.Now().UTC()
	expWeeks := back.TotalEffortDays / daysPerWeek
	out.Feasible = true
	out.WeeksToComplete = plRound1(clampWeeks(expWeeks))
	out.CompletionDate = addWeeks(now, expWeeks).Format("2006-01-02")
	// Optimistic = faster (more days/week), pessimistic = slower.
	out.OptimisticDate = addWeeks(now, back.TotalEffortDays/(daysPerWeek*(1+confidenceSpread))).Format("2006-01-02")
	out.PessimisticDate = addWeeks(now, back.TotalEffortDays/(daysPerWeek*(1-confidenceSpread))).Format("2006-01-02")
	out.Summary = "At the current rate (~" + trimFloat(vel.MeanPerWeek) + " items/week), the " +
		strconvItoa(back.OpenCount) + "-issue backlog finishes around " + out.CompletionDate + "."
	return out
}

func whatFits(weeks int, horizonDays, backlogDays float64, understaffed int) whatFitsReadout {
	out := whatFitsReadout{
		HorizonWeeks:    weeks,
		CapacityDays:    plRound1(horizonDays),
		BacklogDays:     plRound1(backlogDays),
		UnderstaffedWks: understaffed,
	}
	fits := horizonDays
	if backlogDays < fits {
		fits = backlogDays
	}
	out.FitsDays = plRound1(fits)
	if backlogDays > 0 {
		out.FitsPct = plRound1(math.Min(100, (fits/backlogDays)*100))
	} else {
		out.FitsPct = 100
	}
	return out
}

// ── small numeric / string utilities ──────────────────────────────────────────

func displayName(m *store.PlanningMember) string {
	if m.Name != "" {
		return m.Name
	}
	if m.Email != "" {
		return m.Email
	}
	return m.UserID
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	n := len(s)
	if n%2 == 1 {
		return s[n/2]
	}
	return (s[n/2-1] + s[n/2]) / 2
}

func clampWeeks(w float64) float64 {
	if w < 0 {
		return 0
	}
	if w > maxForecastWeeks {
		return maxForecastWeeks
	}
	return w
}

func addWeeks(t time.Time, weeks float64) time.Time {
	weeks = clampWeeks(weeks)
	days := int(math.Ceil(weeks * 7))
	return t.AddDate(0, 0, days)
}

func plRound1(f float64) float64 { return math.Round(f*10) / 10 }
func plRound2(f float64) float64 { return math.Round(f*100) / 100 }

func trimFloat(f float64) string {
	return strconv.FormatFloat(plRound1(f), 'f', -1, 64)
}

func strconvItoa(n int) string { return strconv.Itoa(n) }
