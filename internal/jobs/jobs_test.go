// Package jobs — DB-backed tests for the durable Postgres job queue.
//
// These tests run against gitstate_test ONLY (never the user's live DB). They use
// the BYPASSRLS admin pool (ADMIN_DATABASE_URL) so the worker can dequeue across
// orgs, exactly as production does. They seed a throwaway org and DELETE it
// (cascade) at the end. They skip cleanly when ADMIN_DATABASE_URL is unset.
//
// Run:
//
//	DATABASE_URL=postgres://gitstate_app:devpass@localhost:5432/gitstate_test?sslmode=disable \
//	ADMIN_DATABASE_URL=postgres://gitstate_admin:devadminpass@localhost:5432/gitstate_test?sslmode=disable \
//	go test ./internal/jobs/
package jobs

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
)

// testEnv returns an app DB + config wired with the admin pool URL, or skips.
func testEnv(t *testing.T) (*db.DB, *config.Config) {
	t.Helper()
	appURL := os.Getenv("DATABASE_URL")
	adminURL := os.Getenv("ADMIN_DATABASE_URL")
	if appURL == "" || adminURL == "" {
		t.Skip("DATABASE_URL / ADMIN_DATABASE_URL not set — skipping jobs integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: appURL}})
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	cfg := &config.Config{}
	cfg.Admin.DatabaseURL = adminURL
	return database, cfg
}

// seedOrg creates a throwaway org and registers cleanup.
func seedOrg(t *testing.T, ctx context.Context, database *db.DB, label string) string {
	t.Helper()
	ns := time.Now().UnixNano()
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("%s-%d", label, ns), "Jobs Test Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id = $1`, orgID)
	})
	return orgID
}

// jobStatus reads a single job row's status (admin pool, cross-org).
func jobStatus(t *testing.T, ctx context.Context, q *Queue, orgID string, kind string) (status string, attempts int, lastErr string) {
	t.Helper()
	err := q.admin.QueryRow(ctx,
		`SELECT status, attempts, COALESCE(last_error,'') FROM jobs WHERE org_id=$1 AND kind=$2 ORDER BY created_at DESC LIMIT 1`,
		orgID, kind).Scan(&status, &attempts, &lastErr)
	if err != nil {
		t.Fatalf("read job status: %v", err)
	}
	return status, attempts, lastErr
}

func liveJobCount(t *testing.T, ctx context.Context, q *Queue, orgID, dedupe string) int {
	t.Helper()
	var n int
	if err := q.admin.QueryRow(ctx,
		`SELECT count(*) FROM jobs WHERE org_id=$1 AND dedupe_key=$2 AND status IN ('pending','running')`,
		orgID, dedupe).Scan(&n); err != nil {
		t.Fatalf("count live jobs: %v", err)
	}
	return n
}

