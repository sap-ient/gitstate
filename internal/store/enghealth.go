// Package store — enghealth.go
// Org-scoped read-only aggregates that power the Engineering Health dashboard:
// DORA-ish delivery signals, review health, bus-factor / truck-factor, and
// tech-debt hotspots. Every metric is COMPUTED from data gitstate already has —
// cycle_times, bug_introductions (SZZ), author_survival (blame), commit_files
// (churn + test flag), pull_requests, and involvement. No new external
// integrations; where a true DORA metric needs CI data we don't have (deploy
// frequency, MTTR), we surface an HONEST merge-based proxy or a needs-CI marker.
//
// Every function MUST run inside db.WithOrg(ctx, orgID, …) so the org_isolation
// RLS policy is active. user-supplied bounds are always bind params ($N); the
// org_id is never interpolated into SQL.
//
// The marquee signal is CHANGE FAILURE RATE, computed from SZZ:
//
//	changeFailureRate = (# merged PRs whose merge commit / changes were later
//	                      implicated by a bug-fix via SZZ) / (# merged PRs)
//
// We approximate the numerator as the count of DISTINCT bug-fix commits
// (bug_introductions.fix_sha) detected in the window — each distinct fix marks a
// prior change that failed in production / had to be repaired. This is a real
// defect signal derived from blame, not a fabricated number.
package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// EngHealthWindow is the [From,To) window every aggregate is scoped to. A zero
// bound means "unbounded on that side"; the api layer defaults it.
type EngHealthWindow struct {
	From time.Time
	To   time.Time
}

// ── DORA-ish delivery ─────────────────────────────────────────────────────────

// LeadTimeStats holds lead-time samples (hours) for merged PRs in the window,
// plus a per-week trend bucket. Percentiles are derived in Go so they stay
// testable without a database.
type LeadTimeStats struct {
	SampleHours []float64       // one per merged PR with a usable lead time
	Trend       []LeadTimePoint // per-week median lead-time hours
}

// LeadTimePoint is one ISO-week bucket of median lead-time hours.
type LeadTimePoint struct {
	Week        time.Time `json:"week"`
	MedianHours float64   `json:"medianHours"`
	Count       int       `json:"count"`
}

// LeadTimeSamples reads lead-time-hours samples for merged PRs in the window,
// preferring the stored cycle_times.lead_time_secs and falling back to the PR's
// own (first_commit_at|created_at → merged_at) span. Also returns a per-week
// median trend. Must run inside db.WithOrg.
func LeadTimeSamples(ctx context.Context, tx pgx.Tx, orgID string, w EngHealthWindow) (LeadTimeStats, error) {
	var out LeadTimeStats

	// Raw samples: one row per merged PR. Prefer the freshest cycle_times row's
	// lead_time_secs; otherwise compute the span from the PR timestamps.
	sampleQ := `
		WITH ct_latest AS (
			SELECT DISTINCT ON (pr_id) pr_id, lead_time_secs
			FROM cycle_times
			WHERE org_id = $1 AND pr_id IS NOT NULL AND lead_time_secs IS NOT NULL
			ORDER BY pr_id, computed_at DESC
		)
		SELECT
			p.merged_at,
			COALESCE(
				ct.lead_time_secs,
				EXTRACT(EPOCH FROM (p.merged_at - COALESCE(p.first_commit_at, p.created_at)))
			) / 3600.0 AS lead_hours
		FROM pull_requests p
		LEFT JOIN ct_latest ct ON ct.pr_id = p.id
		WHERE p.org_id = $1
		  AND p.merged_at IS NOT NULL
		  AND p.merged_at >= COALESCE(p.first_commit_at, p.created_at)`
	args := []any{orgID}
	idx := 2
	if !w.From.IsZero() {
		sampleQ += fmt.Sprintf(" AND p.merged_at >= $%d", idx)
		args = append(args, w.From)
		idx++
	}
	if !w.To.IsZero() {
		sampleQ += fmt.Sprintf(" AND p.merged_at < $%d", idx)
		args = append(args, w.To)
		idx++ //nolint:ineffassign
	}
	sampleQ += " ORDER BY p.merged_at"

	rows, err := tx.Query(ctx, sampleQ, args...)
	if err != nil {
		return LeadTimeStats{}, fmt.Errorf("store.enghealth: lead-time samples: %w", err)
	}
	defer rows.Close()

	type wk struct {
		samples []float64
	}
	weeks := map[time.Time]*wk{}
	for rows.Next() {
		var mergedAt time.Time
		var hours float64
		if err := rows.Scan(&mergedAt, &hours); err != nil {
			return LeadTimeStats{}, fmt.Errorf("store.enghealth: scan lead-time sample: %w", err)
		}
		if hours < 0 {
			hours = 0
		}
		out.SampleHours = append(out.SampleHours, hours)
		wkStart := startOfISOWeek(mergedAt.UTC())
		b := weeks[wkStart]
		if b == nil {
			b = &wk{}
			weeks[wkStart] = b
		}
		b.samples = append(b.samples, hours)
	}
	if err := rows.Err(); err != nil {
		return LeadTimeStats{}, fmt.Errorf("store.enghealth: lead-time sample rows: %w", err)
	}

	// Build sorted weekly median trend.
	keys := make([]time.Time, 0, len(weeks))
	for k := range weeks {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].Before(keys[j]) })
	for _, k := range keys {
		s := weeks[k].samples
		out.Trend = append(out.Trend, LeadTimePoint{
			Week:        k,
			MedianHours: Percentile(s, 0.5),
			Count:       len(s),
		})
	}
	return out, nil
}

