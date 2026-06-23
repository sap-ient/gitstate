// Package store — reviews_deploy_test.go
// DB-backed tests for the LIVE-sync persistence the three dashboards depend on:
//
//   - UpsertPRReview must be IDEMPOTENT on (org_id, pr_id, reviewer_login,
//     submitted_at) so a re-sync of the same review does not double-count a
//     reviewer's "reviews done" texture (Involvement, decisions P2).
//   - InsertDeployment must be IDEMPOTENT on (org_id, source, external_id) so a
//     re-synced deployment does not inflate DORA deploy frequency; and
//     DeploymentStatsForWindow must read it back for the window.
//
// Reuses metricsTestTx (one tx, rolled back, RLS enforced under the app role).
package store

import (
	"fmt"
	"testing"
	"time"
)

func TestUpsertPRReviewIdempotent(t *testing.T) {
	ctx, tx, orgID := metricsTestTx(t)
	ns := time.Now().UnixNano()

	var repoID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/svc') RETURNING id`,
		orgID, fmt.Sprintf("rv-repo-%d", ns)).Scan(&repoID); err != nil {
		t.Fatalf("create repo: %v", err)
	}
	var prID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, author_login, state, created_at)
		 VALUES ($1,$2,'github',$3,1,'feat','dev','merged',now()) RETURNING id`,
		orgID, repoID, fmt.Sprintf("rv-pr-%d", ns)).Scan(&prID); err != nil {
		t.Fatalf("insert pr: %v", err)
	}

	submitted := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	in := PRReviewInput{
		OrgID: orgID, RepoID: repoID, PRID: prID,
		ReviewerLogin: "reviewer", State: "approved", ExternalID: "rv-1", SubmittedAt: submitted,
	}
	// Three syncs of the same review → still exactly one row.
	for i := 0; i < 3; i++ {
		if err := UpsertPRReview(ctx, tx, in); err != nil {
			t.Fatalf("upsert #%d: %v", i, err)
		}
	}
	reviews, err := ListPRReviewsForPR(ctx, tx, orgID, prID)
	if err != nil {
		t.Fatalf("list reviews: %v", err)
	}
	if len(reviews) != 1 {
		t.Fatalf("pr_reviews rows after 3 syncs = %d, want 1 (idempotent)", len(reviews))
	}
	if reviews[0].State != "approved" || reviews[0].ReviewerLogin != "reviewer" {
		t.Errorf("review = %+v, want approved/reviewer", reviews[0])
	}

	// A genuinely distinct review (different submitted_at) is a new row.
	in.SubmittedAt = submitted.Add(time.Hour)
	in.State = "commented"
	if err := UpsertPRReview(ctx, tx, in); err != nil {
		t.Fatalf("second review: %v", err)
	}
	reviews, _ = ListPRReviewsForPR(ctx, tx, orgID, prID)
	if len(reviews) != 2 {
		t.Fatalf("rows after distinct review = %d, want 2", len(reviews))
	}
}

func TestInsertDeploymentIdempotentAndDORA(t *testing.T) {
	ctx, tx, orgID := metricsTestTx(t)
	ns := time.Now().UnixNano()

	var repoID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/svc') RETURNING id`,
		orgID, fmt.Sprintf("dep-repo-%d", ns)).Scan(&repoID); err != nil {
		t.Fatalf("create repo: %v", err)
	}

	deployedAt := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	extID := fmt.Sprintf("dep-%d", ns)
	in := DeploymentInput{
		OrgID: orgID, RepoID: repoID, Environment: "production", Status: "success",
		SHA: "abc", Source: "github_actions", ExternalID: extID, DeployedAt: deployedAt,
	}
	// Re-sync the same deployment three times → still one row (ON CONFLICT).
	for i := 0; i < 3; i++ {
		if _, err := InsertDeployment(ctx, tx, in); err != nil {
			t.Fatalf("insert #%d: %v", i, err)
		}
	}
	// A second, distinct, FAILED deployment.
	in2 := in
	in2.ExternalID = extID + "-2"
	in2.Status = "failure"
	in2.DeployedAt = deployedAt.Add(time.Hour)
	if _, err := InsertDeployment(ctx, tx, in2); err != nil {
		t.Fatalf("insert failed deploy: %v", err)
	}

	from := deployedAt.Add(-24 * time.Hour)
	to := deployedAt.Add(24 * time.Hour)
	st, err := DeploymentStatsForWindow(ctx, tx, orgID, from, to)
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if st.Total != 2 {
		t.Errorf("DORA deploy total = %d, want 2 (idempotent re-sync did not inflate)", st.Total)
	}
	if st.Failures != 1 {
		t.Errorf("DORA failures = %d, want 1 (change-failure rate input)", st.Failures)
	}
}
