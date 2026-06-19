// Package store — contribution_extras_test.go
// DB-backed tests for the three contribution extensions:
//   - snapshots:  UpsertContributionSnapshot is idempotent (re-upsert overwrites,
//     never duplicates) and dimensions JSON round-trips.
//   - equity:     suggested_pct = a member's composite ÷ Σ(human composites) × 100
//     (agent identities EXCLUDED from the pool) — we compute the shares from a
//     fixture and persist/read them via UpsertEquityAllocation/ListEquityAllocations.
//   - kudos:      InsertKudo + ListKudos + KudosCounts aggregate per recipient.
//
// One transaction, always rolled back. RLS enforced under the app role.
package store

import (
	"context"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestContributionExtras(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping contribution-extras integration test")
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
	var orgID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("contrib-%d", ns), "Contrib Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
		t.Fatalf("set org: %v", err)
	}

	mkUser := func(name string) string {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO users (email, name) VALUES ($1,$2) RETURNING id`,
			fmt.Sprintf("%s-%d@x.io", name, ns), name).Scan(&id); err != nil {
			t.Fatalf("create user %s: %v", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO org_members (org_id, user_id, role) VALUES ($1,$2,'member')`, orgID, id); err != nil {
			t.Fatalf("member %s: %v", name, err)
		}
		return id
	}
	alice := mkUser("alice")
	bob := mkUser("bob")

	start := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, 3, 31, 0, 0, 0, 0, time.UTC)

	// ── Snapshots: upsert idempotency. ──
	dims := map[string]float64{"shipped": 80, "review": 60, "effort": 70}
	if err := UpsertContributionSnapshot(ctx, tx, orgID, alice, start, end, 75, dims); err != nil {
		t.Fatalf("UpsertContributionSnapshot #1: %v", err)
	}
	// Re-upsert the SAME key with new values → overwrite, not duplicate.
	dims2 := map[string]float64{"shipped": 90, "review": 65, "effort": 72}
	if err := UpsertContributionSnapshot(ctx, tx, orgID, alice, start, end, 82, dims2); err != nil {
		t.Fatalf("UpsertContributionSnapshot #2: %v", err)
	}
	snaps, err := ListContributionSnapshots(ctx, tx, orgID, start)
	if err != nil {
		t.Fatalf("ListContributionSnapshots: %v", err)
	}
	if len(snaps) != 1 {
		t.Fatalf("snapshots = %d, want 1 (idempotent upsert)", len(snaps))
	}
	if snaps[0].Composite != 82 {
		t.Errorf("snapshot composite = %v, want 82 (overwritten)", snaps[0].Composite)
	}
	if snaps[0].Dimensions["shipped"] != 90 {
		t.Errorf("snapshot dim shipped = %v, want 90", snaps[0].Dimensions["shipped"])
	}
	if snaps[0].Name != "alice" {
		t.Errorf("snapshot joined name = %q, want alice", snaps[0].Name)
	}

	// ── Equity: suggested_pct = composite ÷ Σ human composites × 100. ──
	// Fixture composites: alice=60, bob=40, agentBot=100 (EXCLUDED).
	// Pool sum (humans only) = 100 → alice 60%, bob 40%.
	type member struct {
		userID    string
		composite float64
		isAgent   bool
	}
	roster := []member{
		{alice, 60, false},
		{bob, 40, false},
		{"agent-bot", 100, true}, // no real user id; excluded
	}
	var poolSum float64
	for _, m := range roster {
		if m.isAgent {
			continue
		}
		poolSum += m.composite
	}
	round1 := func(x float64) float64 { return math.Round(x*10) / 10 }
	for _, m := range roster {
		if m.isAgent {
			continue // agents are not in the equity pool
		}
		suggested := round1(100 * m.composite / poolSum)
		if err := UpsertEquityAllocation(ctx, tx, EquityAllocation{
			UserID:       m.userID,
			PeriodStart:  start,
			PeriodEnd:    end,
			SuggestedPct: suggested,
		}, orgID); err != nil {
			t.Fatalf("UpsertEquityAllocation %s: %v", m.userID, err)
		}
	}
	allocs, err := ListEquityAllocations(ctx, tx, orgID, start, end)
	if err != nil {
		t.Fatalf("ListEquityAllocations: %v", err)
	}
	if len(allocs) != 2 {
		t.Fatalf("equity allocations = %d, want 2 (agents excluded)", len(allocs))
	}
	if allocs[alice].SuggestedPct != 60 {
		t.Errorf("alice suggested = %v, want 60", allocs[alice].SuggestedPct)
	}
	if allocs[bob].SuggestedPct != 40 {
		t.Errorf("bob suggested = %v, want 40", allocs[bob].SuggestedPct)
	}
	var total float64
	for _, a := range allocs {
		total += a.SuggestedPct
	}
	if total != 100 {
		t.Errorf("suggested-pct sum = %v, want 100", total)
	}

	// Upsert an admin actual_pct on alice; re-list reflects it.
	actual := 55.0
	if err := UpsertEquityAllocation(ctx, tx, EquityAllocation{
		UserID: alice, PeriodStart: start, PeriodEnd: end,
		SuggestedPct: 60, ActualPct: &actual, PoolLabel: "Seed pool", Note: "founder",
	}, orgID); err != nil {
		t.Fatalf("UpsertEquityAllocation actual: %v", err)
	}
	allocs2, err := ListEquityAllocations(ctx, tx, orgID, start, end)
	if err != nil {
		t.Fatalf("ListEquityAllocations #2: %v", err)
	}
	if len(allocs2) != 2 {
		t.Errorf("equity allocations after actual upsert = %d, want 2 (idempotent)", len(allocs2))
	}
	a := allocs2[alice]
	if a.ActualPct == nil || *a.ActualPct != 55 {
		t.Errorf("alice actual_pct = %v, want 55", a.ActualPct)
	}
	if a.PoolLabel != "Seed pool" {
		t.Errorf("alice pool label = %q, want Seed pool", a.PoolLabel)
	}

	// ── Kudos: insert + list + per-recipient counts. ──
	if _, err := InsertKudo(ctx, tx, orgID, alice, bob, "review", "great review"); err != nil {
		t.Fatalf("InsertKudo a→b: %v", err)
	}
	if _, err := InsertKudo(ctx, tx, orgID, alice, bob, "", "and again"); err != nil {
		t.Fatalf("InsertKudo a→b 2: %v", err)
	}
	if _, err := InsertKudo(ctx, tx, orgID, bob, alice, "", "thanks back"); err != nil {
		t.Fatalf("InsertKudo b→a: %v", err)
	}
	all, err := ListKudos(ctx, tx, orgID, "", 50)
	if err != nil {
		t.Fatalf("ListKudos: %v", err)
	}
	if len(all) != 3 {
		t.Errorf("total kudos = %d, want 3", len(all))
	}
	toBob, err := ListKudos(ctx, tx, orgID, bob, 50)
	if err != nil {
		t.Fatalf("ListKudos(bob): %v", err)
	}
	if len(toBob) != 2 {
		t.Errorf("kudos to bob = %d, want 2", len(toBob))
	}
	// Newest first, and joined names populated.
	if toBob[0].FromName != "alice" || toBob[0].ToName != "bob" {
		t.Errorf("kudos joined names = from %q to %q, want alice→bob", toBob[0].FromName, toBob[0].ToName)
	}
	counts, err := KudosCounts(ctx, tx, orgID)
	if err != nil {
		t.Fatalf("KudosCounts: %v", err)
	}
	if counts[bob] != 2 {
		t.Errorf("bob kudos count = %d, want 2", counts[bob])
	}
	if counts[alice] != 1 {
		t.Errorf("alice kudos count = %d, want 1", counts[alice])
	}

	t.Logf("contribution extras OK: 1 snapshot (idempotent), equity 60/40, kudos counts bob=%d alice=%d",
		counts[bob], counts[alice])
}
