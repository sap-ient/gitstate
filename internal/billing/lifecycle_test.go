// internal/billing/lifecycle_test.go — SIMULATED-TIME tests for the billing
// LIFECYCLE: monthly cycle, dunning escalation (retry→suspend→cancel+purge),
// recovery, proration, idempotency, and the quota / managed-LLM gates.
//
// Every test drives a *FakeClock by hand — no real time, no sleeps — and injects a
// fake Charger so no network/Paystack call happens. Each test runs against a
// throwaway org and asserts on THAT org's state (the scheduler scans cross-org, so
// we never assert on global processed counts). Gated on DATABASE_URL +
// ADMIN_DATABASE_URL; skipped cleanly when unset (matches the rest of the suite).
//
//	DATABASE_URL=postgres://gitstate_app:devpass@localhost:5432/gitstate_test?sslmode=disable \
//	ADMIN_DATABASE_URL=postgres://gitstate_admin:devadminpass@localhost:5432/gitstate_test?sslmode=disable \
//	go test ./internal/billing/ -run Lifecycle
package billing

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/store"
)

// ── test harness ──────────────────────────────────────────────────────────────

// lifecycleCfg returns a config with the admin pool wired (so the scheduler's
// cross-org scans run on BYPASSRLS) — required for the lifecycle tests.
func lifecycleCfg(t *testing.T) *config.Config {
	t.Helper()
	if os.Getenv("DATABASE_URL") == "" || os.Getenv("ADMIN_DATABASE_URL") == "" {
		t.Skip("DATABASE_URL / ADMIN_DATABASE_URL not set — skipping lifecycle test")
	}
	return &config.Config{
		Database: config.DatabaseConfig{URL: os.Getenv("DATABASE_URL")},
		Admin:    config.AdminConfig{DatabaseURL: os.Getenv("ADMIN_DATABASE_URL")},
	}
}

// fakeCharger records charge attempts and fails until `succeedFrom` attempts have
// been made (or always succeeds when succeedFrom==0 and failAlways==false).
type fakeCharger struct {
	mu       sync.Mutex
	attempts int
	// fail controls per-attempt outcome: when fail returns true the charge fails.
	fail func(attempt int) bool
	// onSuccess, if set, marks the invoice paid so the lifecycle's idempotency
	// (GetOpenInvoiceForPeriod) reflects a real settle. We leave invoice status to
	// the scheduler (it calls MarkInvoicePaid on success), so this is just bookkeeping.
}

func (c *fakeCharger) Charge(ctx context.Context, orgID, invoiceID string, usdCents int) (*ChargeResult, error) {
	c.mu.Lock()
	c.attempts++
	n := c.attempts
	c.mu.Unlock()
	if c.fail != nil && c.fail(n) {
		return nil, fmt.Errorf("fake charge declined (attempt %d)", n)
	}
	return &ChargeResult{ZARCents: usdCents * 18, FXRate: 18.0, FXRateID: "", PaystackRef: fmt.Sprintf("ref-%s-%d", invoiceID, n)}, nil
}

// seedSubscription creates an org with a paid plan whose period ENDS at periodEnd.
func seedSubscriptionWithPeriod(t *testing.T, ctx context.Context, database *db.DB, planKey string, periodStart, periodEnd time.Time, cardOnFile bool) (orgID string, cleanup func()) {
	t.Helper()
	ns := time.Now().UnixNano()
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("life-%d", ns), "Lifecycle Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	cleanup = func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, orgID)
	}
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if err := store.UpsertSubscription(ctx, tx, orgID, planKey, store.BillingActive, &periodEnd, ""); err != nil {
			return err
		}
		// Set the period window + card flag via the lifecycle columns.
		if _, err := tx.Exec(ctx,
			`UPDATE subscriptions SET current_period_start=$2, current_period_end=$3, payment_method_on_file=$4 WHERE org_id=$1`,
			orgID, periodStart.UTC(), periodEnd.UTC(), cardOnFile); err != nil {
			return err
		}
		return nil
	}); err != nil {
		cleanup()
		t.Fatalf("seed subscription: %v", err)
	}
	return orgID, cleanup
}

func addLifecycleMember(t *testing.T, ctx context.Context, database *db.DB, orgID, role, name string) {
	t.Helper()
	ns := time.Now().UnixNano()
	var uid string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("%s-%d@ex.io", role, ns), name).Scan(&uid); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := database.Pool().Exec(ctx,
		`INSERT INTO org_members (org_id,user_id,role) VALUES ($1,$2,$3)`, orgID, uid, role); err != nil {
		t.Fatalf("add member: %v", err)
	}
}

