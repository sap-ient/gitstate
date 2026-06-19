// Package store — invoicing_test.go
// DB-backed tests for client invoicing derived from git effort:
//   - MergedPREffort joins merged PRs in-window to their latest effort estimate
//     (difficulty), honouring the window and project scoping.
//   - CreateClientInvoice persists a header + lines, computing subtotal/total and
//     round-tripping evidence JSON.
//   - NextClientInvoiceNumber auto-increments per org/year.
//   - ClientInvoiceOrgByToken resolves a share token through the SECURITY DEFINER
//     function (pre-auth, RLS-bypassing) to the owning org + invoice.
//
// All work happens in one transaction that is ALWAYS rolled back. RLS is enforced
// under the app role, so org-scoped inserts set app.current_org first.
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

func TestInvoicingFromGitEffort(t *testing.T) {
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
		fmt.Sprintf("inv-%d", ns), "Invoicing Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	setOrg := func() {
		if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
			t.Fatalf("set org: %v", err)
		}
	}
	setOrg()

	// Client with an explicit rate.
	client, err := CreateClient(ctx, tx, orgID, "Acme Co", "ap@acme.io", 12000, "vip")
	if err != nil {
		t.Fatalf("create client: %v", err)
	}
	if client.RateCents != 12000 {
		t.Fatalf("client rate = %d, want 12000", client.RateCents)
	}

	// Two repos so we can prove per-repo grouping in the api line builder later.
	var repoA, repoB string
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/alpha') RETURNING id`,
		orgID, fmt.Sprintf("inv-ra-%d", ns)).Scan(&repoA); err != nil {
		t.Fatalf("repo A: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/beta') RETURNING id`,
		orgID, fmt.Sprintf("inv-rb-%d", ns)).Scan(&repoB); err != nil {
		t.Fatalf("repo B: %v", err)
	}

	win := struct{ from, to time.Time }{
		from: time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC),
		to:   time.Date(2026, 3, 31, 23, 59, 59, 0, time.UTC),
	}
	mergedIn := time.Date(2026, 3, 10, 12, 0, 0, 0, time.UTC)
	mergedOut := time.Date(2026, 2, 1, 12, 0, 0, 0, time.UTC) // before window

	// PRs: 2 merged in-window on repoA, 1 merged in-window on repoB, 1 merged
	// out-of-window, 1 still open (neither should appear).
	type prF struct {
		repo, ext  string
		state      string
		merged     *time.Time
		difficulty *float64
	}
	d := func(v float64) *float64 { return &v }
	prFixtures := []prF{
		{repoA, "p1", "merged", &mergedIn, d(3)},
		{repoA, "p2", "merged", &mergedIn, d(2)},
		{repoB, "p3", "merged", &mergedIn, nil}, // unestimated → difficulty 0
		{repoA, "p4", "merged", &mergedOut, d(9)},
		{repoB, "p5", "open", nil, d(5)},
	}
	prIDs := map[string]string{}
	for _, p := range prFixtures {
		var id string
		if err := tx.QueryRow(ctx,
			`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, state, merged_at, created_at)
			 VALUES ($1,$2,'github',$3,1,$4,$5,$6,$7) RETURNING id`,
			orgID, p.repo, fmt.Sprintf("%s-%d", p.ext, ns), "PR "+p.ext, p.state, p.merged, win.from).Scan(&id); err != nil {
			t.Fatalf("insert pr %s: %v", p.ext, err)
		}
		prIDs[p.ext] = id
		if p.difficulty != nil {
			if _, err := tx.Exec(ctx,
				`INSERT INTO effort_estimates (org_id, pr_id, difficulty, model) VALUES ($1,$2,$3,'gpt')`,
				orgID, id, *p.difficulty); err != nil {
				t.Fatalf("insert estimate %s: %v", p.ext, err)
			}
		}
	}

	// ── MergedPREffort: only the 3 in-window merged PRs come back. ──
	eff, err := MergedPREffort(ctx, tx, orgID, MergedEffortInput{From: win.from, To: win.to})
	if err != nil {
		t.Fatalf("MergedPREffort: %v", err)
	}
	if len(eff) != 3 {
		t.Fatalf("MergedPREffort rows = %d, want 3 (got %+v)", len(eff), eff)
	}
	// Sum difficulty: 3 + 2 + 0 = 5. repoA total = 5, repoB total = 0.
	var totalDiff float64
	byRepo := map[string]float64{}
	for _, e := range eff {
		totalDiff += e.Difficulty
		byRepo[e.Repo] += e.Difficulty
		if e.PRTitle == "" {
			t.Errorf("effort line missing PR title: %+v", e)
		}
		if e.MergedAt.Before(win.from) || e.MergedAt.After(win.to) {
			t.Errorf("effort line merged_at %v outside window", e.MergedAt)
		}
	}
	if totalDiff != 5 {
		t.Errorf("total difficulty = %v, want 5", totalDiff)
	}
	if byRepo["acme/alpha"] != 5 {
		t.Errorf("acme/alpha difficulty = %v, want 5", byRepo["acme/alpha"])
	}
	if byRepo["acme/beta"] != 0 {
		t.Errorf("acme/beta difficulty = %v, want 0 (unestimated)", byRepo["acme/beta"])
	}

	// Build line items the way the api buildLines does (per-repo, baseline 1 for
	// unestimated PRs), so we can persist + assert real amounts/evidence.
	rate := client.RateCents
	type grp struct {
		points float64
		count  int
		ev     []EvidenceItem
	}
	groups := map[string]*grp{}
	for _, e := range eff {
		g := groups[e.Repo]
		if g == nil {
			g = &grp{}
			groups[e.Repo] = g
		}
		pts := e.Difficulty
		if pts <= 0 {
			pts = 1 // baseline for unestimated delivered work
		}
		g.points += pts
		g.count++
		g.ev = append(g.ev, EvidenceItem{PRTitle: e.PRTitle, Repo: e.Repo, MergedAt: e.MergedAt.Format(time.RFC3339), SHA: e.SHA})
	}
	var lines []ClientInvoiceLine
	wantSubtotal := 0
	for repo, g := range groups {
		pts := math.Round(g.points*10) / 10
		amount := int(math.Round(pts * float64(rate)))
		wantSubtotal += amount
		lines = append(lines, ClientInvoiceLine{
			Description:   fmt.Sprintf("%s — %d merged PRs delivered", repo, g.count),
			EffortPoints:  pts,
			Quantity:      1,
			UnitRateCents: rate,
			AmountCents:   amount,
			Evidence:      g.ev,
		})
	}
	// alpha: 5 pts × 12000 = 60000 ; beta: 1 baseline pt × 12000 = 12000 → 72000.
	if wantSubtotal != 72000 {
		t.Fatalf("computed subtotal = %d, want 72000", wantSubtotal)
	}

	num, err := NextClientInvoiceNumber(ctx, tx, orgID, 2026)
	if err != nil {
		t.Fatalf("NextClientInvoiceNumber: %v", err)
	}
	if num != "INV-2026-001" {
		t.Errorf("first invoice number = %q, want INV-2026-001", num)
	}

	cid := client.ID
	inv, err := CreateClientInvoice(ctx, tx, orgID, CreateClientInvoiceInput{
		ClientID:    &cid,
		Number:      num,
		PeriodStart: win.from,
		PeriodEnd:   win.to,
		Currency:    "USD",
		Lines:       lines,
	})
	if err != nil {
		t.Fatalf("CreateClientInvoice: %v", err)
	}
	if inv.SubtotalCents != 72000 || inv.TotalCents != 72000 {
		t.Errorf("invoice subtotal/total = %d/%d, want 72000/72000", inv.SubtotalCents, inv.TotalCents)
	}
	if inv.Status != "draft" {
		t.Errorf("new invoice status = %q, want draft", inv.Status)
	}
	if inv.ClientName != "Acme Co" {
		t.Errorf("joined client name = %q, want Acme Co", inv.ClientName)
	}

	// Lines round-trip with evidence intact.
	gotLines, err := GetClientInvoiceLines(ctx, tx, orgID, inv.ID)
	if err != nil {
		t.Fatalf("GetClientInvoiceLines: %v", err)
	}
	if len(gotLines) != 2 {
		t.Fatalf("persisted lines = %d, want 2", len(gotLines))
	}
	var sumAmount, sumEvidence int
	for _, l := range gotLines {
		sumAmount += l.AmountCents
		sumEvidence += len(l.Evidence)
		if l.UnitRateCents != rate {
			t.Errorf("line unit rate = %d, want %d", l.UnitRateCents, rate)
		}
	}
	if sumAmount != 72000 {
		t.Errorf("sum line amounts = %d, want 72000", sumAmount)
	}
	if sumEvidence != 3 {
		t.Errorf("total evidence items = %d, want 3 (one per in-window PR)", sumEvidence)
	}

	// Second invoice for the year auto-numbers to 002.
	num2, err := NextClientInvoiceNumber(ctx, tx, orgID, 2026)
	if err != nil {
		t.Fatalf("NextClientInvoiceNumber #2: %v", err)
	}
	if num2 != "INV-2026-002" {
		t.Errorf("second invoice number = %q, want INV-2026-002", num2)
	}

	// ── Share token via SECURITY DEFINER ClientInvoiceOrgByToken. ──
	token := fmt.Sprintf("share-%d", ns)
	if err := SetClientInvoiceShareToken(ctx, tx, orgID, inv.ID, token); err != nil {
		t.Fatalf("SetClientInvoiceShareToken: %v", err)
	}
	// Resolve via the function ON THE SAME tx (so the uncommitted token is visible
	// to the SECURITY DEFINER lookup, which runs as the function owner).
	gotOrg, gotInv, err := ClientInvoiceOrgByToken(ctx, tx, token)
	if err != nil {
		t.Fatalf("ClientInvoiceOrgByToken: %v", err)
	}
	if gotOrg != orgID {
		t.Errorf("token resolved org = %q, want %q", gotOrg, orgID)
	}
	if gotInv != inv.ID {
		t.Errorf("token resolved invoice = %q, want %q", gotInv, inv.ID)
	}

	// Unknown token → ErrNotFound.
	if _, _, err := ClientInvoiceOrgByToken(ctx, tx, "no-such-token-"+fmt.Sprint(ns)); err != ErrNotFound {
		t.Errorf("unknown token err = %v, want ErrNotFound", err)
	}

	// Project scoping: an issue links repoA to a project; scoping to that project
	// keeps only repoA's merged PRs.
	var projID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO projects (org_id, name) VALUES ($1,'Apollo') RETURNING id`, orgID).Scan(&projID); err != nil {
		t.Fatalf("create project: %v", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO issues (org_id, project_id, repo_id, source, title, state) VALUES ($1,$2,$3,'native','i','open')`,
		orgID, projID, repoA); err != nil {
		t.Fatalf("link issue: %v", err)
	}
	scoped, err := MergedPREffort(ctx, tx, orgID, MergedEffortInput{ProjectID: projID, From: win.from, To: win.to})
	if err != nil {
		t.Fatalf("MergedPREffort(project): %v", err)
	}
	if len(scoped) != 2 {
		t.Errorf("project-scoped effort rows = %d, want 2 (repoA only)", len(scoped))
	}
	for _, e := range scoped {
		if e.Repo != "acme/alpha" {
			t.Errorf("project-scoped row repo = %q, want acme/alpha", e.Repo)
		}
	}

	t.Logf("invoicing OK: %d effort rows, subtotal %d, token resolved to %s", len(eff), inv.SubtotalCents, gotInv)
}
