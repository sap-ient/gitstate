// Package store — agent_runs_test.go
// Round-trip proof for the agent-run write path: CreateAgentRun → ListAgentRuns
// inside one org-scoped, always-rolled-back transaction (mirrors rls_test.go).
// Skips cleanly when DATABASE_URL is unset. RLS is enforced under the non-superuser
// app role, so we set app.current_org before any write.
package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAgentRunCreateListRoundTrip(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping agent-runs integration test")
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
		t.Fatalf("acquire: %v", err)
	}
	defer conn.Release()

	tx, err := conn.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // always roll back → DB stays clean

	ns := time.Now().UnixNano()

	var orgID, userID, repoID, prID, issueID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("arun-%d", ns), "AgentRun Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}

	// RLS context — required before any org-scoped insert under the app role.
	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
		t.Fatalf("set org: %v", err)
	}

	if err := tx.QueryRow(ctx,
		`INSERT INTO users (email,name) VALUES ($1,'Supervisor') RETURNING id`,
		fmt.Sprintf("arun-%d@x.io", ns)).Scan(&userID); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'a/repo') RETURNING id`,
		orgID, fmt.Sprintf("arun-repo-%d", ns)).Scan(&repoID); err != nil {
		t.Fatalf("create repo: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, state)
		 VALUES ($1,$2,'github',$3,1,'pr','merged') RETURNING id`,
		orgID, repoID, fmt.Sprintf("arun-pr-%d", ns)).Scan(&prID); err != nil {
		t.Fatalf("create pr: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO issues (org_id, source, title, state) VALUES ($1,'native','Seed','open') RETURNING id`,
		orgID).Scan(&issueID); err != nil {
		t.Fatalf("create issue: %v", err)
	}

	// ── Invalid human_action is rejected before any write. ──
	if _, err := CreateAgentRun(ctx, tx, orgID, AgentRunInput{Goal: "bad", HumanAction: "approved"}); !errors.Is(err, ErrInvalidHumanAction) {
		t.Fatalf("invalid human_action: want ErrInvalidHumanAction, got %v", err)
	}

	tp := true
	iters := 3
	cost := 0.42
	// ── Run 1: full payload incl. pr/issue links + a valid human_action. ──
	run1, err := CreateAgentRun(ctx, tx, orgID, AgentRunInput{
		RepoID:       &repoID,
		PRID:         &prID,
		IssueID:      &issueID,
		SupervisorID: &userID,
		Goal:         "fix the login bug",
		AgentName:    "claude-code",
		Branch:       "fix/login",
		DiffSummary:  DiffSummary{Additions: 12, Deletions: 3, ChangedFiles: 2},
		TestsPassed:  &tp,
		HumanAction:  "accepted",
		Iterations:   &iters,
		CostUSD:      &cost,
	})
	if err != nil {
		t.Fatalf("create run1: %v", err)
	}
	if run1.ID == "" || run1.OrgID != orgID {
		t.Fatalf("run1 ids wrong: %+v", run1)
	}
	if run1.PRID == nil || *run1.PRID != prID {
		t.Errorf("run1 pr link lost: %v", run1.PRID)
	}
	if run1.IssueID == nil || *run1.IssueID != issueID {
		t.Errorf("run1 issue link lost: %v", run1.IssueID)
	}
	if run1.HumanAction != "accepted" {
		t.Errorf("run1 human_action = %q, want accepted", run1.HumanAction)
	}
	if run1.DiffSummary.Additions != 12 || run1.DiffSummary.ChangedFiles != 2 {
		t.Errorf("run1 diff summary lost: %+v", run1.DiffSummary)
	}
	if run1.TestsPassed == nil || !*run1.TestsPassed {
		t.Errorf("run1 tests_passed lost: %v", run1.TestsPassed)
	}
	if run1.CostUSD == nil || *run1.CostUSD != 0.42 {
		t.Errorf("run1 cost lost: %v", run1.CostUSD)
	}

	// ── Run 2: minimal payload (empty human_action persists as ""). ──
	run2, err := CreateAgentRun(ctx, tx, orgID, AgentRunInput{Goal: "second run", AgentName: "cursor"})
	if err != nil {
		t.Fatalf("create run2: %v", err)
	}
	if run2.HumanAction != "" {
		t.Errorf("run2 human_action = %q, want empty", run2.HumanAction)
	}
	if run2.PRID != nil {
		t.Errorf("run2 should have no pr link: %v", run2.PRID)
	}

	// ── List: both runs come back, ordered newest-first by created_at. ──
	// NOTE: now() is the transaction-start time, so both rows share an identical
	// created_at within this single test tx; we therefore assert set membership +
	// the created_at ordering invariant rather than a strict insertion order.
	all, err := ListAgentRuns(ctx, tx, orgID, AgentRunFilter{})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("list all: want 2, got %d", len(all))
	}
	got := map[string]bool{all[0].ID: true, all[1].ID: true}
	if !got[run1.ID] || !got[run2.ID] {
		t.Errorf("list missing a run: got %v, want %s and %s", got, run1.ID, run2.ID)
	}
	if all[0].CreatedAt.Before(all[1].CreatedAt) {
		t.Errorf("list not ordered newest-first: %v before %v", all[0].CreatedAt, all[1].CreatedAt)
	}

	// ── Filter by pr → only run1. ──
	byPR, err := ListAgentRuns(ctx, tx, orgID, AgentRunFilter{PRID: prID})
	if err != nil {
		t.Fatalf("list by pr: %v", err)
	}
	if len(byPR) != 1 || byPR[0].ID != run1.ID {
		t.Fatalf("filter by pr wrong: %+v", byPR)
	}

	// ── Filter by issue → only run1. ──
	byIssue, err := ListAgentRuns(ctx, tx, orgID, AgentRunFilter{IssueID: issueID})
	if err != nil {
		t.Fatalf("list by issue: %v", err)
	}
	if len(byIssue) != 1 || byIssue[0].ID != run1.ID {
		t.Fatalf("filter by issue wrong: %+v", byIssue)
	}

	// ── Filter by agent → only run2 (cursor). ──
	byAgent, err := ListAgentRuns(ctx, tx, orgID, AgentRunFilter{Agent: "cursor"})
	if err != nil {
		t.Fatalf("list by agent: %v", err)
	}
	if len(byAgent) != 1 || byAgent[0].ID != run2.ID {
		t.Fatalf("filter by agent wrong: %+v", byAgent)
	}
}