func lifecycleState(t *testing.T, ctx context.Context, database *db.DB, orgID string) *store.SubscriptionLifecycle {
	t.Helper()
	var life *store.SubscriptionLifecycle
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		l, e := store.GetSubscriptionLifecycle(ctx, tx, orgID)
		life = l
		return e
	}); err != nil {
		t.Fatalf("get lifecycle: %v", err)
	}
	return life
}

func newScheduler(t *testing.T, database *db.DB, cfg *config.Config, charger Charger, clock Clock) *Scheduler {
	t.Helper()
	sch, err := NewScheduler(database, cfg, charger, clock)
	if err != nil {
		t.Fatalf("NewScheduler: %v", err)
	}
	t.Cleanup(sch.Close)
	return sch
}

// ── #1 full monthly cycle: generate + charge + advance ────────────────────────

func TestLifecycle_MonthlyCycle_ChargesAndAdvances(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()

	periodStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, true)
	defer cleanup()
	addLifecycleMember(t, ctx, database, orgID, "owner", "Alice")

	charger := &fakeCharger{} // always succeeds
	clock := NewFakeClock(periodEnd.Add(time.Hour))
	sch := newScheduler(t, database, cfg, charger, clock)

	if _, err := sch.RunBillingCycle(ctx, clock.Now()); err != nil {
		t.Fatalf("RunBillingCycle: %v", err)
	}

	life := lifecycleState(t, ctx, database, orgID)
	if life.BillingStatus != store.BillingActive {
		t.Errorf("billing_status = %q, want active", life.BillingStatus)
	}
	if charger.attempts != 1 {
		t.Errorf("charge attempts = %d, want 1", charger.attempts)
	}
	// Period advanced by one month.
	if life.CurrentPeriodEnd == nil || !life.CurrentPeriodEnd.Equal(periodEnd.AddDate(0, 1, 0)) {
		t.Errorf("period end = %v, want %v", life.CurrentPeriodEnd, periodEnd.AddDate(0, 1, 0))
	}
	// An invoice exists for the original period.
	var nInv int
	_ = database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT COUNT(*) FROM invoices WHERE org_id=$1`, orgID).Scan(&nInv)
	})
	if nInv != 1 {
		t.Errorf("invoices = %d, want 1", nInv)
	}
}

// ── #8 idempotency: re-running the same period → no second invoice/charge ──────

func TestLifecycle_Idempotency_NoDoubleInvoiceOrCharge(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()

	periodStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, true)
	defer cleanup()
	addLifecycleMember(t, ctx, database, orgID, "owner", "Alice")

	charger := &fakeCharger{}
	clock := NewFakeClock(periodEnd.Add(time.Hour))
	sch := newScheduler(t, database, cfg, charger, clock)

	// First sweep bills + advances; the period window moves forward so a second
	// sweep at the SAME clock finds nothing due for the original period.
	if _, err := sch.RunBillingCycle(ctx, clock.Now()); err != nil {
		t.Fatalf("RunBillingCycle #1: %v", err)
	}
	// Force the period back so the org is "due" again for the SAME [start,end] —
	// this simulates a replay/re-run of the exact same billing period.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			`UPDATE subscriptions SET billing_status='active', status='active',
			   current_period_start=$2, current_period_end=$3 WHERE org_id=$1`,
			orgID, periodStart.UTC(), periodEnd.UTC())
		return e
	}); err != nil {
		t.Fatalf("rewind period: %v", err)
	}

	if _, err := sch.RunBillingCycle(ctx, clock.Now()); err != nil {
		t.Fatalf("RunBillingCycle #2: %v", err)
	}

	// Exactly ONE invoice for the period (idempotency guard #8), and the second
	// sweep did NOT re-charge (the invoice was already paid).
	var nInv int
	_ = database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT COUNT(*) FROM invoices WHERE org_id=$1 AND period_start=$2 AND period_end=$3 AND status<>'void'`,
			orgID, periodStart.UTC(), periodEnd.UTC()).Scan(&nInv)
	})
	if nInv != 1 {
		t.Errorf("non-void invoices for period = %d, want 1 (idempotent)", nInv)
	}
	if charger.attempts != 1 {
		t.Errorf("charge attempts = %d, want 1 (no double charge)", charger.attempts)
	}
}

// ── #7 dunning: fail → past_due → retries → suspend(7) → cancel+purge(14) ──────

