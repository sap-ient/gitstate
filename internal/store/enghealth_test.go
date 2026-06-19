// Package store — enghealth_test.go
// DB-backed test for the Engineering-Health DORA aggregates:
//   - LeadTimeSamples: per-merged-PR lead-time hours (cycle_times preferred,
//     PR-span fallback) → Go-side percentiles are sane.
//   - DeliverySignals: merged PRs (CF denominator + deploy proxy) and DISTINCT
//     SZZ bug-fix commits (CF numerator) in the window.
//   - CIDeliverySignals: real deploy frequency, CI change-failure, and MTTR from
//     deployments + incidents.
//
// One transaction, always rolled back. RLS enforced under the app role.
package store

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestEngHealthAggregates(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping enghealth integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	defer pool.Close()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire conn: %v", err)
	}
	defer conn.Release()

	tx, err := conn.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	ns := time.Now().UnixNano()
	var orgID, repoID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("eng-%d", ns), "Eng Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
		t.Fatalf("set org: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/svc') RETURNING id`,
		orgID, fmt.Sprintf("eng-repo-%d", ns)).Scan(&repoID); err != nil {
		t.Fatalf("create repo: %v", err)
	}

	w := EngHealthWindow{
		From: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
		To:   time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
	}
	mergedAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)

	// 3 merged PRs in-window; cycle_times give lead times 1h, 5h, 100h.
	leadSecs := []int64{3600, 18000, 360000}
	for i, secs := range leadSecs {
		var prID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, state, first_commit_at, merged_at, created_at)
			 VALUES ($1,$2,'github',$3,$4,'pr','merged',$5,$6,$5) RETURNING id`,
			orgID, repoID, fmt.Sprintf("eng-pr-%d-%d", i, ns), i+1, w.From, mergedAt).Scan(&prID); err != nil {
			t.Fatalf("insert pr %d: %v", i, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO cycle_times (org_id, pr_id, lead_time_secs, review_secs) VALUES ($1,$2,$3,$4)`,
			orgID, prID, secs, int64(1800)); err != nil {
			t.Fatalf("insert cycle_time %d: %v", i, err)
		}
	}

	// SZZ: 2 DISTINCT fix_sha detected in-window (one fix touches 2 introduced
	// commits → still 1 distinct fix). lines 4 + 6 + 2 = 12.
	szz := []struct {
		intro, fix string
		lines      int
	}{
		{"i1", "f1", 4},
		{"i2", "f1", 6}, // same fix_sha f1 → not a new distinct fix
		{"i3", "f2", 2},
	}
	for _, s := range szz {
		if _, err := tx.Exec(ctx,
			`INSERT INTO bug_introductions (org_id, repo_id, author_email, introduced_sha, fix_sha, lines, detected_at)
			 VALUES ($1,$2,'a@x.io',$3,$4,$5,$6)`,
			orgID, repoID, s.intro, s.fix, s.lines, mergedAt); err != nil {
			t.Fatalf("insert szz: %v", err)
		}
	}

	// ── LeadTimeSamples ──
	lt, err := LeadTimeSamples(ctx, tx, orgID, w)
	if err != nil {
		t.Fatalf("LeadTimeSamples: %v", err)
	}
	if len(lt.SampleHours) != 3 {
		t.Fatalf("lead-time samples = %d, want 3", len(lt.SampleHours))
	}
	// Samples in hours: 1, 5, 100. p50 (nearest-rank) = 5, p90 = 100.
	if p50 := Percentile(lt.SampleHours, 0.5); p50 != 5 {
		t.Errorf("lead-time p50 = %v, want 5", p50)
	}
	if p90 := Percentile(lt.SampleHours, 0.9); p90 != 100 {
		t.Errorf("lead-time p90 = %v, want 100", p90)
	}
	if len(lt.Trend) < 1 {
		t.Errorf("lead-time weekly trend empty, want >=1 bucket")
	}

	// ── DeliverySignals (SZZ change-failure inputs + deploy proxy) ──
	dc, err := DeliverySignals(ctx, tx, orgID, w)
	if err != nil {
		t.Fatalf("DeliverySignals: %v", err)
	}
	if dc.MergedPRs != 3 {
		t.Errorf("merged PRs = %d, want 3", dc.MergedPRs)
	}
	if dc.BugFixes != 2 {
		t.Errorf("distinct SZZ fixes = %d, want 2 (f1, f2)", dc.BugFixes)
	}
	if dc.BugFixLines != 12 {
		t.Errorf("SZZ bug-fix lines = %d, want 12", dc.BugFixLines)
	}
	// CF rate (SZZ) = 2/3.
	cfRate := float64(dc.BugFixes) / float64(dc.MergedPRs)
	if cfRate < 0.66 || cfRate > 0.67 {
		t.Errorf("SZZ change-failure rate = %.3f, want ~0.667", cfRate)
	}
	if dc.WindowDays < 28 || dc.WindowDays > 32 {
		t.Errorf("window days = %d, want ~31", dc.WindowDays)
	}

	// ── Deployments + incidents for the REAL CI signals ──
	// 5 deploys, 1 failure → CI change-failure = 1/5.
	depAt := time.Date(2026, 3, 5, 9, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		status := "success"
		if i == 0 {
			status = "failure"
		}
		if _, err := InsertDeployment(ctx, tx, DeploymentInput{
			OrgID: orgID, RepoID: repoID, Environment: "production",
			Status: status, Source: "manual",
			ExternalID: fmt.Sprintf("dep-%d-%d", i, ns),
			DeployedAt: depAt.Add(time.Duration(i) * time.Hour),
		}); err != nil {
			t.Fatalf("insert deployment %d: %v", i, err)
		}
	}
	// 2 incidents: one resolved after 2h, one still open.
	inc1, err := InsertIncident(ctx, tx, IncidentInput{OrgID: orgID, RepoID: repoID, Title: "down", Severity: "major", OpenedAt: depAt})
	if err != nil {
		t.Fatalf("insert incident 1: %v", err)
	}
	if _, err := ResolveIncident(ctx, tx, orgID, inc1.ID, depAt.Add(2*time.Hour)); err != nil {
		t.Fatalf("resolve incident 1: %v", err)
	}
	if _, err := InsertIncident(ctx, tx, IncidentInput{OrgID: orgID, RepoID: repoID, Title: "slow", Severity: "minor", OpenedAt: depAt.Add(time.Hour)}); err != nil {
		t.Fatalf("insert incident 2: %v", err)
	}

	ci, err := CIDeliverySignals(ctx, tx, orgID, w)
	if err != nil {
		t.Fatalf("CIDeliverySignals: %v", err)
	}
	if !ci.HasDeployments || ci.Deploys != 5 {
		t.Errorf("deploys = %d (has=%v), want 5/true", ci.Deploys, ci.HasDeployments)
	}
	if ci.DeployFailures != 1 {
		t.Errorf("deploy failures = %d, want 1", ci.DeployFailures)
	}
	ciCF := float64(ci.DeployFailures) / float64(ci.Deploys)
	if ciCF < 0.19 || ciCF > 0.21 {
		t.Errorf("CI change-failure rate = %.3f, want 0.2", ciCF)
	}
	// deploy frequency proxy: 5 deploys over ~31 days.
	if ci.WindowDays < 28 || ci.WindowDays > 32 {
		t.Errorf("CI window days = %d, want ~31", ci.WindowDays)
	}
	if !ci.HasIncidents || ci.IncidentsResolved != 1 || ci.IncidentsOpen != 1 {
		t.Errorf("incidents resolved/open = %d/%d, want 1/1", ci.IncidentsResolved, ci.IncidentsOpen)
	}
	// MTTR over the single resolved incident = 2h.
	if ci.MTTRHours < 1.99 || ci.MTTRHours > 2.01 {
		t.Errorf("MTTR = %.3f h, want 2.0", ci.MTTRHours)
	}

	t.Logf("enghealth OK: lead p50=%v p90=%v; SZZ CF=%d/%d; CI deploys=%d fail=%d MTTR=%.1fh",
		Percentile(lt.SampleHours, 0.5), Percentile(lt.SampleHours, 0.9),
		dc.BugFixes, dc.MergedPRs, ci.Deploys, ci.DeployFailures, ci.MTTRHours)
}
