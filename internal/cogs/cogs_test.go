package cogs

import (
	"context"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func approx(a, b float64) bool { return math.Abs(a-b) < 1e-6 }

// ── Fly ───────────────────────────────────────────────────────────────────────

func TestFlyParsesInvoice(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer tok" {
			t.Errorf("missing/incorrect auth header: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"organization":{"billingInvoices":{"nodes":[{"amountCents":4231,"status":"open","invoicedAt":"2026-06-01"}]}}}}`))
	}))
	defer srv.Close()

	c := NewFlyClient("tok", "acme")
	c.baseURL = srv.URL
	got, err := c.MonthToDateUSD(context.Background())
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !approx(got, 42.31) {
		t.Fatalf("want 42.31, got %v", got)
	}
}

func TestFlyEmptyTokenSentinel(t *testing.T) {
	c := NewFlyClient("", "acme")
	if c.Configured() {
		t.Fatal("expected not configured")
	}
	_, err := c.MonthToDateUSD(context.Background())
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

func TestFlyUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	c := NewFlyClient("bad", "acme")
	c.baseURL = srv.URL
	if _, err := c.MonthToDateUSD(context.Background()); err == nil {
		t.Fatal("expected error on 401")
	}
}

func TestFlyNoInvoiceIsZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":{"organization":{"billingInvoices":{"nodes":[]}}}}`))
	}))
	defer srv.Close()
	c := NewFlyClient("tok", "acme")
	c.baseURL = srv.URL
	got, err := c.MonthToDateUSD(context.Background())
	if err != nil || got != 0 {
		t.Fatalf("want 0,nil got %v,%v", got, err)
	}
}

func TestFlyTimeout(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	}))
	defer srv.Close()
	c := NewFlyClient("tok", "acme")
	c.baseURL = srv.URL
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := c.MonthToDateUSD(ctx); err == nil {
		t.Fatal("expected timeout error")
	}
}

// ── Neon ──────────────────────────────────────────────────────────────────────

func TestNeonParsesConsumption(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer key" {
			t.Errorf("missing/incorrect auth header: %q", got)
		}
		w.Header().Set("Content-Type", "application/json")
		// 7200 compute-seconds = 2 CU-hours → $0.32; storage byte-hours 730 GiB-h
		// → 1 GiB-month → $0.35; transfer 10 GiB → $0.90. Total $1.57.
		w.Write([]byte(`{"projects":[{"project_id":"p1","periods":[{"consumption":[{"compute_time_seconds":7200,"data_storage_bytes_hour_gib":730,"data_transfer_gib":10}]}]}]}`))
	}))
	defer srv.Close()

	c := NewNeonClient("key", "p1")
	c.baseURL = srv.URL
	got, err := c.MonthToDateUSD(context.Background())
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	want := 2*0.16 + 1*0.35 + 10*0.09
	if !approx(got, want) {
		t.Fatalf("want %v, got %v", want, got)
	}
}

func TestNeonEmptyKeySentinel(t *testing.T) {
	c := NewNeonClient("", "p1")
	if c.Configured() {
		t.Fatal("expected not configured")
	}
	if _, err := c.MonthToDateUSD(context.Background()); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

func TestNeonUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()
	c := NewNeonClient("bad", "p1")
	c.baseURL = srv.URL
	if _, err := c.MonthToDateUSD(context.Background()); err == nil {
		t.Fatal("expected error on 403")
	}
}

// ── Projection ────────────────────────────────────────────────────────────────

func TestProjectedMath(t *testing.T) {
	// 10 paid, 90 free, 25 builders, $100 LLM usage.
	p := Projected(ProjectionInput{PaidOrgs: 10, FreeOrgs: 90, Builders: 25, LLMUsageUSD: 100})

	wantFly := 10 * 0.15        // 1.50
	wantNeon := 10*0.20 + 90*0.05 // 2.00 + 4.50 = 6.50
	wantTigris := 10 * 0.02     // 0.20
	wantBuilders := 25 * 0.07   // 1.75
	wantHeadroom := 10 * (0.45 - 0.20 - 0.15 - 0.02) // 10*0.08 = 0.80
	wantLLM := 100 * 0.65       // 65.00

	if !approx(p.FlyProjected, wantFly) {
		t.Errorf("fly want %v got %v", wantFly, p.FlyProjected)
	}
	if !approx(p.NeonProjected, wantNeon) {
		t.Errorf("neon want %v got %v", wantNeon, p.NeonProjected)
	}
	if !approx(p.Tigris, wantTigris) {
		t.Errorf("tigris want %v got %v", wantTigris, p.Tigris)
	}
	if !approx(p.Builders, wantBuilders) {
		t.Errorf("builders want %v got %v", wantBuilders, p.Builders)
	}
	if !approx(p.Headroom, wantHeadroom) {
		t.Errorf("headroom want %v got %v", wantHeadroom, p.Headroom)
	}
	if !approx(p.LLM, wantLLM) {
		t.Errorf("llm want %v got %v", wantLLM, p.LLM)
	}
	wantTotal := wantFly + wantNeon + wantTigris + wantBuilders + wantHeadroom + wantLLM
	if !approx(p.Total, wantTotal) {
		t.Errorf("total want %v got %v", wantTotal, p.Total)
	}
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

func TestReconcileWithinModel(t *testing.T) {
	// actual 110, projected 100 → within (≤120), variance +10 = 10%.
	r := Reconcile(110, 100, 1000)
	if !approx(r.VarianceUSD, 10) {
		t.Errorf("variance want 10 got %v", r.VarianceUSD)
	}
	if !approx(r.VariancePct, 10) {
		t.Errorf("variancePct want 10 got %v", r.VariancePct)
	}
	if !r.WithinModel {
		t.Error("expected within model at 110/100")
	}
	// gross margin = (1000-110)/1000 = 89%
	if !approx(r.GrossMarginPct, 89) {
		t.Errorf("margin want 89 got %v", r.GrossMarginPct)
	}
}

func TestReconcileOverModel(t *testing.T) {
	r := Reconcile(130, 100, 1000) // 130 > 120 → over
	if r.WithinModel {
		t.Error("expected over-model at 130/100")
	}
}

func TestReconcileZeroProjected(t *testing.T) {
	if r := Reconcile(0, 0, 0); !r.WithinModel {
		t.Error("0 actual / 0 projected should be within model")
	}
	if r := Reconcile(5, 0, 0); r.WithinModel {
		t.Error("nonzero actual / 0 projected should be over model")
	}
}