func TestLifecycle_Dunning_FullEscalationAndPurge(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()

	periodStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, true)
	defer cleanup()
	addLifecycleMember(t, ctx, database, orgID, "owner", "Alice")

	// Seed work-product data to prove the day-14 purge actually deletes it.
	var repoID string
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if e := tx.QueryRow(ctx,
			`INSERT INTO repos (org_id,platform,external_id,full_name) VALUES ($1,'github','x1','acme/r') RETURNING id`,
			orgID).Scan(&repoID); e != nil {
			return e
		}
		_, e := tx.Exec(ctx,
			`INSERT INTO commits (org_id,repo_id,sha,author_login,message,committed_at) VALUES ($1,$2,'sha1','Alice','w',$3)`,
			orgID, repoID, periodStart.Add(24*time.Hour))
		return e
	}); err != nil {
		t.Fatalf("seed work product: %v", err)
	}

	charger := &fakeCharger{fail: func(int) bool { return true }} // always declines
	clock := NewFakeClock(periodEnd.Add(time.Hour))
	sch := newScheduler(t, database, cfg, charger, clock)

	// Day 0: cycle runs, charge fails → past_due, first retry scheduled at day 1.
	if _, err := sch.RunBillingCycle(ctx, clock.Now()); err != nil {
		t.Fatalf("cycle: %v", err)
	}
	life := lifecycleState(t, ctx, database, orgID)
	if life.BillingStatus != store.BillingPastDue {
		t.Fatalf("after failed charge: status=%q, want past_due", life.BillingStatus)
	}
	if life.DunningAttempts != 1 {
		t.Errorf("dunning_attempts=%d, want 1", life.DunningAttempts)
	}

	// Walk the retries at simulated days 1, 3, 5 — each should stay past_due.
	for _, day := range []int{1, 3, 5} {
		clock.Set(periodEnd.Add(time.Hour).AddDate(0, 0, day))
		if _, err := sch.RunDunning(ctx, clock.Now()); err != nil {
			t.Fatalf("dunning day %d: %v", day, err)
		}
		life = lifecycleState(t, ctx, database, orgID)
		if life.BillingStatus != store.BillingPastDue {
			t.Errorf("day %d: status=%q, want past_due", day, life.BillingStatus)
		}
	}

	// Day 7: suspend (writes/sync blocked, data kept).
	clock.Set(periodEnd.Add(time.Hour).AddDate(0, 0, 7))
	if _, err := sch.RunDunning(ctx, clock.Now()); err != nil {
		t.Fatalf("dunning day 7: %v", err)
	}
	life = lifecycleState(t, ctx, database, orgID)
	if life.BillingStatus != store.BillingSuspended {
		t.Errorf("day 7: status=%q, want suspended", life.BillingStatus)
	}
	if life.SuspendedAt == nil {
		t.Error("day 7: suspended_at not set")
	}
	// Data still present while suspended.
	if n := countRepos(t, ctx, database, orgID); n != 1 {
		t.Errorf("day 7 (suspended): repos=%d, want 1 (data kept)", n)
	}

	// Day 14: cancel + PURGE.
	clock.Set(periodEnd.Add(time.Hour).AddDate(0, 0, 14))
	if _, err := sch.RunDunning(ctx, clock.Now()); err != nil {
		t.Fatalf("dunning day 14: %v", err)
	}
	life = lifecycleState(t, ctx, database, orgID)
	if life.BillingStatus != store.BillingCanceled {
		t.Errorf("day 14: status=%q, want canceled", life.BillingStatus)
	}
	if life.CanceledAt == nil {
		t.Error("day 14: canceled_at not set")
	}
	// Work product PURGED.
	if n := countRepos(t, ctx, database, orgID); n != 0 {
		t.Errorf("day 14: repos=%d, want 0 (purged)", n)
	}
	var nCommits int
	_ = database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT COUNT(*) FROM commits WHERE org_id=$1`, orgID).Scan(&nCommits)
	})
	if nCommits != 0 {
		t.Errorf("day 14: commits=%d, want 0 (purged)", nCommits)
	}
	// The org + subscription row themselves are KEPT (account record retained).
	var orgExists bool
	_ = database.Pool().QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1)`, orgID).Scan(&orgExists)
	if !orgExists {
		t.Error("day 14: organization row deleted — purge must keep the account record")
	}
}

// ── #7 recovery: a successful charge mid-dunning returns to active ────────────