// waitFor polls cond until true or the deadline; fails otherwise.
func waitFor(t *testing.T, d time.Duration, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if cond() {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("condition not met within %s", d)
}

// TestEnqueueDequeueHandlerDone: enqueue → worker dequeues → handler runs → done.
func TestEnqueueDequeueHandlerDone(t *testing.T) {
	database, cfg := testEnv(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	orgID := seedOrg(t, ctx, database, "jobs-done")

	q, err := New(database, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer q.Close()

	var gotOrg, gotPayload string
	var ran atomic.Bool
	q.Register("test_done", func(_ context.Context, _ *db.DB, org string, payload json.RawMessage) error {
		gotOrg = org
		gotPayload = string(payload)
		ran.Store(true)
		return nil
	})

	runCtx, stop := context.WithCancel(ctx)
	defer stop()
	q.Start(runCtx)

	if err := q.Enqueue(ctx, orgID, "test_done", map[string]string{"hello": "world"}, EnqueueOpts{}); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	waitFor(t, 15*time.Second, func() bool { return ran.Load() })
	waitFor(t, 5*time.Second, func() bool {
		s, _, _ := jobStatus(t, ctx, q, orgID, "test_done")
		return s == "done"
	})

	if gotOrg != orgID {
		t.Errorf("handler org = %q, want %q", gotOrg, orgID)
	}
	// jsonb round-trips with reformatting (e.g. a space after the colon), so compare
	// the decoded value, not the exact bytes.
	var decoded map[string]string
	if err := json.Unmarshal([]byte(gotPayload), &decoded); err != nil {
		t.Fatalf("handler payload not valid JSON: %q (%v)", gotPayload, err)
	}
	if decoded["hello"] != "world" {
		t.Errorf("handler payload = %q, want {hello:world}", gotPayload)
	}
}

// TestRetryThenFail: a handler that always errors is retried until max_attempts,
// then marked failed.
func TestRetryThenFail(t *testing.T) {
	database, cfg := testEnv(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	orgID := seedOrg(t, ctx, database, "jobs-retry")

	q, err := New(database, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer q.Close()

	var calls atomic.Int32
	q.Register("test_fail", func(_ context.Context, _ *db.DB, _ string, _ json.RawMessage) error {
		calls.Add(1)
		return fmt.Errorf("boom")
	})

	runCtx, stop := context.WithCancel(ctx)
	defer stop()
	q.Start(runCtx)

	// max_attempts=2 with a tiny enqueue; backoff is real (5s after attempt 1) but
	// the first failure schedules a near-future retry; we wait long enough for both.
	if err := q.Enqueue(ctx, orgID, "test_fail", nil, EnqueueOpts{MaxAttempts: 2}); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	// After the first failure (attempt 1) the job goes back to pending with a backoff.
	waitFor(t, 15*time.Second, func() bool {
		s, a, _ := jobStatus(t, ctx, q, orgID, "test_fail")
		return s == "pending" && a == 1
	})

	// Eventually (after the backoff) attempt 2 runs and exhausts → failed.
	waitFor(t, 25*time.Second, func() bool {
		s, a, le := jobStatus(t, ctx, q, orgID, "test_fail")
		return s == "failed" && a == 2 && le != ""
	})

	if got := calls.Load(); got != 2 {
		t.Errorf("handler call count = %d, want 2 (one per attempt)", got)
	}
}

// TestDedupeCoalesces: two enqueues with the same dedupe key while a job is live
// produce exactly one live row.
func TestDedupeCoalesces(t *testing.T) {
	database, cfg := testEnv(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	orgID := seedOrg(t, ctx, database, "jobs-dedupe")

	q, err := New(database, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer q.Close()
	// Do NOT start workers — we want the jobs to stay pending so the dedupe index
	// is exercised on the live (pending) rows.

	const key = "sync:repo-123"
	opts := EnqueueOpts{DedupeKey: key, RunAfter: time.Now().Add(time.Hour)}
	if err := q.Enqueue(ctx, orgID, "sync_repo", map[string]string{"repoId": "repo-123"}, opts); err != nil {
		t.Fatalf("Enqueue #1: %v", err)
	}
	if err := q.Enqueue(ctx, orgID, "sync_repo", map[string]string{"repoId": "repo-123"}, opts); err != nil {
		t.Fatalf("Enqueue #2 (should coalesce, not error): %v", err)
	}

	if n := liveJobCount(t, ctx, q, orgID, key); n != 1 {
		t.Errorf("live jobs for dedupe key = %d, want 1 (the second enqueue must coalesce)", n)
	}
}

// TestRequeueStale: a job left 'running' with a stale lock is flipped back to
// 'pending' by RequeueStale — the restart-proof guarantee.
func TestRequeueStale(t *testing.T) {
	database, cfg := testEnv(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	orgID := seedOrg(t, ctx, database, "jobs-stale")

	q, err := New(database, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer q.Close()

	// Insert a row already 'running' with a lock 20 minutes old (older than the
	// 15-minute stale threshold) — simulating a worker that died mid-run.
	var jobID string
	if err := q.admin.QueryRow(ctx,
		`INSERT INTO jobs (org_id, kind, status, locked_at, locked_by, attempts)
		 VALUES ($1, 'sync_repo', 'running', now() - interval '20 minutes', 'dead-worker', 1)
		 RETURNING id`, orgID).Scan(&jobID); err != nil {
		t.Fatalf("seed stale running job: %v", err)
	}

	if err := q.RequeueStale(ctx); err != nil {
		t.Fatalf("RequeueStale: %v", err)
	}

	var status string
	var lockedBy *string
	if err := q.admin.QueryRow(ctx,
		`SELECT status, locked_by FROM jobs WHERE id=$1`, jobID).Scan(&status, &lockedBy); err != nil {
		t.Fatalf("read job after requeue: %v", err)
	}
	if status != "pending" {
		t.Errorf("stale job status = %q, want pending", status)
	}
	if lockedBy != nil {
		t.Errorf("stale job locked_by = %v, want NULL", *lockedBy)
	}

	// A fresh (recent-lock) running job must NOT be requeued.
	var freshID string
	if err := q.admin.QueryRow(ctx,
		`INSERT INTO jobs (org_id, kind, status, locked_at, locked_by)
		 VALUES ($1, 'sync_repo', 'running', now(), 'live-worker') RETURNING id`, orgID).Scan(&freshID); err != nil {
		t.Fatalf("seed fresh running job: %v", err)
	}
	if err := q.RequeueStale(ctx); err != nil {
		t.Fatalf("RequeueStale (fresh): %v", err)
	}
	var freshStatus string
	if err := q.admin.QueryRow(ctx, `SELECT status FROM jobs WHERE id=$1`, freshID).Scan(&freshStatus); err != nil {
		t.Fatalf("read fresh job: %v", err)
	}
	if freshStatus != "running" {
		t.Errorf("fresh running job status = %q, want running (must NOT be requeued)", freshStatus)
	}
}

// TestSkipLockedNoDoubleProcess: with many concurrent workers and N jobs, each job
// is processed exactly once (FOR UPDATE SKIP LOCKED prevents double-claiming).
func TestSkipLockedNoDoubleProcess(t *testing.T) {
	database, cfg := testEnv(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	orgID := seedOrg(t, ctx, database, "jobs-skiplocked")

	q, err := New(database, cfg)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer q.Close()
	q.workers = 8 // hammer the dequeue path with many concurrent claimers

	const total = 25
	var mu sync.Mutex
	seen := map[string]int{}
	var processed atomic.Int32
	q.Register("test_once", func(_ context.Context, _ *db.DB, _ string, payload json.RawMessage) error {
		var p struct {
			N string `json:"n"`
		}
		_ = json.Unmarshal(payload, &p)
		mu.Lock()
		seen[p.N]++
		mu.Unlock()
		processed.Add(1)
		// Hold briefly so workers genuinely contend on the queue.
		time.Sleep(20 * time.Millisecond)
		return nil
	})

	for i := 0; i < total; i++ {
		if err := q.Enqueue(ctx, orgID, "test_once", map[string]string{"n": fmt.Sprintf("%d", i)}, EnqueueOpts{}); err != nil {
			t.Fatalf("Enqueue %d: %v", i, err)
		}
	}

	runCtx, stop := context.WithCancel(ctx)
	defer stop()
	q.Start(runCtx)

	waitFor(t, 40*time.Second, func() bool { return processed.Load() >= total })

	mu.Lock()
	defer mu.Unlock()
	if len(seen) != total {
		t.Errorf("distinct jobs processed = %d, want %d", len(seen), total)
	}
	for n, c := range seen {
		if c != 1 {
			t.Errorf("job %q processed %d times, want exactly 1 (double-process!)", n, c)
		}
	}
}