// DeliveryCounts holds the raw counts behind change-failure rate and the
// merge-based deploy-frequency proxy. Rates are derived in Go.
type DeliveryCounts struct {
	MergedPRs   int // merged PRs in the window (the change-failure denominator + deploy proxy)
	BugFixes    int // DISTINCT bug-fix commits (SZZ fix_sha) detected in the window
	BugFixLines int // total blamed lines across those fixes (severity texture)
	WindowDays  int // span of the window in days (for the per-week deploy proxy)
}

// DeliverySignals reads the counts behind the DORA-ish delivery metrics:
//   - merged PRs in the window (deploy-frequency proxy + change-failure denom),
//   - distinct SZZ bug-fix commits in the window (change-failure numerator),
//   - the total lines those fixes touched.
//
// The SZZ window filters on bug_introductions.detected_at. Must run inside
// db.WithOrg.
func DeliverySignals(ctx context.Context, tx pgx.Tx, orgID string, w EngHealthWindow) (DeliveryCounts, error) {
	var dc DeliveryCounts

	// Merged PRs in window (by merged_at).
	{
		q := `SELECT COUNT(*) FROM pull_requests p
		      WHERE p.org_id = $1 AND p.merged_at IS NOT NULL`
		args := []any{orgID}
		idx := 2
		if !w.From.IsZero() {
			q += fmt.Sprintf(" AND p.merged_at >= $%d", idx)
			args = append(args, w.From)
			idx++
		}
		if !w.To.IsZero() {
			q += fmt.Sprintf(" AND p.merged_at < $%d", idx)
			args = append(args, w.To)
			idx++ //nolint:ineffassign
		}
		if err := tx.QueryRow(ctx, q, args...).Scan(&dc.MergedPRs); err != nil {
			return DeliveryCounts{}, fmt.Errorf("store.enghealth: merged pr count: %w", err)
		}
	}

	// Distinct bug-fix commits + total blamed lines (SZZ), by detected_at.
	{
		q := `SELECT COUNT(DISTINCT fix_sha), COALESCE(SUM(lines),0)
		      FROM bug_introductions b
		      WHERE b.org_id = $1`
		args := []any{orgID}
		idx := 2
		if !w.From.IsZero() {
			q += fmt.Sprintf(" AND b.detected_at >= $%d", idx)
			args = append(args, w.From)
			idx++
		}
		if !w.To.IsZero() {
			q += fmt.Sprintf(" AND b.detected_at < $%d", idx)
			args = append(args, w.To)
			idx++ //nolint:ineffassign
		}
		var lines int64
		if err := tx.QueryRow(ctx, q, args...).Scan(&dc.BugFixes, &lines); err != nil {
			return DeliveryCounts{}, fmt.Errorf("store.enghealth: szz fix count: %w", err)
		}
		dc.BugFixLines = int(lines)
	}

	// Window span (days) for the deploy-frequency proxy. When unbounded, fall
	// back to the observed merged-PR span so the per-week rate is meaningful.
	if !w.From.IsZero() && !w.To.IsZero() {
		dc.WindowDays = int(w.To.Sub(w.From).Hours()/24) + 1
	}
	return dc, nil
}

