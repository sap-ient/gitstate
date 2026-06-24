// Package store — invoicing_richer_test.go
// DB-backed tests for the COMPREHENSIVE client-invoice fields added in
// migration 20260624_005:
//   - manual line items (source='manual', no evidence) persist + round-trip;
//   - a mixed git+manual invoice computes subtotal/discount/tax/total correctly;
//   - patching discount/tax recomputes total_cents from the persisted subtotal.
//
// All work happens in one transaction that is ALWAYS rolled back; RLS is enforced
// under the app role, so org-scoped inserts set app.current_org first.
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

func TestClientInvoiceRicherFields(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping invoicing integration test")
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
		fmt.Sprintf("inv-rich-%d", ns), "Richer Invoicing Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
		t.Fatalf("set org: %v", err)
	}

	from := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 4, 30, 23, 59, 59, 0, time.UTC)

	// Mixed invoice: one git-derived line (with evidence) + one manual line (no
	// evidence). discount 5000, tax_rate 10% → tax = (subtotal-discount)*0.10.
	gitLine := ClientInvoiceLine{
		Source:        "git",
		Description:   "acme/alpha — 2 merged PRs delivered",
		EffortPoints:  5,
		Quantity:      1,
		UnitRateCents: 12000,
		AmountCents:   60000,
		Evidence: []EvidenceItem{
			{PRTitle: "PR a", Repo: "acme/alpha", MergedAt: from.Format(time.RFC3339), SHA: "abc"},
		},
	}
	manualLine := ClientInvoiceLine{
		Source:        "manual",
		Description:   "Discovery workshop (flat fee)",
		Quantity:      1,
		UnitRateCents: 40000,
		AmountCents:   40000,
		// Caller passes evidence but store must drop it for manual lines.
		Evidence: []EvidenceItem{{PRTitle: "should be dropped"}},
	}

	num, err := NextClientInvoiceNumber(ctx, tx, orgID, 2026)
	if err != nil {
		t.Fatalf("NextClientInvoiceNumber: %v", err)
	}
	inv, err := CreateClientInvoice(ctx, tx, orgID, CreateClientInvoiceInput{
		Number:        num,
		PeriodStart:   from,
		PeriodEnd:     to,
		Currency:      "USD",
		Notes:         "Q2 engagement",
		DiscountCents: 5000,
		TaxRate:       10,
		Lines:         []ClientInvoiceLine{gitLine, manualLine},
	})
	if err != nil {
		t.Fatalf("CreateClientInvoice: %v", err)
	}

	// subtotal = 60000 + 40000 = 100000
	// base = 100000 - 5000 = 95000 ; tax = 9500 ; total = 104500.
	if inv.SubtotalCents != 100000 {
		t.Errorf("subtotal = %d, want 100000", inv.SubtotalCents)
	}
	if inv.DiscountCents != 5000 {
		t.Errorf("discount = %d, want 5000", inv.DiscountCents)
	}
	if inv.TaxCents != 9500 {
		t.Errorf("tax = %d, want 9500 (10%% of 95000)", inv.TaxCents)
	}
	if inv.TotalCents != 104500 {
		t.Errorf("total = %d, want 104500", inv.TotalCents)
	}
	if inv.Notes != "Q2 engagement" {
		t.Errorf("notes = %q, want Q2 engagement", inv.Notes)
	}

	// Lines round-trip: git line keeps evidence + source git; manual line has
	// source manual + NO evidence.
	lines, err := GetClientInvoiceLines(ctx, tx, orgID, inv.ID)
	if err != nil {
		t.Fatalf("GetClientInvoiceLines: %v", err)
	}
	if len(lines) != 2 {
		t.Fatalf("lines = %d, want 2", len(lines))
	}
	var sawGit, sawManual bool
	for _, l := range lines {
		switch l.Source {
		case "git":
			sawGit = true
			if len(l.Evidence) != 1 {
				t.Errorf("git line evidence = %d, want 1", len(l.Evidence))
			}
		case "manual":
			sawManual = true
			if len(l.Evidence) != 0 {
				t.Errorf("manual line evidence = %d, want 0 (dropped)", len(l.Evidence))
			}
			if l.AmountCents != 40000 {
				t.Errorf("manual line amount = %d, want 40000", l.AmountCents)
			}
		default:
			t.Errorf("unexpected line source %q", l.Source)
		}
	}
	if !sawGit || !sawManual {
		t.Errorf("expected one git + one manual line; sawGit=%v sawManual=%v", sawGit, sawManual)
	}

	// ── Patch discount/tax: change discount to 10000 + absolute tax 2000. ──
	d := 10000
	tc := 2000
	patched, err := UpdateClientInvoice(ctx, tx, orgID, inv.ID, ClientInvoicePatch{
		DiscountCents: &d,
		TaxCents:      &tc,
	})
	if err != nil {
		t.Fatalf("UpdateClientInvoice(discount/tax): %v", err)
	}
	// base = 100000 - 10000 = 90000 ; tax explicit 2000 ; total = 92000.
	if patched.DiscountCents != 10000 || patched.TaxCents != 2000 || patched.TotalCents != 92000 {
		t.Errorf("after patch: discount=%d tax=%d total=%d, want 10000/2000/92000",
			patched.DiscountCents, patched.TaxCents, patched.TotalCents)
	}

	// ── Patch notes only: must not disturb money fields. ──
	newNotes := "updated notes"
	patched2, err := UpdateClientInvoice(ctx, tx, orgID, inv.ID, ClientInvoicePatch{Notes: &newNotes})
	if err != nil {
		t.Fatalf("UpdateClientInvoice(notes): %v", err)
	}
	if patched2.Notes != "updated notes" {
		t.Errorf("notes = %q, want updated notes", patched2.Notes)
	}
	if patched2.TotalCents != 92000 {
		t.Errorf("total after notes-only patch = %d, want unchanged 92000", patched2.TotalCents)
	}

	t.Logf("richer invoice OK: subtotal=%d total=%d", inv.SubtotalCents, patched2.TotalCents)
}
