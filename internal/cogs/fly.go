// Package cogs computes and reconciles gitstate's cloud cost-of-goods-sold:
// the ACTUAL month-to-date infra spend pulled from the Fly.io and Neon billing
// APIs, the PROJECTED spend from the billsim model, and the resulting real
// gross margin against MRR.
//
// Every network client here is built on the standard library only, isolates the
// upstream API behind a small MonthToDateUSD(ctx) method so the exact endpoint
// is swappable, and degrades gracefully: a missing credential returns the typed
// ErrNotConfigured sentinel (so the dashboard renders "projection only" rather
// than erroring) and any network/parse failure returns a plain error that the
// page surfaces inline without breaking. Tokens and keys are NEVER logged.
package cogs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ErrNotConfigured is returned by a billing client's MonthToDateUSD when the
// required credential is empty. Callers should treat it as "no actual data —
// fall back to the projection" rather than a hard error. Use errors.Is to test.
var ErrNotConfigured = errors.New("cogs: billing source not configured")

// httpTimeout bounds every outbound billing call so a dead/slow upstream API
// can never block the admin page beyond this window.
const httpTimeout = 6 * time.Second

// FlyClient pulls month-to-date spend for a Fly.io organization.
//
// Endpoint: Fly bills via its GraphQL API at https://api.fly.io/graphql. We
// query the organization's `billingInvoices` (the current open/draft invoice
// carries the month-to-date amount in cents). The query is the single source of
// truth for "what Fly will charge us this month".
//
// To swap the source (e.g. a future REST usage endpoint), replace the body of
// MonthToDateUSD — the method signature is the stable seam the dashboard binds
// to. baseURL is overridable for tests.
type FlyClient struct {
	token   string // FLY_API_TOKEN — never logged
	orgSlug string // FLY_ORG_SLUG
	baseURL string // GraphQL endpoint; defaults to https://api.fly.io/graphql
	http    *http.Client
}

// NewFlyClient builds a Fly billing client. When token is empty the client is
// still constructed but MonthToDateUSD returns ErrNotConfigured.
func NewFlyClient(token, orgSlug string) *FlyClient {
	return &FlyClient{
		token:   strings.TrimSpace(token),
		orgSlug: strings.TrimSpace(orgSlug),
		baseURL: "https://api.fly.io/graphql",
		http:    &http.Client{Timeout: httpTimeout},
	}
}

// Configured reports whether a token is present.
func (c *FlyClient) Configured() bool { return c.token != "" }

// flyGraphQLResponse mirrors the shape of the Fly GraphQL billing query.
type flyGraphQLResponse struct {
	Data struct {
		Organization struct {
			BillingInvoices struct {
				Nodes []struct {
					// Amount is the invoice total in USD cents.
					AmountCents int    `json:"amountCents"`
					Status      string `json:"status"`
					InvoicedAt  string `json:"invoicedAt"`
				} `json:"nodes"`
			} `json:"billingInvoices"`
		} `json:"organization"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

// MonthToDateUSD returns the current month's Fly.io spend in USD for the
// configured org. Returns ErrNotConfigured when no token is set.
func (c *FlyClient) MonthToDateUSD(ctx context.Context) (float64, error) {
	if c.token == "" {
		return 0, ErrNotConfigured
	}

	const query = `query($slug:String!){organization(slug:$slug){billingInvoices(first:1){nodes{amountCents status invoicedAt}}}}`
	body, err := json.Marshal(map[string]any{
		"query":     query,
		"variables": map[string]string{"slug": c.orgSlug},
	})
	if err != nil {
		return 0, fmt.Errorf("fly: encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, strings.NewReader(string(body)))
	if err != nil {
		return 0, fmt.Errorf("fly: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		// Never include the request (which carries the token) in the error.
		return 0, fmt.Errorf("fly: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return 0, fmt.Errorf("fly: unauthorized (status %d) — check FLY_API_TOKEN", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("fly: unexpected status %d", resp.StatusCode)
	}

	var parsed flyGraphQLResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return 0, fmt.Errorf("fly: decode response: %w", err)
	}
	if len(parsed.Errors) > 0 {
		return 0, fmt.Errorf("fly: api error: %s", parsed.Errors[0].Message)
	}

	nodes := parsed.Data.Organization.BillingInvoices.Nodes
	if len(nodes) == 0 {
		// No open invoice yet this period → zero spend so far, not an error.
		return 0, nil
	}
	return float64(nodes[0].AmountCents) / 100.0, nil
}
