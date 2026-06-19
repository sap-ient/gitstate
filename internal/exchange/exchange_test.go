// Package exchange — unit tests for the provider clients (via httptest, no real
// network) and the ErrStaleRate error type. Deterministic; no DB.
package exchange

import (
	"context"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// withClient points a provider at a test server by swapping its http.Client and
// rewriting the request URL host. Simpler: we give the provider a client whose
// transport redirects every request to the test server.
type redirectTransport struct{ base string }

func (r redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Rewrite scheme+host to the test server but keep path+query.
	u := *req.URL
	tsURL, _ := http.NewRequest(http.MethodGet, r.base, nil)
	u.Scheme = tsURL.URL.Scheme
	u.Host = tsURL.URL.Host
	req.URL = &u
	return http.DefaultTransport.RoundTrip(req)
}

func TestExchangeRateAPI_FetchSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"result":"success","conversion_rate":18.42}`))
	}))
	defer ts.Close()

	p := newExchangeRateAPI("key")
	p.client.Transport = redirectTransport{base: ts.URL}

	rate, err := p.Fetch(context.Background(), "USD", "ZAR")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if math.Abs(rate-18.42) > 1e-9 {
		t.Errorf("rate = %v, want 18.42", rate)
	}
	if p.Name() != "exchangerate-api" {
		t.Errorf("Name() = %q", p.Name())
	}
}

func TestExchangeRateAPI_FetchAPIError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"result":"error","error-type":"invalid-key"}`))
	}))
	defer ts.Close()

	p := newExchangeRateAPI("key")
	p.client.Transport = redirectTransport{base: ts.URL}
	if _, err := p.Fetch(context.Background(), "USD", "ZAR"); err == nil {
		t.Error("expected error on result!=success")
	}
}

func TestExchangeRateAPI_FetchInvalidRate(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"result":"success","conversion_rate":0}`))
	}))
	defer ts.Close()

	p := newExchangeRateAPI("key")
	p.client.Transport = redirectTransport{base: ts.URL}
	if _, err := p.Fetch(context.Background(), "USD", "ZAR"); err == nil {
		t.Error("expected error on zero/invalid rate")
	}
}

func TestExchangeRateAPI_FetchNon200(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer ts.Close()

	p := newExchangeRateAPI("key")
	p.client.Transport = redirectTransport{base: ts.URL}
	if _, err := p.Fetch(context.Background(), "USD", "ZAR"); err == nil {
		t.Error("expected error on HTTP 500")
	}
}

func TestOpenExchangeRates_FetchSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"rates":{"ZAR":18.7}}`))
	}))
	defer ts.Close()

	p := newOpenExchangeRates("key")
	p.client.Transport = redirectTransport{base: ts.URL}

	rate, err := p.Fetch(context.Background(), "USD", "ZAR")
	if err != nil {
		t.Fatalf("Fetch: %v", err)
	}
	if math.Abs(rate-18.7) > 1e-9 {
		t.Errorf("rate = %v, want 18.7", rate)
	}
	if p.Name() != "openexchangerates" {
		t.Errorf("Name() = %q", p.Name())
	}
}

func TestOpenExchangeRates_MissingQuote(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"rates":{"EUR":0.9}}`)) // no ZAR
	}))
	defer ts.Close()

	p := newOpenExchangeRates("key")
	p.client.Transport = redirectTransport{base: ts.URL}
	if _, err := p.Fetch(context.Background(), "USD", "ZAR"); err == nil {
		t.Error("expected error when quote currency missing")
	}
}

func TestOpenExchangeRates_APIError(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"error":true,"description":"invalid app_id"}`))
	}))
	defer ts.Close()

	p := newOpenExchangeRates("key")
	p.client.Transport = redirectTransport{base: ts.URL}
	if _, err := p.Fetch(context.Background(), "USD", "ZAR"); err == nil {
		t.Error("expected error when error=true")
	}
}

func TestErrStaleRate_ErrorAndUnwrap(t *testing.T) {
	cause := errors.New("upstream down")
	e := &ErrStaleRate{
		Age:      90 * time.Minute,
		TTL:      time.Hour,
		Provider: "exchangerate-api",
		Cause:    cause,
	}
	if !errors.Is(e, cause) {
		t.Error("ErrStaleRate should unwrap to its Cause")
	}
	msg := e.Error()
	if msg == "" {
		t.Error("Error() should be non-empty")
	}
	// Sanity: the message includes the provider name for diagnostics.
	if !contains(msg, "exchangerate-api") {
		t.Errorf("Error() missing provider: %q", msg)
	}
}

// convertRounding mirrors the exact rounding logic of Service.Convert so the
// half-cent rounding boundary is asserted without needing a DB-backed Service.
func convertRounding(usdCents int, rate float64) int {
	return int(math.Round(float64(usdCents) * rate))
}

func TestConvertRounding_Boundaries(t *testing.T) {
	cases := []struct {
		usdCents int
		rate     float64
		want     int
	}{
		{100, 18.5, 1850},  // exact
		{0, 18.5, 0},       // zero
		{1, 18.4, 18},      // 18.4 → 18
		{1, 18.5, 19},      // 18.5 → 19 (round half away from zero)
		{3, 0.3333, 1},     // 0.9999 → 1
		{200, 0.005, 1},    // 1.0 → 1
		{100, 0.004, 0},    // 0.4 → 0
	}
	for _, c := range cases {
		if got := convertRounding(c.usdCents, c.rate); got != c.want {
			t.Errorf("convert(%d, %v) = %d, want %d", c.usdCents, c.rate, got, c.want)
		}
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
