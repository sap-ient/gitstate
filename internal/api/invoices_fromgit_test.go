// Package api — invoices_fromgit_test.go
// HTTP test for the richer git-derived invoice builder:
//
//	POST /api/invoices/from-git
//
// Seeds two merged PRs (one estimated, one not) in-window, then drives the route
// as an owner and asserts the persisted draft has >=1 line carrying Evidence from
// the seeded git data, plus a manual-line + tax/discount create round-trip.
//
// Skips cleanly when DATABASE_URL is unset, mirroring the other api tests.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/store"
)

func TestInvoiceFromGitAndManual(t *testing.T) {
	database := apiTestDB(t)
	defer database.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	const signingKey = "test-signing-key-for-fromgit"
	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = signingKey

	ns := time.Now().UnixNano()
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("fromgit-%d", ns), "FromGit Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	defer func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id = $1`, orgID)
	}()

	// Set org context so RLS-guarded seed inserts succeed on the pool.
	if _, err := database.Pool().Exec(ctx, `SELECT set_config('app.current_org', $1, false)`, orgID); err != nil {
		t.Fatalf("set current_org: %v", err)
	}

	// Two repos, three merged PRs in-window (2 on repoA, 1 on repoB; one estimated).
	var repoA, repoB string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'fg/alpha') RETURNING id`,
		orgID, fmt.Sprintf("fg-ra-%d", ns)).Scan(&repoA); err != nil {
		t.Fatalf("repo A: %v", err)
	}
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'fg/beta') RETURNING id`,
		orgID, fmt.Sprintf("fg-rb-%d", ns)).Scan(&repoB); err != nil {
		t.Fatalf("repo B: %v", err)
	}

	from := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 5, 31, 23, 59, 59, 0, time.UTC)
	mergedIn := time.Date(2026, 5, 10, 12, 0, 0, 0, time.UTC)

	type prF struct {
		repo, ext string
		diff      *float64
	}
	d := func(v float64) *float64 { return &v }
	for i, p := range []prF{
		{repoA, "fp1", d(3)},
		{repoA, "fp2", d(2)},
		{repoB, "fp3", nil}, // unestimated → baseline 1
	} {
		var prID string
		if err := database.Pool().QueryRow(ctx,
			`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, state, merged_at, created_at)
			 VALUES ($1,$2,'github',$3,$4,$5,'merged',$6,$7) RETURNING id`,
			orgID, p.repo, fmt.Sprintf("%s-%d", p.ext, ns), i+1, "PR "+p.ext, mergedIn, from).Scan(&prID); err != nil {
			t.Fatalf("insert pr %s: %v", p.ext, err)
		}
		if p.diff != nil {
			if _, err := database.Pool().Exec(ctx,
				`INSERT INTO effort_estimates (org_id, pr_id, difficulty, model) VALUES ($1,$2,$3,'gpt')`,
				orgID, prID, *p.diff); err != nil {
				t.Fatalf("insert estimate %s: %v", p.ext, err)
			}
		}
	}

	_, ownerTok := seedMember(t, ctx, database, signingKey, orgID, "owner")

	mux := http.NewServeMux()
	RegisterInvoiceRoutes(mux, database, cfg)

	do := func(method, path, token, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Org-ID", orgID)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}

	// ── from-git: per-area lines with evidence, priced at $/effort-point. ──
	body := fmt.Sprintf(`{"from":"%s","to":"%s","rateCents":10000}`,
		from.Format("2006-01-02"), to.Format("2006-01-02"))
	rec := do("POST", "/api/invoices/from-git", ownerTok, body)
	if rec.Code != http.StatusOK {
		t.Fatalf("from-git status = %d, body=%s", rec.Code, rec.Body.String())
	}

	var detail struct {
		store.ClientInvoice
		Lines []store.ClientInvoiceLine `json:"lines"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &detail); err != nil {
		t.Fatalf("decode from-git response: %v", err)
	}
	if len(detail.Lines) < 1 {
		t.Fatalf("from-git produced %d lines, want >=1", len(detail.Lines))
	}
	// At least one line must carry git evidence.
	withEvidence := 0
	totalEvidence := 0
	for _, l := range detail.Lines {
		if l.Source != "git" {
			t.Errorf("from-git line source = %q, want git", l.Source)
		}
		if len(l.Evidence) > 0 {
			withEvidence++
			totalEvidence += len(l.Evidence)
		}
	}
	if withEvidence == 0 {
		t.Errorf("no from-git line carried Evidence")
	}
	if totalEvidence != 3 {
		t.Errorf("total evidence items = %d, want 3 (one per in-window PR)", totalEvidence)
	}
	// repoA: 5 pts × 10000 = 50000 ; repoB: 1 baseline × 10000 = 10000 → 60000.
	if detail.SubtotalCents != 60000 {
		t.Errorf("from-git subtotal = %d, want 60000", detail.SubtotalCents)
	}
	if detail.Status != "draft" {
		t.Errorf("from-git status = %q, want draft", detail.Status)
	}

	// ── create a mixed invoice (git + manual) with discount + tax via POST. ──
	createBody := `{
		"from":"2026-05-01","to":"2026-05-31","currency":"USD",
		"notes":"mixed invoice","discountCents":5000,"taxRate":10,
		"lines":[
			{"source":"git","description":"alpha work","effortPoints":5,"quantity":1,"unitRateCents":12000,"amountCents":60000,
			 "evidence":[{"prTitle":"PR a","repo":"fg/alpha","mergedAt":"2026-05-10T12:00:00Z","sha":"abc"}]},
			{"source":"manual","description":"Discovery workshop","quantity":1,"unitRateCents":40000}
		]
	}`
	rec2 := do("POST", "/api/invoices", ownerTok, createBody)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("create mixed status = %d, body=%s", rec2.Code, rec2.Body.String())
	}
	var inv store.ClientInvoice
	if err := json.Unmarshal(rec2.Body.Bytes(), &inv); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	// subtotal = 60000 + (1 × 40000) = 100000 ; base 95000 ; tax 9500 ; total 104500.
	if inv.SubtotalCents != 100000 || inv.TaxCents != 9500 || inv.TotalCents != 104500 {
		t.Errorf("mixed invoice subtotal/tax/total = %d/%d/%d, want 100000/9500/104500",
			inv.SubtotalCents, inv.TaxCents, inv.TotalCents)
	}

	// ── GET the invoice: manual line persisted with source manual + no evidence. ──
	recGet := do("GET", "/api/invoices/"+inv.ID, ownerTok, "")
	if recGet.Code != http.StatusOK {
		t.Fatalf("get status = %d, body=%s", recGet.Code, recGet.Body.String())
	}
	var got struct {
		Lines []store.ClientInvoiceLine `json:"lines"`
	}
	if err := json.Unmarshal(recGet.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode get: %v", err)
	}
	var sawManual bool
	for _, l := range got.Lines {
		if l.Source == "manual" {
			sawManual = true
			if len(l.Evidence) != 0 {
				t.Errorf("manual line carried %d evidence, want 0", len(l.Evidence))
			}
		}
	}
	if !sawManual {
		t.Errorf("manual line not persisted")
	}

	// ── PATCH notes + tax via API. ──
	patchBody := `{"notes":"final notes","taxCents":1234,"discountCents":0}`
	recPatch := do("PATCH", "/api/invoices/"+inv.ID, ownerTok, patchBody)
	if recPatch.Code != http.StatusOK {
		t.Fatalf("patch status = %d, body=%s", recPatch.Code, recPatch.Body.String())
	}
	var patched store.ClientInvoice
	if err := json.Unmarshal(recPatch.Body.Bytes(), &patched); err != nil {
		t.Fatalf("decode patch: %v", err)
	}
	// discount 0, tax explicit 1234 → total = 100000 + 1234.
	if patched.Notes != "final notes" || patched.TaxCents != 1234 || patched.TotalCents != 101234 {
		t.Errorf("after patch notes/tax/total = %q/%d/%d, want 'final notes'/1234/101234",
			patched.Notes, patched.TaxCents, patched.TotalCents)
	}
}
