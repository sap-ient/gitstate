// Package metrics — pure unit tests for the DB-free helpers: calendar-month
// period boundaries and the LLM-usage estimator. No DB or LLM required.
package metrics

import (
	"math"
	"testing"
	"time"
)

func TestPeriodEnd(t *testing.T) {
	cases := []struct {
		name  string
		start time.Time
		// want is the last instant of the month: next-month-start minus 1ns.
		want time.Time
	}{
		{
			name:  "june 2026",
			start: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
			want:  time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
		},
		{
			name:  "february non-leap",
			start: time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC),
			want:  time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
		},
		{
			name:  "february leap year",
			start: time.Date(2024, 2, 1, 0, 0, 0, 0, time.UTC),
			want:  time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
		},
		{
			name:  "december rolls year",
			start: time.Date(2026, 12, 1, 0, 0, 0, 0, time.UTC),
			want:  time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond),
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := periodEnd(c.start)
			if !got.Equal(c.want) {
				t.Errorf("periodEnd(%v) = %v, want %v", c.start, got, c.want)
			}
			// The end must be strictly before the next month's first instant.
			nextMonth := c.start.AddDate(0, 1, 0)
			if !got.Before(nextMonth) {
				t.Errorf("periodEnd should be before next month start")
			}
		})
	}
}

func TestLLMEstimateUsage(t *testing.T) {
	const outBudget = 1024.0
	const rate = 4.0 / 1_000_000

	cases := []struct {
		name string
		diff string
	}{
		{"empty diff", ""},
		{"small diff", "small change"},
		{"larger diff", string(make([]byte, 4000))},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			qty, cost := llmEstimateUsage(c.diff)
			wantInput := float64(len(c.diff))/4 + 600
			wantQty := wantInput + outBudget
			if math.Abs(qty-wantQty) > 1e-6 {
				t.Errorf("qty = %v, want %v", qty, wantQty)
			}
			if math.Abs(cost-wantQty*rate) > 1e-12 {
				t.Errorf("cost = %v, want %v", cost, wantQty*rate)
			}
			// Cost and quantity are always positive (overhead + output budget).
			if qty <= 0 || cost <= 0 {
				t.Errorf("qty/cost should be positive: %v / %v", qty, cost)
			}
		})
	}
}

func TestLLMEstimateUsage_GrowsWithDiff(t *testing.T) {
	// A larger diff must never produce a smaller estimate (monotonic).
	smallQ, smallC := llmEstimateUsage("x")
	bigQ, bigC := llmEstimateUsage(string(make([]byte, 10000)))
	if bigQ <= smallQ {
		t.Errorf("qty not monotonic: small=%v big=%v", smallQ, bigQ)
	}
	if bigC <= smallC {
		t.Errorf("cost not monotonic: small=%v big=%v", smallC, bigC)
	}
}
