package cogs

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// NeonClient pulls month-to-date compute + storage spend for a Neon project.
//
// Endpoint: Neon's consumption API,
//
//	GET https://console.neon.tech/api/v2/consumption_history/projects?project_ids=<id>&from=<RFC3339>&to=<RFC3339>&granularity=monthly
//
// authenticated with `Authorization: Bearer NEON_API_KEY`. The response reports
// metered usage units per period (compute seconds, storage byte-hours, data
// transfer). Neon does not return a dollar figure, so we price the units with
// Neon's published Scale-plan rates (see neonPricing below) to derive the
// current-period USD cost. Those rates are the swap point if Neon changes
// pricing; the MonthToDateUSD signature stays stable for the dashboard.
type NeonClient struct {
	apiKey    string // NEON_API_KEY — never logged
	projectID string // NEON_PROJECT_ID
	baseURL   string // consumption endpoint base; overridable for tests
	http      *http.Client
	now       func() time.Time // injectable for deterministic period bounds in tests
}

// neonPricing holds the per-unit USD rates used to convert Neon's metered usage
// into dollars. Defaults track Neon's published list pricing; adjust here if the
// plan/rates change.
type neonPricing struct {
	computePerHour    float64 // USD per compute-unit hour (CU-hour)
	storagePerGiBMo   float64 // USD per GiB-month of storage
	transferPerGiB    float64 // USD per GiB egress
}

var defaultNeonPricing = neonPricing{
	computePerHour:  0.16,  // ~$0.16 / CU-hour (Neon list)
	storagePerGiBMo: 0.35,  // ~$0.35 / GiB-month
	transferPerGiB:  0.09,  // ~$0.09 / GiB egress
}

// NewNeonClient builds a Neon consumption client. When apiKey is empty the
// client is constructed but MonthToDateUSD returns ErrNotConfigured.
func NewNeonClient(apiKey, projectID string) *NeonClient {
	return &NeonClient{
		apiKey:    strings.TrimSpace(apiKey),
		projectID: strings.TrimSpace(projectID),
		baseURL:   "https://console.neon.tech/api/v2",
		http:      &http.Client{Timeout: httpTimeout},
		now:       time.Now,
	}
}

// Configured reports whether an API key is present.
func (c *NeonClient) Configured() bool { return c.apiKey != "" }

// neonConsumptionResponse mirrors the consumption_history/projects payload.
type neonConsumptionResponse struct {
	Projects []struct {
		ProjectID string `json:"project_id"`
		Periods   []struct {
			Consumption []struct {
				// Metered usage for the period.
				ComputeTimeSeconds  int64 `json:"compute_time_seconds"`
				SyntheticStorageGiB float64 `json:"synthetic_storage_size_gib"`
				DataStorageGiBHour  float64 `json:"data_storage_bytes_hour_gib"`
				DataTransferGiB     float64 `json:"data_transfer_gib"`
			} `json:"consumption"`
		} `json:"periods"`
	} `json:"projects"`
}

// MonthToDateUSD returns the current calendar month's Neon spend in USD for the
// configured project. Returns ErrNotConfigured when no API key is set.
func (c *NeonClient) MonthToDateUSD(ctx context.Context) (float64, error) {
	if c.apiKey == "" {
		return 0, ErrNotConfigured
	}

	now := c.now().UTC()
	from := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	q := url.Values{}
	q.Set("project_ids", c.projectID)
	q.Set("from", from.Format(time.RFC3339))
	q.Set("to", now.Format(time.RFC3339))
	q.Set("granularity", "monthly")

	endpoint := c.baseURL + "/consumption_history/projects?" + q.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, fmt.Errorf("neon: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return 0, fmt.Errorf("neon: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return 0, fmt.Errorf("neon: unauthorized (status %d) — check NEON_API_KEY", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("neon: unexpected status %d", resp.StatusCode)
	}

	var parsed neonConsumptionResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return 0, fmt.Errorf("neon: decode response: %w", err)
	}

	return priceNeonUsage(parsed, defaultNeonPricing), nil
}

// priceNeonUsage converts metered consumption into a USD figure. Compute is
// billed per CU-hour, storage per GiB-month, transfer per GiB. We sum across all
// returned periods/projects (the month-to-date window normally yields one).
func priceNeonUsage(r neonConsumptionResponse, p neonPricing) float64 {
	var usd float64
	for _, proj := range r.Projects {
		for _, period := range proj.Periods {
			for _, c := range period.Consumption {
				computeHours := float64(c.ComputeTimeSeconds) / 3600.0
				// Prefer the byte-hour storage signal; fall back to the
				// synthetic point-in-time size when byte-hours are absent.
				storageGiBMo := c.DataStorageGiBHour / 730.0 // 730 h ≈ 1 month
				if storageGiBMo == 0 {
					storageGiBMo = c.SyntheticStorageGiB
				}
				usd += computeHours * p.computePerHour
				usd += storageGiBMo * p.storagePerGiBMo
				usd += c.DataTransferGiB * p.transferPerGiB
			}
		}
	}
	return usd
}
