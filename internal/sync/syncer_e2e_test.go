// Package sync — end-to-end SyncRepo test with a fake Provider. Exercises the
// full post-sync pipeline against a real database: issue/PR upsert (the
// transaction-local set_config RLS path), derived-state auto-progress from a
// merged PR's issue reference, last_synced_at update, the post-sync metrics
// recompute, and the embedding pass. The point is to prove the steps after the
// platform pull actually RUN and land their side effects (the class of bug
// where a sync "succeeds" but writes nothing).
package sync

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/metrics"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5"
)

// fakeProvider returns canned remote data so SyncRepo runs without network.
type fakeProvider struct {
	issues  []RemoteIssue
	prs     []RemotePR
	reviews map[int][]RemoteReview // keyed by PR number
	deploys []RemoteDeployment
	commits []RemoteCommit

	// commitsSince records the `since` passed to ListCommits so the test can
	// assert the incremental wiring (SyncRepo passes repo.LastSyncedAt).
	commitsSinceCalled bool
	commitsSince       time.Time

	// commitsErr, when set, makes ListCommits fail (simulating a fetch that errored
	// after all retries). SyncRepo must then NOT advance last_synced_at.
	commitsErr error
}

func (f *fakeProvider) Platform() string { return "github" }
func (f *fakeProvider) ListRepos(context.Context) ([]RemoteRepo, error) {
	return nil, nil
}
func (f *fakeProvider) ListIssues(context.Context, string) ([]RemoteIssue, error) {
	return f.issues, nil
}
func (f *fakeProvider) ListPullRequests(context.Context, string) ([]RemotePR, error) {
	return f.prs, nil
}
func (f *fakeProvider) ListReviews(_ context.Context, _ string, prNumber int) ([]RemoteReview, error) {
	return f.reviews[prNumber], nil
}
func (f *fakeProvider) ListDeployments(context.Context, string) ([]RemoteDeployment, error) {
	return f.deploys, nil
}
func (f *fakeProvider) ListCommits(_ context.Context, _ string, since time.Time) ([]RemoteCommit, error) {
	f.commitsSinceCalled = true
	f.commitsSince = since
	if f.commitsErr != nil {
		return nil, f.commitsErr
	}
	return f.commits, nil
}
func (f *fakeProvider) UpdateIssueState(context.Context, string, int, string) error {
	return nil
}

