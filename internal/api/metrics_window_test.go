// Package api — metrics_window_test.go
// Pure unit tests for the involvement window helpers. No DB, no HTTP.
//
// These guard the bug where the UI sent relative period tokens (7d/30d/90d) that
// the old handler tried to parse as YYYY-MM-DD, silently failing → no period
// filter → every historical row returned (one card per person × month × project).
package api

import (
	"testing"
	"time"
)

func TestInvolvementWindowStart(t *testing.T) {
	now := time.Date(2026, 6, 18, 15, 0, 0, 0, time.UTC)
	cases := []struct {
		period string
		want   time.Time
	}{
		// 30d default: 2026-06-18 − 30d = 2026-05-19 → month start 2026-05-01.
		{"", time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
		{"30d", time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
		// 7d: 2026-06-11 → month start 2026-06-01.
		{"7d", time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)},
		// 90d: 2026-03-20 → month start 2026-03-01.
		{"90d", time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)},
		// explicit date → its month start.
		{"2026-02-14", time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC)},
		// unknown token → 30d default behaviour.
		{"garbage", time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)},
	}
	for _, c := range cases {
		t.Run(c.period, func(t *testing.T) {
			got := involvementWindowStart(c.period, now)
			if !got.Equal(c.want) {
				t.Errorf("involvementWindowStart(%q) = %v, want %v", c.period, got, c.want)
			}
		})
	}
}

func TestMonthsInWindow(t *testing.T) {
	now := time.Date(2026, 6, 18, 0, 0, 0, 0, time.UTC)
	start := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	got := monthsInWindow(start, now)
	want := []time.Time{
		time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
	}
	if len(got) != len(want) {
		t.Fatalf("monthsInWindow len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if !got[i].Equal(want[i]) {
			t.Errorf("month[%d] = %v, want %v", i, got[i], want[i])
		}
	}

	// Same month → exactly one entry.
	one := monthsInWindow(now, now)
	if len(one) != 1 {
		t.Errorf("same-month window len = %d, want 1", len(one))
	}
}