// ChangeFailurePoint is one ISO-week bucket of the change-failure trend: merged
// PRs vs distinct SZZ bug-fixes detected that week.
type ChangeFailurePoint struct {
	Week     time.Time `json:"week"`
	Merged   int       `json:"merged"`
	BugFixes int       `json:"bugFixes"`
}

// ChangeFailureTrend returns a per-ISO-week series of merged-PR counts and
// distinct SZZ bug-fix counts so the frontend can chart change-failure over
// time. Both series are bucketed by their natural timestamp (merged_at /
// detected_at) and unioned by week. Must run inside db.WithOrg.
func ChangeFailureTrend(ctx context.Context, tx pgx.Tx, orgID string, w EngHealthWindow) ([]ChangeFailurePoint, error) {
	mergedByWeek := map[time.Time]int{}
	fixesByWeek := map[time.Time]int{}

	// Merged PRs per week.
	{
		q := `SELECT date_trunc('week', p.merged_at)::date, COUNT(*)
		      FROM pull_requests p
		      WHERE p.org_id = $1 AND p.merged_at IS NOT NULL`
		args, idx := []any{orgID}, 2
		q, args = appendWindow(q, args, &idx, "p.merged_at", w)
		q += " GROUP BY 1"
		if err := scanWeekCounts(ctx, tx, q, args, mergedByWeek, "merged-by-week"); err != nil {
			return nil, err
		}
	}
	// Distinct bug-fix commits per week.
	{
		q := `SELECT date_trunc('week', b.detected_at)::date, COUNT(DISTINCT b.fix_sha)
		      FROM bug_introductions b
		      WHERE b.org_id = $1`
		args, idx := []any{orgID}, 2
		q, args = appendWindow(q, args, &idx, "b.detected_at", w)
		q += " GROUP BY 1"
		if err := scanWeekCounts(ctx, tx, q, args, fixesByWeek, "fixes-by-week"); err != nil {
			return nil, err
		}
	}

	seen := map[time.Time]bool{}
	for k := range mergedByWeek {
		seen[k] = true
	}
	for k := range fixesByWeek {
		seen[k] = true
	}
	keys := make([]time.Time, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i].Before(keys[j]) })

	out := make([]ChangeFailurePoint, 0, len(keys))
	for _, k := range keys {
		out = append(out, ChangeFailurePoint{Week: k, Merged: mergedByWeek[k], BugFixes: fixesByWeek[k]})
	}
	return out, nil
}

// ── Real DORA CI signals (deployments + incidents) ─────────────────────────────

// CIDelivery bundles the REAL deploy-frequency / change-failure / MTTR inputs
// that only the deployments + incidents tables (fed by webhooks / manual entry /
// seed) can provide — the two DORA metrics git history alone cannot. When the
// org has no deployments/incidents in the window, HasDeployments / HasIncidents
// are false and the api layer keeps the honest merge-proxy / needs-CI tags.
type CIDelivery struct {
	HasDeployments    bool
	Deploys           int
	DeployFailures    int
	WindowDays        int
	HasIncidents      bool
	IncidentsResolved int
	IncidentsOpen     int
	MTTRHours         float64
}

// CIDeliverySignals reads the deployment + incident facts for the window. Must
// run inside db.WithOrg. Reuses the deployments/incidents store aggregates.
func CIDeliverySignals(ctx context.Context, tx pgx.Tx, orgID string, w EngHealthWindow) (CIDelivery, error) {
	var out CIDelivery

	ds, err := DeploymentStatsForWindow(ctx, tx, orgID, w.From, w.To)
	if err != nil {
		return CIDelivery{}, err
	}
	out.Deploys = ds.Total
	out.DeployFailures = ds.Failures
	out.WindowDays = ds.WindowDays
	out.HasDeployments = ds.Total > 0

	ms, err := MTTRForWindow(ctx, tx, orgID, w.From, w.To)
	if err != nil {
		return CIDelivery{}, err
	}
	out.IncidentsResolved = ms.ResolvedCount
	out.IncidentsOpen = ms.OpenCount
	out.MTTRHours = ms.MeanHours
	out.HasIncidents = ms.ResolvedCount > 0 || ms.OpenCount > 0

	return out, nil
}