func TestSyncRepoEndToEnd(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping SyncRepo e2e test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: dbURL}})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer database.Close()

	ns := time.Now().UnixNano()
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("sync-e2e-%d", ns), "Sync E2E").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, orgID)
	})

	// Seed a repo to sync into.
	var repoID, fullName string
	fullName = "acme/e2e"
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name, default_branch)
			 VALUES ($1,'github',$2,$3,'main') RETURNING id`,
			orgID, fmt.Sprintf("e2e-repo-%d", ns), fullName).Scan(&repoID)
	}); err != nil {
		t.Fatalf("seed repo: %v", err)
	}

	merged := time.Now().Add(-24 * time.Hour)
	firstCommit := merged.Add(-48 * time.Hour) // lead time = firstCommit → merged
	devEmail := fmt.Sprintf("dev-%d@example.com", ns)
	reviewerEmail := fmt.Sprintf("reviewer-%d@example.com", ns)
	prExtID := fmt.Sprintf("e2e-pr-%d", ns)
	prov := &fakeProvider{
		issues: []RemoteIssue{
			{ExternalID: fmt.Sprintf("e2e-iss-%d", ns), Number: 4242, Title: "Fix the widget", Body: "broken", State: "open", Labels: []string{"bug"}},
			// An incident-labelled, closed issue → derived incident (DORA MTTR input).
			{ExternalID: fmt.Sprintf("e2e-inc-%d", ns), Number: 4243, Title: "API down", Body: "outage", State: "closed",
				Labels: []string{"sev1"}, CreatedAt: merged.Add(-3 * time.Hour), UpdatedAt: merged.Add(-1 * time.Hour)},
		},
		prs: []RemotePR{
			{ExternalID: prExtID, Number: 9001, Title: "Fix the widget (closes #4242)", Body: "closes #4242", State: "merged", AuthorLogin: "dev", Additions: 10, Deletions: 2, ChangedFiles: 3, MergedAt: &merged, CreatedAt: merged.Add(-2 * time.Hour), FirstCommitAt: firstCommit},
		},
		// reviewer (not the author) reviewed PR 9001 → reviews_done for reviewer.
		// A self-review by "dev" must be skipped by the syncer.
		reviews: map[int][]RemoteReview{
			9001: {
				{ReviewerLogin: "reviewer", State: "approved", SubmittedAt: merged.Add(-30 * time.Minute), ExternalID: "rv-1"},
				{ReviewerLogin: "dev", State: "commented", SubmittedAt: merged.Add(-90 * time.Minute), ExternalID: "rv-self"},
			},
		},
		deploys: []RemoteDeployment{
			{ExternalID: fmt.Sprintf("e2e-dep-%d", ns), Environment: "production", Status: "success", SHA: "abc123", DeployedAt: merged},
		},
		// Two commits delivered via the API path (no clone). SyncRepo must upsert
		// these through provider.ListCommits — the fake repo has no clone URL, so the
		// blame clone is skipped and these are the only commits the API path adds.
		commits: []RemoteCommit{
			{SHA: fmt.Sprintf("api-sha-1-%d", ns), AuthorLogin: "dev", AuthorEmail: devEmail, Message: "api commit one", CommittedAt: firstCommit},
			{SHA: fmt.Sprintf("api-sha-2-%d", ns), AuthorLogin: "reviewer", AuthorEmail: reviewerEmail, Message: "api commit two", CommittedAt: merged},
		},
	}

	// Seed users + commits so the commit-identity bridge (login→email→users) can
	// resolve the PR author and the reviewer to real users rows. Without these,
	// ComputeInvolvement has nothing to attribute features_shipped / reviews_done to.
	var devUserID, reviewerUserID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1,'Dev') RETURNING id`, devEmail).Scan(&devUserID); err != nil {
		t.Fatalf("seed dev user: %v", err)
	}
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1,'Reviewer') RETURNING id`, reviewerEmail).Scan(&reviewerUserID); err != nil {
		t.Fatalf("seed reviewer user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`,
			[]string{devUserID, reviewerUserID})
	})
	// Commits give us the login→email identity bridge. author_login matches the PR
	// author_login / reviewer_login; author_email matches the seeded users.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, c := range []store.Commit{
			{OrgID: orgID, RepoID: repoID, SHA: fmt.Sprintf("sha-dev-%d", ns), AuthorLogin: "dev", AuthorEmail: devEmail, Message: "x", Additions: 5, Deletions: 1, CommittedAt: firstCommit},
			{OrgID: orgID, RepoID: repoID, SHA: fmt.Sprintf("sha-rev-%d", ns), AuthorLogin: "reviewer", AuthorEmail: reviewerEmail, Message: "y", Additions: 3, Deletions: 0, CommittedAt: firstCommit},
		} {
			cc := c
			if err := store.UpsertCommit(ctx, tx, &cc); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("seed commits: %v", err)
	}

	var repo *store.Repo
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		r, e := store.GetRepo(ctx, tx, orgID, repoID)
		repo = r
		return e
	}); err != nil {
		t.Fatalf("load repo: %v", err)
	}

	// Empty clone token; the fake provider's repo has no real clone URL, so the
	// git-analysis step is skipped/best-effort and the API-driven assertions hold.
	if err := SyncRepo(ctx, database, prov, orgID, *repo, ""); err != nil {
		t.Fatalf("SyncRepo returned error: %v", err)
	}

	// The API commit path must have been invoked, and `since` must equal the repo's
	// LastSyncedAt at sync time (nil here → zero), proving the incremental wiring.
	if !prov.commitsSinceCalled {
		t.Error("provider.ListCommits was not called — API commit path not wired")
	}
	if repo.LastSyncedAt == nil {
		if !prov.commitsSince.IsZero() {
			t.Errorf("ListCommits since = %v, want zero (repo had no last_synced_at → full pull)", prov.commitsSince)
		}
	} else if !prov.commitsSince.Equal(*repo.LastSyncedAt) {
		t.Errorf("ListCommits since = %v, want %v (= repo.LastSyncedAt → incremental)", prov.commitsSince, *repo.LastSyncedAt)
	}

	// Verify side effects landed, all reads inside the org's RLS context.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		// 1. Issue upserted (set_config RLS path worked).
		var issState, derived string
		if err := tx.QueryRow(ctx,
			`SELECT state, COALESCE(derived_state,'') FROM issues WHERE org_id=$1 AND number=4242`, orgID).
			Scan(&issState, &derived); err != nil {
			return fmt.Errorf("issue not upserted: %w", err)
		}
		// 2. Derived-state auto-progress: merged PR referencing #4242 → "done".
		if derived != "done" {
			t.Errorf("derived_state = %q, want done (merged PR closes #4242)", derived)
		}

		// 3. PR upserted.
		var prCount int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM pull_requests WHERE org_id=$1 AND number=9001`, orgID).Scan(&prCount); err != nil {
			return err
		}
		if prCount != 1 {
			t.Errorf("PR rows = %d, want 1", prCount)
		}

		// 4. last_synced_at set on the repo.
		var synced *time.Time
		if err := tx.QueryRow(ctx,
			`SELECT last_synced_at FROM repos WHERE id=$1`, repoID).Scan(&synced); err != nil {
			return err
		}
		if synced == nil {
			t.Error("last_synced_at not set — step 4 (post-pull) did not run")
		}

		// 5. Embedding pass ran: the freshly upserted issue got a vector on
		//    issues.embedding. (Proves step 6 executed — embeddings are the
		//    flywheel's semantic index.)
		var embCount int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM issues WHERE org_id=$1 AND number=4242 AND embedding IS NOT NULL`, orgID).
			Scan(&embCount); err != nil {
			return err
		}
		if embCount == 0 {
			t.Error("no embedding for the synced issue — post-sync embed step did not run")
		}

		// 6. Gap A — Cycle Time: the PR carried FirstCommitAt, so first_commit_at
		//    is set and ComputeCycleTimes (run in SyncRepo) produced a lead time.
		var firstCommitAt *time.Time
		if err := tx.QueryRow(ctx,
			`SELECT first_commit_at FROM pull_requests WHERE org_id=$1 AND number=9001`, orgID).
			Scan(&firstCommitAt); err != nil {
			return err
		}
		if firstCommitAt == nil {
			t.Error("first_commit_at not set — gap A (PR commits → cycle time) did not run")
		}
		var leadCount int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM cycle_times c
			JOIN pull_requests p ON p.id = c.pr_id
			WHERE c.org_id=$1 AND p.number=9001 AND c.lead_time_secs IS NOT NULL`, orgID).
			Scan(&leadCount); err != nil {
			return err
		}
		if leadCount == 0 {
			t.Error("no cycle_time lead_time_secs — gap A did not populate Cycle Time")
		}

		// 7. Gap B — Reviews: the reviewer's review landed; the self-review by the
		//    PR author ("dev") was skipped.
		var reviewerRows, selfRows int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM pr_reviews WHERE org_id=$1 AND lower(reviewer_login)='reviewer'`, orgID).
			Scan(&reviewerRows); err != nil {
			return err
		}
		if reviewerRows != 1 {
			t.Errorf("pr_reviews for reviewer = %d, want 1 (gap B)", reviewerRows)
		}
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM pr_reviews WHERE org_id=$1 AND lower(reviewer_login)='dev'`, orgID).
			Scan(&selfRows); err != nil {
			return err
		}
		if selfRows != 0 {
			t.Errorf("pr_reviews for self-reviewer 'dev' = %d, want 0 (self-reviews skipped)", selfRows)
		}

		// 8. Gap C — Deployment landed (DORA deploy frequency input).
		var depCount int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM deployments WHERE org_id=$1 AND source='github_actions'`, orgID).
			Scan(&depCount); err != nil {
			return err
		}
		if depCount != 1 {
			t.Errorf("deployments = %d, want 1 (gap C)", depCount)
		}

		// 8b. API commits: the two commits delivered via provider.ListCommits (the
		//     no-clone path) landed in the commits table. The fake repo has no clone
		//     URL, so the blame clone is skipped — these prove the API commit path.
		var apiCommitCount int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM commits WHERE org_id=$1 AND repo_id=$2 AND sha LIKE 'api-sha-%'`,
			orgID, repoID).Scan(&apiCommitCount); err != nil {
			return err
		}
		if apiCommitCount != 2 {
			t.Errorf("api-sourced commits = %d, want 2 (commits via provider.ListCommits, no clone)", apiCommitCount)
		}

		// 9. Gap C — Incident derived from the sev1 closed issue, with resolved_at.
		var incOpen, incResolved int
		if err := tx.QueryRow(ctx, `
			SELECT count(*), count(*) FILTER (WHERE resolved_at IS NOT NULL)
			FROM incidents WHERE org_id=$1 AND severity='sev1'`, orgID).
			Scan(&incOpen, &incResolved); err != nil {
			return err
		}
		if incOpen != 1 {
			t.Errorf("sev1 incidents = %d, want 1 (gap C derive-from-issues)", incOpen)
		}
		if incResolved != 1 {
			t.Errorf("resolved sev1 incidents = %d, want 1 (closed issue → resolved incident)", incResolved)
		}
		return nil
	}); err != nil {
		t.Fatalf("side-effect verification: %v", err)
	}

	// Gap B end-to-end: ComputeInvolvement must now read reviews_done from
	// pr_reviews. Compute for the calendar month containing the review.
	period := time.Date(merged.Year(), merged.Month(), 1, 0, 0, 0, 0, time.UTC)
	svc := metrics.New(database, nil)
	if err := svc.ComputeInvolvement(ctx, orgID, period); err != nil {
		t.Fatalf("ComputeInvolvement: %v", err)
	}
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		// reviewer's involvement row should show reviews_done = 1 (one distinct PR).
		var reviewsDone int
		if err := tx.QueryRow(ctx,
			`SELECT reviews_done FROM involvement WHERE org_id=$1 AND user_id=$2 AND period_start=$3`,
			orgID, reviewerUserID, period).Scan(&reviewsDone); err != nil {
			return fmt.Errorf("reviewer involvement row missing: %w", err)
		}
		if reviewsDone != 1 {
			t.Errorf("reviewer reviews_done = %d, want 1 (gap B — distinct PRs reviewed)", reviewsDone)
		}
		// The PR author shipped a merged PR → features_shipped >= 1.
		var featuresShipped int
		if err := tx.QueryRow(ctx,
			`SELECT features_shipped FROM involvement WHERE org_id=$1 AND user_id=$2 AND period_start=$3`,
			orgID, devUserID, period).Scan(&featuresShipped); err != nil {
			return fmt.Errorf("dev involvement row missing: %w", err)
		}
		if featuresShipped < 1 {
			t.Errorf("dev features_shipped = %d, want >= 1", featuresShipped)
		}
		return nil
	}); err != nil {
		t.Fatalf("involvement verification: %v", err)
	}

	// Gap C end-to-end: DORA deploy frequency reads DeploymentStatsForWindow.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		from := merged.Add(-7 * 24 * time.Hour)
		to := merged.Add(24 * time.Hour)
		st, err := store.DeploymentStatsForWindow(ctx, tx, orgID, from, to)
		if err != nil {
			return err
		}
		if st.Total != 1 {
			t.Errorf("DeploymentStats.Total = %d, want 1 (gap C — DORA deploy frequency)", st.Total)
		}
		return nil
	}); err != nil {
		t.Fatalf("DORA deployment verification: %v", err)
	}
}

// setupSyncEnv seeds an org + repo and returns the loaded repo for a SyncRepo run.
// It registers cleanup of the org (which cascades to repo rows).
func setupSyncEnv(t *testing.T, ctx context.Context, database *db.DB) (orgID string, repo store.Repo) {
	t.Helper()
	ns := time.Now().UnixNano()
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("sync-synced-%d", ns), "Sync SyncedAt").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, orgID)
	})
	var repoID string
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name, default_branch)
			 VALUES ($1,'github',$2,$3,'main') RETURNING id`,
			orgID, fmt.Sprintf("synced-repo-%d", ns), "acme/synced").Scan(&repoID)
	}); err != nil {
		t.Fatalf("seed repo: %v", err)
	}
	var r *store.Repo
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		rr, e := store.GetRepo(ctx, tx, orgID, repoID)
		r = rr
		return e
	}); err != nil {
		t.Fatalf("load repo: %v", err)
	}
	return orgID, *r
}

