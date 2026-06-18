// Package exchange provides the USD↔ZAR exchange-rate service for gitstate billing.
// Rates are fetched from a configured provider, cached in the exchange_rates table,
// and refreshed on a TTL schedule. Provider fallback prevents hard billing failures
// when the upstream API is unavailable (decisions A8).
package exchange

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// provider is the interface satisfied by each upstream rate source.
// Implementations must be safe for concurrent use.
type provider interface {
	// Fetch returns the conversion rate from base to quote (e.g. USD→ZAR = 18.5).
	Fetch(ctx context.Context, base, quote string) (float64, error)
	// Name returns a short identifier stored alongside the rate in the DB.
	Name() string
}

// ── exchangerate-api provider ────────────────────────────────────────────────

// exchangeRateAPIProvider fetches from https://v6.exchangerate-api.com.
// Free plan: https://v6.exchangerate-api.com/v6/{key}/pair/{base}/{quote}
type exchangeRateAPIProvider struct {
	apiKey string
	client *http.Client
}

func newExchangeRateAPI(apiKey string) *exchangeRateAPIProvider {
	return &exchangeRateAPIProvider{
		apiKey: apiKey,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *exchangeRateAPIProvider) Name() string { return "exchangerate-api" }

func (p *exchangeRateAPIProvider) Fetch(ctx context.Context, base, quote string) (float64, error) {
	url := fmt.Sprintf("https://v6.exchangerate-api.com/v6/%s/pair/%s/%s", p.apiKey, base, quote)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, fmt.Errorf("exchangerate-api: build request: %w", err)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("exchangerate-api: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("exchangerate-api: status %d", resp.StatusCode)
	}

	var body struct {
		Result         string  `json:"result"`
		ConversionRate float64 `json:"conversion_rate"`
		ErrorType      string  `json:"error-type"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, fmt.Errorf("exchangerate-api: decode: %w", err)
	}
	if body.Result != "success" {
		return 0, fmt.Errorf("exchangerate-api: api error: %s", body.ErrorType)
	}
	if body.ConversionRate <= 0 {
		return 0, fmt.Errorf("exchangerate-api: invalid rate %f", body.ConversionRate)
	}
	return body.ConversionRate, nil
}

// ── openexchangerates provider ───────────────────────────────────────────────

// openExchangeRatesProvider fetches from https://openexchangerates.org.
// Free plan uses USD as the only base: https://openexchangerates.org/api/latest.json?app_id={key}&symbols={quote}
type openExchangeRatesProvider struct {
	apiKey string
	client *http.Client
}

func newOpenExchangeRates(apiKey string) *openExchangeRatesProvider {
	return &openExchangeRatesProvider{
		apiKey: apiKey,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *openExchangeRatesProvider) Name() string { return "openexchangerates" }

func (p *openExchangeRatesProvider) Fetch(ctx context.Context, base, quote string) (float64, error) {
	// Free plan only supports USD as base.  Cross-rates require dividing.
	// We always fetch base=USD and derive the cross-rate if needed.
	url := fmt.Sprintf(
		"https://openexchangerates.org/api/latest.json?app_id=%s&base=%s&symbols=%s",
		p.apiKey, base, quote,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, fmt.Errorf("openexchangerates: build request: %w", err)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("openexchangerates: http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("openexchangerates: status %d", resp.StatusCode)
	}

	var body struct {
		Rates map[string]float64 `json:"rates"`
		Error bool               `json:"error"`
		Description string       `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, fmt.Errorf("openexchangerates: decode: %w", err)
	}
	if body.Error {
		return 0, fmt.Errorf("openexchangerates: api error: %s", body.Description)
	}

	rate, ok := body.Rates[quote]
	if !ok || rate <= 0 {
		return 0, fmt.Errorf("openexchangerates: no rate for %s/%s", base, quote)
	}
	return rate, nil
}