func TestLifecycle_Dunning_RecoveryReturnsActive(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()

	periodStart := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, true)
	defer cleanup()
	addLifecycleMember(t, ctx, database, orgID, "owner", "Alice")

	// Fail the first 2 attempts (cycle + day-1 retry), succeed on the day-3 retry.
	charger := &fakeCharger{fail: func(n int) bool { return n <= 2 }}
	clock := NewFakeClock(periodEnd.Add(time.Hour))
	sch := newScheduler(t, database, cfg, charger, clock)

	// Day 0: fails → past_due.
	if _, err := sch.RunBillingCycle(ctx, clock.Now()); err != nil {
		t.Fatalf("cycle: %v", err)
	}
	// Day 1: retry fails again → still past_due.
	clock.Set(periodEnd.Add(time.Hour).AddDate(0, 0, 1))
	if _, err := sch.RunDunning(ctx, clock.Now()); err != nil {
		t.Fatalf("dunning day 1: %v", err)
	}
	if life := lifecycleState(t, ctx, database, orgID); life.BillingStatus != store.BillingPastDue {
		t.Fatalf("day 1: status=%q, want past_due", life.BillingStatus)
	}
	// Day 3: retry SUCCEEDS → active + period advanced.
	clock.Set(periodEnd.Add(time.Hour).AddDate(0, 0, 3))
	if _, err := sch.RunDunning(ctx, clock.Now()); err != nil {
		t.Fatalf("dunning day 3: %v", err)
	}
	life := lifecycleState(t, ctx, database, orgID)
	if life.BillingStatus != store.BillingActive {
		t.Errorf("day 3 (recovered): status=%q, want active", life.BillingStatus)
	}
	if life.DunningAttempts != 0 || life.NextRetryAt != nil {
		t.Errorf("day 3: dunning not cleared (attempts=%d, next=%v)", life.DunningAttempts, life.NextRetryAt)
	}
	if life.CurrentPeriodEnd == nil || !life.CurrentPeriodEnd.Equal(periodEnd.AddDate(0, 1, 0)) {
		t.Errorf("day 3: period end=%v, want advanced to %v", life.CurrentPeriodEnd, periodEnd.AddDate(0, 1, 0))
	}
}

// ── #6 proration on upgrade/downgrade ─────────────────────────────────────────

func TestLifecycle_Proration_UpgradeAndDowngrade(t *testing.T) {
	periodStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC) // 30-day period
	// Change at the exact midpoint (day 15) → ~50% remaining.
	mid := periodStart.AddDate(0, 0, 15)

	// Upgrade starter($7)→pro($15) for 3 builders, ~half the period remaining.
	up := Prorate(700, 1500, 3, periodStart, periodEnd, mid)
	if up.DeltaUSDCents <= 0 {
		t.Errorf("upgrade delta=%d, want positive charge", up.DeltaUSDCents)
	}
	// Expected ≈ (1500-700)*3*0.5 = 1200.
	if up.DeltaUSDCents < 1100 || up.DeltaUSDCents > 1300 {
		t.Errorf("upgrade delta=%d, want ≈1200 (half of 800×3)", up.DeltaUSDCents)
	}

	// Downgrade pro→starter → a credit (negative).
	down := Prorate(1500, 700, 3, periodStart, periodEnd, mid)
	if down.DeltaUSDCents >= 0 {
		t.Errorf("downgrade delta=%d, want negative credit", down.DeltaUSDCents)
	}
	if down.DeltaUSDCents != -up.DeltaUSDCents {
		t.Errorf("downgrade delta=%d should mirror upgrade %d", down.DeltaUSDCents, up.DeltaUSDCents)
	}

	// At period start (full period remaining) the delta is the full price diff.
	full := Prorate(700, 1500, 1, periodStart, periodEnd, periodStart)
	if full.DeltaUSDCents != 800 {
		t.Errorf("full-period proration=%d, want 800 (no proration at start)", full.DeltaUSDCents)
	}
	// After the period ends, nothing remains → zero delta.
	none := Prorate(700, 1500, 1, periodStart, periodEnd, periodEnd.AddDate(0, 0, 1))
	if none.DeltaUSDCents != 0 {
		t.Errorf("post-period proration=%d, want 0", none.DeltaUSDCents)
	}
}

// ── #1/#10 quota: free over max_repos, builder cap ───────────────────────────