func lastSyncedAt(t *testing.T, ctx context.Context, database *db.DB, orgID, repoID string) *time.Time {
	t.Helper()
	var synced *time.Time
	// Read inside the org's RLS context (repos is FORCE-RLS, so a bare-pool read
	// returns no rows).
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT last_synced_at FROM repos WHERE id=$1`, repoID).Scan(&synced)
	}); err != nil {
		t.Fatalf("read last_synced_at: %v", err)
	}
	return synced
}

// TestSyncRepoSyncedAtOnlyOnComplete proves the gap-prevention fix: when a remote
// FETCH errors after retries, SyncRepo must NOT advance last_synced_at (so the
// next run re-pulls the missed window); when all fetches succeed, it MUST advance.
func TestSyncRepoSyncedAtOnlyOnComplete(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping SyncRepo synced-at test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: dbURL}})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer database.Close()

	// ── Case 1: a fetch fails → last_synced_at stays nil ──────────────────────
	t.Run("incomplete_fetch_holds_synced_at", func(t *testing.T) {
		orgID, repo := setupSyncEnv(t, ctx, database)
		prov := &fakeProvider{
			commitsErr: errors.New("simulated rate-limit exhaustion after retries"),
		}
		if err := SyncRepo(ctx, database, prov, orgID, repo, ""); err != nil {
			t.Fatalf("SyncRepo returned error: %v", err)
		}
		if got := lastSyncedAt(t, ctx, database, orgID, repo.ID); got != nil {
			t.Errorf("last_synced_at = %v, want nil (a fetch errored → must not advance)", got)
		}
	})

	// ── Case 2: all fetches succeed → last_synced_at is set ───────────────────
	t.Run("complete_fetch_advances_synced_at", func(t *testing.T) {
		orgID, repo := setupSyncEnv(t, ctx, database)
		prov := &fakeProvider{} // no error → all fetches succeed
		if err := SyncRepo(ctx, database, prov, orgID, repo, ""); err != nil {
			t.Fatalf("SyncRepo returned error: %v", err)
		}
		if got := lastSyncedAt(t, ctx, database, orgID, repo.ID); got == nil {
			t.Error("last_synced_at = nil, want set (all fetches succeeded → must advance)")
		}
	})
}

// TestSyncRepoDoesNotBlockOnBlame proves the FAST/SLOW split: the deep blame/SZZ
// analysis is no longer part of SyncRepo, so SyncRepo never writes the
// contribution-analysis tables (commit_files etc.) itself — those only land via the
// SEPARATE AnalyzeRepoDeep pass. Here the repo HAS a clone URL but SyncRepo must NOT
// produce blame output (it would if blame were still inline). It also must stay fast
// and advance last_synced_at on a complete fast sync.
func TestSyncRepoDoesNotBlockOnBlame(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: dbURL}})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer database.Close()

	orgID, repo := setupSyncEnv(t, ctx, database)
	// Build a real local git repo and point the clone URL at it (file://). The fast
	// sync's blobless clone walks commits; the deep blame pass is NOT run by SyncRepo.
	repoDir := newLocalGitRepo(t)
	repo.CloneURL = "file://" + repoDir

	prov := &fakeProvider{}
	start := time.Now()
	if err := SyncRepo(ctx, database, prov, orgID, repo, ""); err != nil {
		t.Fatalf("SyncRepo returned error: %v", err)
	}
	elapsed := time.Since(start)
	// A tiny local repo's fast sync (clone + commit walk, no blame) is well under the
	// 6-min blame budget — assert it's quick to catch a regression that re-inlines blame.
	if elapsed > 30*time.Second {
		t.Errorf("fast SyncRepo took %v — blame may have been re-inlined into the fast path", elapsed)
	}

	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		// commit_files is a deep-analysis-only table; SyncRepo must NOT have populated it.
		var cfCount int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM commit_files WHERE org_id=$1 AND repo_id=$2`, orgID, repo.ID).Scan(&cfCount); err != nil {
			return err
		}
		if cfCount != 0 {
			t.Errorf("commit_files rows after fast SyncRepo = %d, want 0 (deep blame is split out)", cfCount)
		}
		// The fast path still ingested commits from the clone.
		var commitCount int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM commits WHERE org_id=$1 AND repo_id=$2`, orgID, repo.ID).Scan(&commitCount); err != nil {
			return err
		}
		if commitCount == 0 {
			t.Error("commits = 0 after fast SyncRepo — clone commit-ingest did not run")
		}
		return nil
	}); err != nil {
		t.Fatalf("verify: %v", err)
	}
	// last_analyzed_sha must still be empty — only AnalyzeRepoDeep sets it.
	r := getRepo(t, ctx, database, orgID, repo.ID)
	if r.LastAnalyzedSHA != "" {
		t.Errorf("last_analyzed_sha = %q after fast sync, want empty (deep pass is separate)", r.LastAnalyzedSHA)
	}
}

// TestAnalyzeRepoDeepRecordsAndSkips proves the deep pass (1) records
// last_analyzed_sha = the analyzed HEAD and populates the contribution tables, and
// (2) SKIPS a second run when HEAD is unchanged (no new analysis work).
func TestAnalyzeRepoDeepRecordsAndSkips(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: dbURL}})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer database.Close()

	orgID, repo := setupSyncEnv(t, ctx, database)
	repoDir := newLocalGitRepo(t)
	repo.CloneURL = "file://" + repoDir
	headSHA := gitHead(t, repoDir)

	log := slog.Default()

	// First run: clones, blames, stores, records last_analyzed_sha = HEAD.
	if err := AnalyzeRepoDeep(ctx, database, orgID, repo, "", log); err != nil {
		t.Fatalf("AnalyzeRepoDeep (1): %v", err)
	}
	r := getRepo(t, ctx, database, orgID, repo.ID)
	if r.LastAnalyzedSHA != headSHA {
		t.Fatalf("last_analyzed_sha = %q, want HEAD %q", r.LastAnalyzedSHA, headSHA)
	}
	if r.LastAnalyzedAt == nil {
		t.Error("last_analyzed_at not set after deep analysis")
	}
	var cfCount int
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT count(*) FROM commit_files WHERE org_id=$1 AND repo_id=$2`, orgID, repo.ID).Scan(&cfCount)
	}); err != nil {
		t.Fatalf("count commit_files: %v", err)
	}
	if cfCount == 0 {
		t.Error("commit_files = 0 after deep analysis — blame did not store")
	}
	firstAnalyzedAt := *r.LastAnalyzedAt

	// Second run: HEAD is unchanged, so the deep pass must SKIP (no clone/blame). We
	// pass the repo loaded WITH the recorded last_analyzed_sha so the skip fires.
	r2 := getRepo(t, ctx, database, orgID, repo.ID)
	if err := AnalyzeRepoDeep(ctx, database, orgID, *r2, "", log); err != nil {
		t.Fatalf("AnalyzeRepoDeep (2): %v", err)
	}
	r3 := getRepo(t, ctx, database, orgID, repo.ID)
	// A skip does NOT re-stamp last_analyzed_at (it returns before recording), so the
	// timestamp must be identical to the first run.
	if r3.LastAnalyzedAt == nil || !r3.LastAnalyzedAt.Equal(firstAnalyzedAt) {
		t.Errorf("last_analyzed_at changed on a no-op re-run (%v → %v) — skip-unchanged did not fire",
			firstAnalyzedAt, r3.LastAnalyzedAt)
	}
}