// ── Review health ─────────────────────────────────────────────────────────────

// ReviewHealth holds the review-health signals derived from cycle_times and
// pull_requests. Latency samples are seconds; the median is derived in Go.
type ReviewHealth struct {
	ReviewLatencySecs   []float64      // review_secs samples for merged PRs in window
	MergedPRs           int            // merged PRs in window
	MergedWithoutReview int            // merged PRs with NULL/0 review_secs (proxy)
	ReviewerLoad        []ReviewerLoad // reviews_done per member (from involvement)
}

// ReviewerLoad is one member's review burden (PRs reviewed) over the window.
type ReviewerLoad struct {
	Name        string `json:"name"`
	Email       string `json:"email"`
	ReviewsDone int    `json:"reviewsDone"`
}

// ReviewSignals reads review-latency samples, the merged/without-review split,
// and the per-member reviewer-load distribution. Must run inside db.WithOrg.
func ReviewSignals(ctx context.Context, tx pgx.Tx, orgID string, w EngHealthWindow) (ReviewHealth, error) {
	var rh ReviewHealth

	// Per merged PR: its freshest review_secs (may be NULL → no recorded review).
	q := `
		WITH ct_latest AS (
			SELECT DISTINCT ON (pr_id) pr_id, review_secs
			FROM cycle_times
			WHERE org_id = $1 AND pr_id IS NOT NULL
			ORDER BY pr_id, computed_at DESC
		)
		SELECT ct.review_secs
		FROM pull_requests p
		LEFT JOIN ct_latest ct ON ct.pr_id = p.id
		WHERE p.org_id = $1 AND p.merged_at IS NOT NULL`
	args, idx := []any{orgID}, 2
	q, args = appendWindow(q, args, &idx, "p.merged_at", w)

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return ReviewHealth{}, fmt.Errorf("store.enghealth: review samples: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var secs *int64
		if err := rows.Scan(&secs); err != nil {
			return ReviewHealth{}, fmt.Errorf("store.enghealth: scan review sample: %w", err)
		}
		rh.MergedPRs++
		if secs == nil || *secs <= 0 {
			rh.MergedWithoutReview++
			continue
		}
		rh.ReviewLatencySecs = append(rh.ReviewLatencySecs, float64(*secs))
	}
	if err := rows.Err(); err != nil {
		return ReviewHealth{}, fmt.Errorf("store.enghealth: review sample rows: %w", err)
	}

	// Reviewer load: reviews_done summed per member over involvement periods in
	// the window. involvement.period_start is a date, so bound on it.
	{
		lq := `
			SELECT COALESCE(NULLIF(u.name,''), u.email::text) AS name,
			       COALESCE(u.email::text,'')                 AS email,
			       COALESCE(SUM(inv.reviews_done),0)          AS reviews
			FROM involvement inv
			JOIN users u ON u.id = inv.user_id
			WHERE inv.org_id = $1 AND inv.reviews_done > 0`
		largs, lidx := []any{orgID}, 2
		if !w.From.IsZero() {
			lq += fmt.Sprintf(" AND inv.period_start >= ($%d)::date", lidx)
			largs = append(largs, w.From)
			lidx++
		}
		if !w.To.IsZero() {
			lq += fmt.Sprintf(" AND inv.period_start < ($%d)::date", lidx)
			largs = append(largs, w.To)
			lidx++ //nolint:ineffassign
		}
		lq += " GROUP BY 1,2 ORDER BY reviews DESC"
		lrows, err := tx.Query(ctx, lq, largs...)
		if err != nil {
			return ReviewHealth{}, fmt.Errorf("store.enghealth: reviewer load: %w", err)
		}
		defer lrows.Close()
		for lrows.Next() {
			var rl ReviewerLoad
			if err := lrows.Scan(&rl.Name, &rl.Email, &rl.ReviewsDone); err != nil {
				return ReviewHealth{}, fmt.Errorf("store.enghealth: scan reviewer load: %w", err)
			}
			rh.ReviewerLoad = append(rh.ReviewerLoad, rl)
		}
		if err := lrows.Err(); err != nil {
			return ReviewHealth{}, fmt.Errorf("store.enghealth: reviewer load rows: %w", err)
		}
	}
	return rh, nil
}