func TestLifecycle_Quota_FreeMaxReposAndBuilderCap(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()
	q := NewQuotaService(database, cfg)

	// Free org (no subscription row → defaults to free: max_repos 3, builders 2).
	ns := time.Now().UnixNano()
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug,name,plan_key) VALUES ($1,'Free Org','free') RETURNING id`,
		fmt.Sprintf("free-%d", ns)).Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	defer database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, orgID)

	// Under the repo cap: allowed.
	if dec, err := q.Check(ctx, orgID, ResourceRepo); err != nil || !dec.Allowed {
		t.Fatalf("repo check (0/3): allowed=%v err=%v, want allowed", dec.Allowed, err)
	}
	// Fill to the cap (3 repos).
	for i := 0; i < 3; i++ {
		if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
			_, e := tx.Exec(ctx,
				`INSERT INTO repos (org_id,platform,external_id,full_name) VALUES ($1,'github',$2,$3)`,
				orgID, fmt.Sprintf("e%d", i), fmt.Sprintf("acme/r%d", i))
			return e
		}); err != nil {
			t.Fatalf("seed repo %d: %v", i, err)
		}
	}
	dec, err := q.Check(ctx, orgID, ResourceRepo)
	if err != nil {
		t.Fatalf("repo check (3/3): %v", err)
	}
	if dec.Allowed {
		t.Errorf("repo check at cap: allowed=true, want denied")
	}
	if dec.HTTPStatus != 402 {
		t.Errorf("repo over-cap HTTP status=%d, want 402", dec.HTTPStatus)
	}

	// Builder cap: free allows 2 builders. Add 2 → allowed at boundary check fails on 3rd.
	addLifecycleMember(t, ctx, database, orgID, "owner", "A")
	addLifecycleMember(t, ctx, database, orgID, "member", "B")
	bdec, err := q.Check(ctx, orgID, ResourceBuilder)
	if err != nil {
		t.Fatalf("builder check: %v", err)
	}
	if bdec.Allowed {
		t.Errorf("builder check at cap (2/2): allowed=true, want denied")
	}
	if bdec.HTTPStatus != 402 {
		t.Errorf("builder over-cap HTTP status=%d, want 402", bdec.HTTPStatus)
	}
}

// ── #7 suspended org: ALL writes blocked (403) ───────────────────────────────

func TestLifecycle_Quota_SuspendedBlocksWrites(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()
	q := NewQuotaService(database, cfg)

	periodStart := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, true)
	defer cleanup()

	// Force suspended.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return store.Suspend(ctx, tx, orgID, periodEnd, 4, periodEnd.AddDate(0, 0, 14))
	}); err != nil {
		t.Fatalf("suspend: %v", err)
	}

	for _, res := range []Resource{ResourceRepo, ResourceBuilder, ResourceWrite} {
		dec, err := q.Check(ctx, orgID, res)
		if err != nil {
			t.Fatalf("check %s: %v", res, err)
		}
		if dec.Allowed {
			t.Errorf("suspended org: %s allowed=true, want denied", res)
		}
		if dec.HTTPStatus != 403 {
			t.Errorf("suspended org: %s status=%d, want 403", res, dec.HTTPStatus)
		}
	}
}

// ── #2/#3 managed-LLM allowance cap + past_due/byok blocks ────────────────────

func TestLifecycle_CanUseManagedLLM_AllowanceAndGates(t *testing.T) {
	cfg := lifecycleCfg(t)
	database := testDB(t)
	ctx := context.Background()
	q := NewQuotaService(database, cfg)

	// Free (byok_only) → managed LLM BLOCKED outright (#1).
	ns := time.Now().UnixNano()
	var freeOrg string
	_ = database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug,name,plan_key) VALUES ($1,'F','free') RETURNING id`,
		fmt.Sprintf("byok-%d", ns)).Scan(&freeOrg)
	defer database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, freeOrg)
	if _, ok := q.CanUseManagedLLM(ctx, freeOrg); ok {
		t.Errorf("free/byok_only: managed LLM ok=true, want blocked")
	}

	// Paid starter, NO card, active: allowance = builders × included_llm_cents,
	// capped (ok=true, allowedCents = remaining allowance) (#2).
	periodStart := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, false)
	defer cleanup()
	addLifecycleMember(t, ctx, database, orgID, "owner", "A")
	addLifecycleMember(t, ctx, database, orgID, "member", "B") // 2 builders

	allowed, ok := q.CanUseManagedLLM(ctx, orgID)
	if !ok {
		t.Fatalf("active paid no-card: ok=false, want true")
	}
	// starter included_llm_cents=100, 2 builders → 200¢ allowance, nothing spent yet.
	if allowed != 200 {
		t.Errorf("no-card allowance=%d, want 200 (2×100)", allowed)
	}

	// Spend $1.50 (150¢) of managed LLM this period → remaining allowance 50¢.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			`INSERT INTO usage_events (org_id,kind,quantity,cost_usd,occurred_at) VALUES ($1,'llm_tokens',1000,1.50,$2)`,
			orgID, periodStart.Add(time.Hour))
		return e
	}); err != nil {
		t.Fatalf("seed llm usage: %v", err)
	}
	allowed, ok = q.CanUseManagedLLM(ctx, orgID)
	if !ok || allowed != 50 {
		t.Errorf("after 150¢ spend: allowed=%d ok=%v, want 50/true", allowed, ok)
	}

	// Add a card → uncapped (-1 sentinel), overage accrues (#3).
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return store.SetPaymentMethodOnFile(ctx, tx, orgID, true)
	}); err != nil {
		t.Fatalf("set card: %v", err)
	}
	allowed, ok = q.CanUseManagedLLM(ctx, orgID)
	if !ok || allowed != -1 {
		t.Errorf("card on file: allowed=%d ok=%v, want -1/true (uncapped)", allowed, ok)
	}

	// Drop card, force past_due → managed LLM BLOCKED (#2).
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if e := store.SetPaymentMethodOnFile(ctx, tx, orgID, false); e != nil {
			return e
		}
		return store.EnterPastDue(ctx, tx, orgID, 1, periodEnd)
	}); err != nil {
		t.Fatalf("force past_due: %v", err)
	}
	if _, ok := q.CanUseManagedLLM(ctx, orgID); ok {
		t.Errorf("past_due: managed LLM ok=true, want blocked")
	}
}