// newLocalGitRepo creates a throwaway git repo with two commits and returns its dir.
func newLocalGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	run := func(args ...string) {
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Dev", "GIT_AUTHOR_EMAIL=dev@example.com",
			"GIT_COMMITTER_NAME=Dev", "GIT_COMMITTER_EMAIL=dev@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init", "-q", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello\nworld\n"), 0o644); err != nil {
		t.Fatalf("write a.txt: %v", err)
	}
	run("add", "a.txt")
	run("commit", "-q", "-m", "first commit")
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("hello\nthere\nworld\n"), 0o644); err != nil {
		t.Fatalf("rewrite a.txt: %v", err)
	}
	run("add", "a.txt")
	run("commit", "-q", "-m", "second commit")
	return dir
}

// gitHead returns the HEAD sha of a local repo.
func gitHead(t *testing.T, dir string) string {
	t.Helper()
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("git rev-parse HEAD: %v", err)
	}
	return string([]byte(out[:len(out)-1])) // strip trailing newline
}

// getRepo loads a repo inside the org's RLS context.
func getRepo(t *testing.T, ctx context.Context, database *db.DB, orgID, repoID string) *store.Repo {
	t.Helper()
	var r *store.Repo
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		rr, e := store.GetRepo(ctx, tx, orgID, repoID)
		r = rr
		return e
	}); err != nil {
		t.Fatalf("get repo: %v", err)
	}
	return r
}
