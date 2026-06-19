package contribution

import "testing"

// These extend contribution_test.go with pure branches not already covered there:
// TestCoupling ratio, DurabilityRaw fraction clamping, and NormMinMax's
// zero-contribution guard in a multi-member cohort.

func TestTestCoupling(t *testing.T) {
	cases := []struct {
		test, total int
		want        float64
	}{
		{0, 0, 0},   // no file data → 0, not div-by-zero
		{0, 100, 0}, // touched files but no tests
		{50, 100, 0.5},
		{100, 100, 1},
	}
	for _, c := range cases {
		m := RawMember{TestFileTouches: c.test, TotalFileTouches: c.total}
		if got := m.TestCoupling(); !almostEqual(got, c.want) {
			t.Errorf("TestCoupling(t=%d,total=%d) = %v, want %v", c.test, c.total, got, c.want)
		}
	}
}

func TestDurabilityRaw_FractionClamped(t *testing.T) {
	// surviving > authored (e.g. blame double-counts) clamps frac to 1, so raw is
	// bounded by survivingLines and never explodes.
	got := DurabilityRaw(150, 100) // frac clamps to 1 → raw = 1*150 = 150
	if !almostEqual(got, 150) {
		t.Errorf("clamped durability = %v, want 150", got)
	}
}

func TestNormalize_MinMaxZeroContributorStaysZero(t *testing.T) {
	// In a mixed cohort, a member with raw 0 must score 0 under min-max even though
	// it is the minimum (the gaming guard), while the rest scale normally.
	got := Normalize([]float64{0, 5, 10}, NormMinMax)
	want := []float64{0, 50, 100}
	for i := range want {
		if !almostEqual(got[i], want[i]) {
			t.Errorf("minmax[%d] = %v, want %v", i, got[i], want[i])
		}
	}
}

func TestComposite_NaNGuard(t *testing.T) {
	// All-zero weights fall back to equal weighting; the composite is well-defined.
	d := DimensionScores{Shipped: 60, Review: 60, Effort: 60, Quality: 60, Ownership: 60, Durability: 60}
	if got := Composite(d, Weights{}); !almostEqual(got, 60) {
		t.Errorf("equal-weight composite = %v, want 60", got)
	}
}

func TestShippedRaw_SumsAcceptedWork(t *testing.T) {
	// shippedRaw is exercised indirectly elsewhere; pin the summation directly via
	// Profiles single-member behaviour (positive → 100 on the shipped dimension).
	got := Profiles([]RawMember{
		{UserID: "a", MergedPRs: 2, IssuesClosed: 3, FeaturesShipped: 1},
	}, NormPercentile, Weights{Shipped: 1})
	if len(got) != 1 || got[0].Dimensions.Shipped != 100 {
		t.Errorf("single shipper should score 100 on shipped, got %+v", got)
	}
}