// ── #9 refund/chargeback reversal ─────────────────────────────────────────────

func TestLifecycle_RefundReversesPeriodAndFlagsOrg(t *testing.T) {
	cfg := lifecycleCfg(t)
	_ = cfg
	database := testDB(t)
	ctx := context.Background()

	periodStart := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	periodEnd := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	orgID, cleanup := seedSubscriptionWithPeriod(t, ctx, database, "starter", periodStart, periodEnd, true)
	defer cleanup()

	// A real exchange-rate row so SetInvoiceCharge's fx_rate_id::uuid is valid.
	var rateID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO exchange_rates (base,quote,rate,provider) VALUES ('USD','ZAR',18.0,'test') RETURNING id`,
	).Scan(&rateID); err != nil {
		t.Fatalf("seed rate: %v", err)
	}

	// A paid invoice to reverse (FX stamped at charge — closure #5).
	var invID string
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		inv, e := store.CreateInvoice(ctx, tx, orgID, 700, periodStart, periodEnd)
		if e != nil {
			return e
		}
		invID = inv.ID
		if e := store.SetInvoiceCharge(ctx, tx, invID, 12600, 18.0, rateID, "ref-x"); e != nil {
			return e
		}
		return store.MarkInvoicePaid(ctx, tx, invID, periodStart.Add(time.Hour))
	}); err != nil {
		t.Fatalf("seed paid invoice: %v", err)
	}

	now := periodStart.AddDate(0, 0, 5)
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return store.ReverseInvoice(ctx, tx, orgID, invID, "dispute-1", "chargeback", now)
	}); err != nil {
		t.Fatalf("reverse: %v", err)
	}

	// Invoice voided.
	var status string
	_ = database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT status FROM invoices WHERE id=$1`, invID).Scan(&status)
	})
	if status != "void" {
		t.Errorf("invoice status=%q, want void", status)
	}
	// Org flagged past_due + card dropped.
	life := lifecycleState(t, ctx, database, orgID)
	if life.BillingStatus != store.BillingPastDue {
		t.Errorf("after refund: status=%q, want past_due", life.BillingStatus)
	}
	if life.PaymentMethodOnFile {
		t.Error("after refund: payment_method_on_file=true, want false")
	}
	// A reversing payment row recorded.
	var nRev int
	_ = database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT COUNT(*) FROM payments WHERE org_id=$1 AND status='reversed'`, orgID).Scan(&nRev)
	})
	if nRev != 1 {
		t.Errorf("reversed payments=%d, want 1", nRev)
	}
}

// ── helper ────────────────────────────────────────────────────────────────────

func countRepos(t *testing.T, ctx context.Context, database *db.DB, orgID string) int {
	t.Helper()
	var n int
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT COUNT(*) FROM repos WHERE org_id=$1`, orgID).Scan(&n)
	}); err != nil {
		t.Fatalf("count repos: %v", err)
	}
	return n
}