// ── Bus-factor / truck-factor (from author_survival blame) ─────────────────────

// AreaOwnership is one code "area" (top path segment) with its dominant author
// by surviving lines and how concentrated ownership is.
type AreaOwnership struct {
	Area           string  `json:"area"`
	TopAuthor      string  `json:"topAuthor"`
	TopSurviving   int     `json:"topSurviving"`
	TotalSurviving int     `json:"totalSurviving"`
	OwnershipPct   float64 `json:"ownershipPct"` // topSurviving / totalSurviving, [0,1]
	ContributorN   int     `json:"contributorN"` // distinct authors with surviving lines here
}

// BusFactor bundles the org-wide truck-factor and the per-area ownership table.
type BusFactor struct {
	TruckFactor    int             // min #people who together own >50% of surviving code
	TotalSurviving int             // total surviving lines across the org
	OwnerShare     []OwnerShare    // each owner's surviving-line share, desc
	Areas          []AreaOwnership // per top-level area, dominant author
}

// OwnerShare is one author's share of all surviving lines in the org.
type OwnerShare struct {
	Author         string  `json:"author"`
	SurvivingLines int     `json:"survivingLines"`
	Share          float64 `json:"share"` // survivingLines / total, [0,1]
}

// BusFactorAnalysis computes the org truck-factor and per-area ownership from
// the author_survival (blame) table joined to commit_files (to map surviving
// authorship onto path areas). author_survival is per-(repo,author) and has no
// path, so per-area dominance is approximated from commit_files churn weighted
// by the author's org-wide survival ratio. Both tables are empty until the
// git-analysis pipeline runs; this degrades gracefully to a zero-truck-factor
// result. Must run inside db.WithOrg.
func BusFactorAnalysis(ctx context.Context, tx pgx.Tx, orgID string, areaDepth int, maxAreas int) (BusFactor, error) {
	if areaDepth < 1 {
		areaDepth = 1
	}
	var bf BusFactor

	// 1) Org-wide surviving lines per author (the truck-factor input).
	survByAuthor := map[string]int{}
	{
		const q = `
			SELECT lower(author_email::text) AS author,
			       COALESCE(SUM(surviving_lines),0)::bigint
			FROM author_survival
			WHERE org_id = $1 AND author_email IS NOT NULL AND author_email <> ''
			GROUP BY 1`
		rows, err := tx.Query(ctx, q, orgID)
		if err != nil {
			return BusFactor{}, fmt.Errorf("store.enghealth: surviving by author: %w", err)
		}
		for rows.Next() {
			var author string
			var surviving int64
			if err := rows.Scan(&author, &surviving); err != nil {
				rows.Close()
				return BusFactor{}, fmt.Errorf("store.enghealth: scan surviving by author: %w", err)
			}
			if author == "" || surviving <= 0 {
				continue
			}
			survByAuthor[author] += int(surviving)
			bf.TotalSurviving += int(surviving)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return BusFactor{}, fmt.Errorf("store.enghealth: surviving by author rows: %w", err)
		}
		rows.Close()
	}

	// Build the descending owner-share list + greedy truck-factor.
	type as struct {
		author    string
		surviving int
	}
	owners := make([]as, 0, len(survByAuthor))
	for a, s := range survByAuthor {
		owners = append(owners, as{a, s})
	}
	sort.Slice(owners, func(i, j int) bool {
		if owners[i].surviving != owners[j].surviving {
			return owners[i].surviving > owners[j].surviving
		}
		return owners[i].author < owners[j].author
	})
	if bf.TotalSurviving > 0 {
		acc := 0
		half := float64(bf.TotalSurviving) * 0.5
		for _, o := range owners {
			bf.OwnerShare = append(bf.OwnerShare, OwnerShare{
				Author:         o.author,
				SurvivingLines: o.surviving,
				Share:          float64(o.surviving) / float64(bf.TotalSurviving),
			})
			if float64(acc) <= half {
				bf.TruckFactor++
			}
			acc += o.surviving
		}
	}

	// 2) Per-area dominance. author_survival has no path; we use commit_files to
	// attribute surviving authorship onto top-level areas. For each area we sum,
	// per author, that author's churn (additions+deletions) × their org survival
	// ratio — an "effective surviving lines in this area" proxy. The dominant
	// author + concentration follow from that.
	survRatio := map[string]float64{} // author → surviving/authored across the org
	{
		const q = `
			SELECT lower(author_email::text) AS author,
			       COALESCE(SUM(surviving_lines),0)::float8,
			       COALESCE(SUM(authored_lines),0)::float8
			FROM author_survival
			WHERE org_id = $1 AND author_email IS NOT NULL AND author_email <> ''
			GROUP BY 1`
		rows, err := tx.Query(ctx, q, orgID)
		if err != nil {
			return BusFactor{}, fmt.Errorf("store.enghealth: survival ratio: %w", err)
		}
		for rows.Next() {
			var author string
			var surviving, authored float64
			if err := rows.Scan(&author, &surviving, &authored); err != nil {
				rows.Close()
				return BusFactor{}, fmt.Errorf("store.enghealth: scan survival ratio: %w", err)
			}
			r := 0.0
			if authored > 0 {
				r = surviving / authored
				if r > 1 {
					r = 1
				}
			}
			survRatio[author] = r
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return BusFactor{}, fmt.Errorf("store.enghealth: survival ratio rows: %w", err)
		}
		rows.Close()
	}

	// Per (area, author) churn from commit_files.
	type areaAcc struct {
		byAuthor map[string]float64
		total    float64
	}
	areas := map[string]*areaAcc{}
	{
		const q = `
			SELECT path, lower(author_email::text) AS author,
			       COALESCE(SUM(additions + deletions),0)::bigint
			FROM commit_files
			WHERE org_id = $1 AND author_email IS NOT NULL AND author_email <> '' AND path <> ''
			GROUP BY 1,2`
		rows, err := tx.Query(ctx, q, orgID)
		if err != nil {
			return BusFactor{}, fmt.Errorf("store.enghealth: area churn: %w", err)
		}
		for rows.Next() {
			var path, author string
			var churn int64
			if err := rows.Scan(&path, &author, &churn); err != nil {
				rows.Close()
				return BusFactor{}, fmt.Errorf("store.enghealth: scan area churn: %w", err)
			}
			area := topSegments(path, areaDepth)
			eff := float64(churn) * survRatioOr(survRatio, author, 1.0)
			if eff <= 0 {
				continue
			}
			a := areas[area]
			if a == nil {
				a = &areaAcc{byAuthor: map[string]float64{}}
				areas[area] = a
			}
			a.byAuthor[author] += eff
			a.total += eff
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return BusFactor{}, fmt.Errorf("store.enghealth: area churn rows: %w", err)
		}
		rows.Close()
	}

	for area, acc := range areas {
		if acc.total <= 0 {
			continue
		}
		topAuthor, topEff := "", 0.0
		for author, eff := range acc.byAuthor {
			if eff > topEff || (eff == topEff && author < topAuthor) {
				topAuthor, topEff = author, eff
			}
		}
		bf.Areas = append(bf.Areas, AreaOwnership{
			Area:           area,
			TopAuthor:      topAuthor,
			TopSurviving:   int(topEff),
			TotalSurviving: int(acc.total),
			OwnershipPct:   topEff / acc.total,
			ContributorN:   len(acc.byAuthor),
		})
	}
	// Order by single-owner risk: highest concentration first, then size.
	sort.Slice(bf.Areas, func(i, j int) bool {
		if bf.Areas[i].OwnershipPct != bf.Areas[j].OwnershipPct {
			return bf.Areas[i].OwnershipPct > bf.Areas[j].OwnershipPct
		}
		if bf.Areas[i].TotalSurviving != bf.Areas[j].TotalSurviving {
			return bf.Areas[i].TotalSurviving > bf.Areas[j].TotalSurviving
		}
		return bf.Areas[i].Area < bf.Areas[j].Area
	})
	if maxAreas > 0 && len(bf.Areas) > maxAreas {
		bf.Areas = bf.Areas[:maxAreas]
	}
	return bf, nil
}

