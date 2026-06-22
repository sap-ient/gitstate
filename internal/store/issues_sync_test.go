// Package store — issues_sync_test.go
// Regression test for the platform-sync issue path (UpsertIssue / ListIssuesByRepo
// / SetDerivedState), which previously used `SET app.current_org = $1` — a bind
// param in a bare SET, which Postgres rejects (SQLSTATE 42601), so every sync
// silently failed. These funcs open their own pool tx (the demo never exercised
// them — its issues come from cmd/seed), so this proves they actually work.
// Skips cleanly without DATABASE_URL.
package store

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestSyncIssuePath_RoundTrip(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping sync-issue integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	defer pool.Close()

	ns := time.Now().UnixNano()
	var orgID, repoID string
	// Committed setup (the funcs under test open their own tx, so setup must be visible).
	su, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin setup: %v", err)
	}
	if err := su.QueryRow(ctx, `INSERT INTO organizations (slug,name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("synctest-%d", ns), "SyncTest Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	if _, err := su.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
		t.Fatalf("set org: %v", err)
	}
	if err := su.QueryRow(ctx, `INSERT INTO repos (org_id,platform,external_id,full_name) VALUES ($1,'github',$2,'acme/svc') RETURNING id`,
		orgID, fmt.Sprintf("synctest-repo-%d", ns)).Scan(&repoID); err != nil {
		t.Fatalf("create repo: %v", err)
	}
	if err := su.Commit(ctx); err != nil {
		t.Fatalf("commit setup: %v", err)
	}
	defer func() { // cascade-cleanup the committed org
		c, e := pool.Begin(ctx)
		if e == nil {
			_, _ = c.Exec(ctx, "DELETE FROM organizations WHERE id=$1", orgID)
			_ = c.Commit(ctx)
		}
	}()

	// UpsertIssue — this is the call that returned SQLSTATE 42601 before the fix.
	if err := UpsertIssue(ctx, pool, orgID, IssueUpsert{
		OrgID: orgID, RepoID: repoID, Source: "git", Platform: "github",
		ExternalID: "iss-1", Number: 1, Title: "Synced issue", Body: "b", State: "open",
		Labels: []string{"bug"},
	}); err != nil {
		t.Fatalf("UpsertIssue (regression: was SQLSTATE 42601): %v", err)
	}

	issues, err := ListIssuesByRepo(ctx, pool, orgID, repoID)
	if err != nil {
		t.Fatalf("ListIssuesByRepo: %v", err)
	}
	if len(issues) != 1 || issues[0].Title != "Synced issue" {
		t.Fatalf("expected 1 synced issue, got %d (%v)", len(issues), issues)
	}

	if err := SetDerivedState(ctx, pool, orgID, issues[0].ID, "in_progress"); err != nil {
		t.Fatalf("SetDerivedState: %v", err)
	}
	again, err := ListIssuesByRepo(ctx, pool, orgID, repoID)
	if err != nil || len(again) != 1 {
		t.Fatalf("re-list: %v (%d)", err, len(again))
	}
	if again[0].DerivedState != "in_progress" {
		t.Fatalf("derived_state not persisted: %q", again[0].DerivedState)
	}

	// Upsert again (update path) must stay idempotent — still 1 row.
	if err := UpsertIssue(ctx, pool, orgID, IssueUpsert{
		OrgID: orgID, RepoID: repoID, Source: "git", Platform: "github",
		ExternalID: "iss-1", Number: 1, Title: "Synced issue v2", State: "open", Labels: []string{"bug"},
	}); err != nil {
		t.Fatalf("UpsertIssue update: %v", err)
	}
	final, _ := ListIssuesByRepo(ctx, pool, orgID, repoID)
	if len(final) != 1 || final[0].Title != "Synced issue v2" {
		t.Fatalf("update path: expected 1 updated issue, got %d", len(final))
	}
}