// ── Tech-debt hotspots ─────────────────────────────────────────────────────────

// DebtHotspot is one risky file/dir: high churn × SZZ bug density × low test
// coupling. The riskScore + reasons are derived in the api layer; the store
// returns the raw measured inputs.
type DebtHotspot struct {
	Path        string  `json:"path"`
	Churn       int     `json:"churn"`       // additions + deletions across the window
	Touches     int     `json:"touches"`     // (commit,file) rows
	TestTouches int     `json:"testTouches"` // touches flagged is_test
	TestRatio   float64 `json:"testRatio"`   // testTouches/touches, [0,1]
	BugFixes    int     `json:"bugFixes"`    // distinct SZZ fix_sha implicating commits that touched this path
	BugLines    int     `json:"bugLines"`    // total blamed lines on this path
	Authors     int     `json:"authors"`     // distinct authors (bus-factor texture)
}

// DebtHotspots returns the top churn-heavy paths in the window joined to their
// SZZ bug density (via commits that touched the path and were later implicated
// as bug-introducing) and their test coupling. Path is bucketed to `depth`
// segments so "files/dirs" granularity is tunable. The candidate set is the top
// `limit` paths by churn; risk scoring happens in the api layer. Must run inside
// db.WithOrg.
func DebtHotspots(ctx context.Context, tx pgx.Tx, orgID string, w EngHealthWindow, depth, limit int) ([]DebtHotspot, error) {
	if depth < 1 {
		depth = 3
	}
	if limit < 1 {
		limit = 50
	}

	// 1) Churn + touches + test coupling + authors per full path in the window.
	type pacc struct {
		churn, touches, testTouches, bugLines int
		authors                               map[string]bool
		bugFixes                              map[string]bool
	}
	byArea := map[string]*pacc{}
	getArea := func(p string) *pacc {
		a := byArea[p]
		if a == nil {
			a = &pacc{authors: map[string]bool{}, bugFixes: map[string]bool{}}
			byArea[p] = a
		}
		return a
	}

	{
		q := `
			SELECT path,
			       COALESCE(SUM(additions + deletions),0)::bigint AS churn,
			       COUNT(*)::bigint                               AS touches,
			       COUNT(*) FILTER (WHERE is_test)::bigint        AS test_touches,
			       COUNT(DISTINCT lower(author_email::text))      AS authors
			FROM commit_files
			WHERE org_id = $1 AND path <> ''`
		args, idx := []any{orgID}, 2
		q, args = appendWindow(q, args, &idx, "committed_at", w)
		q += " GROUP BY 1"
		rows, err := tx.Query(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("store.enghealth: debt churn: %w", err)
		}
		for rows.Next() {
			var path string
			var churn, touches, testTouches, authors int64
			if err := rows.Scan(&path, &churn, &touches, &testTouches, &authors); err != nil {
				rows.Close()
				return nil, fmt.Errorf("store.enghealth: scan debt churn: %w", err)
			}
			area := topSegments(path, depth)
			a := getArea(area)
			a.churn += int(churn)
			a.touches += int(touches)
			a.testTouches += int(testTouches)
			// authors is per full-path here; approximate area authors by max.
			if int(authors) > len(a.authors) {
				// store as sentinel keys so len() reflects the max distinct seen
				for i := len(a.authors); i < int(authors); i++ {
					a.authors[fmt.Sprintf("~%s~%d", path, i)] = true
				}
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, fmt.Errorf("store.enghealth: debt churn rows: %w", err)
		}
		rows.Close()
	}

	// 2) SZZ bug density per area: distinct fix_sha + total lines for
	// bug-introducing commits whose touched files fall under the area. We map
	// bug_introductions.introduced_sha → commit_files.path to get the area.
	{
		q := `
			SELECT cf.path, b.fix_sha, b.lines
			FROM bug_introductions b
			JOIN commit_files cf
			  ON cf.org_id = b.org_id
			 AND cf.commit_sha = b.introduced_sha
			WHERE b.org_id = $1 AND cf.path <> ''`
		args, idx := []any{orgID}, 2
		q, args = appendWindow(q, args, &idx, "b.detected_at", w)
		rows, err := tx.Query(ctx, q, args...)
		if err != nil {
			return nil, fmt.Errorf("store.enghealth: debt szz: %w", err)
		}
		for rows.Next() {
			var path, fixSha string
			var lines int
			if err := rows.Scan(&path, &fixSha, &lines); err != nil {
				rows.Close()
				return nil, fmt.Errorf("store.enghealth: scan debt szz: %w", err)
			}
			area := topSegments(path, depth)
			a := byArea[area]
			if a == nil {
				continue // only annotate paths that appear in the churn set
			}
			a.bugFixes[fixSha] = true
			a.bugLines += lines
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, fmt.Errorf("store.enghealth: debt szz rows: %w", err)
		}
		rows.Close()
	}

	out := make([]DebtHotspot, 0, len(byArea))
	for area, a := range byArea {
		ratio := 0.0
		if a.touches > 0 {
			ratio = float64(a.testTouches) / float64(a.touches)
		}
		out = append(out, DebtHotspot{
			Path:        area,
			Churn:       a.churn,
			Touches:     a.touches,
			TestTouches: a.testTouches,
			TestRatio:   ratio,
			BugFixes:    len(a.bugFixes),
			BugLines:    a.bugLines,
			Authors:     len(a.authors),
		})
	}
	// Rank by churn first (candidate set), trimmed to limit; final risk ranking
	// is done in the api layer once the composite score is computed.
	sort.Slice(out, func(i, j int) bool {
		if out[i].Churn != out[j].Churn {
			return out[i].Churn > out[j].Churn
		}
		return out[i].Path < out[j].Path
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

// Percentile returns the p-quantile (0..1) of xs using nearest-rank on a copy
// of the (unsorted) input. Returns 0 for an empty slice. Exported so the api
// layer can derive p50/p90 from the raw samples without re-querying.
func Percentile(xs []float64, p float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := append([]float64(nil), xs...)
	sort.Float64s(s)
	if p <= 0 {
		return s[0]
	}
	if p >= 1 {
		return s[len(s)-1]
	}
	idx := int(p*float64(len(s)-1) + 0.5)
	if idx < 0 {
		idx = 0
	}
	if idx >= len(s) {
		idx = len(s) - 1
	}
	return s[idx]
}

// topSegments returns the first `depth` path segments joined by '/', i.e. the
// "area" a file belongs to. A file shallower than depth returns its full path.
func topSegments(path string, depth int) string {
	path = strings.TrimLeft(strings.TrimSpace(path), "/")
	if path == "" {
		return "(root)"
	}
	parts := strings.Split(path, "/")
	if len(parts) <= depth {
		return strings.Join(parts, "/")
	}
	return strings.Join(parts[:depth], "/")
}

func survRatioOr(m map[string]float64, k string, dflt float64) float64 {
	if v, ok := m[k]; ok {
		return v
	}
	return dflt
}

// startOfISOWeek truncates t to the Monday 00:00 UTC of its ISO week.
func startOfISOWeek(t time.Time) time.Time {
	t = t.UTC().Truncate(24 * time.Hour)
	// Go's Weekday: Sunday=0..Saturday=6; ISO week starts Monday.
	wd := int(t.Weekday())
	if wd == 0 {
		wd = 7
	}
	return t.AddDate(0, 0, -(wd - 1))
}

// appendWindow appends inclusive-lower / exclusive-upper window predicates on
// the given timestamp column, advancing *idx. Returns the new query + args.
func appendWindow(q string, args []any, idx *int, col string, w EngHealthWindow) (string, []any) {
	if !w.From.IsZero() {
		q += fmt.Sprintf(" AND %s >= $%d", col, *idx)
		args = append(args, w.From)
		*idx++
	}
	if !w.To.IsZero() {
		q += fmt.Sprintf(" AND %s < $%d", col, *idx)
		args = append(args, w.To)
		*idx++
	}
	return q, args
}

// scanWeekCounts runs q (which must SELECT a week-date and an int count) and
// folds results into dst keyed by the week. label is used in error messages.
func scanWeekCounts(ctx context.Context, tx pgx.Tx, q string, args []any, dst map[time.Time]int, label string) error {
	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("store.enghealth: %s: %w", label, err)
	}
	defer rows.Close()
	for rows.Next() {
		var wk time.Time
		var n int
		if err := rows.Scan(&wk, &n); err != nil {
			return fmt.Errorf("store.enghealth: scan %s: %w", label, err)
		}
		dst[wk.UTC()] = n
	}
	return rows.Err()
}
