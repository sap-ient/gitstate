// Package capacity — pure unit tests for the availability/leave math. These
// exercise the DB-free helpers (availableHours, calcLeaveHours, isoWeekday, date
// clamps) directly; no DATABASE_URL or Postgres required.
package capacity

import (
	"math"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/store"
)

func day(y int, m time.Month, d int) time.Time {
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func almostEqual(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

var monFri = []int32{1, 2, 3, 4, 5}

// ── isoWeekday ──────────────────────────────────────────────────────────────

func TestIsoWeekday(t *testing.T) {
	// 2026-06-15 is a Monday.
	cases := []struct {
		date time.Time
		want int32
	}{
		{day(2026, 6, 15), 1}, // Mon
		{day(2026, 6, 16), 2}, // Tue
		{day(2026, 6, 17), 3}, // Wed
		{day(2026, 6, 18), 4}, // Thu
		{day(2026, 6, 19), 5}, // Fri
		{day(2026, 6, 20), 6}, // Sat
		{day(2026, 6, 21), 7}, // Sun → 7, not 0
	}
	for _, c := range cases {
		if got := isoWeekday(c.date); got != c.want {
			t.Errorf("isoWeekday(%s) = %d, want %d", c.date.Format("Mon 2006-01-02"), got, c.want)
		}
	}
}

// ── availableHours ──────────────────────────────────────────────────────────

func TestAvailableHours_FullWorkWeek(t *testing.T) {
	// Mon 2026-06-15 .. Sat 2026-06-20 exclusive → Mon–Fri = 5 working days.
	// 40 weekly hours / 5 days = 8 daily; 5 working days * 8 = 40.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 20)}
	got := availableHours(p, 40, monFri)
	if !almostEqual(got, 40) {
		t.Errorf("full work week = %v, want 40", got)
	}
}

func TestAvailableHours_SpansWeekend(t *testing.T) {
	// Mon .. next Mon exclusive (7 days) crosses Sat+Sun → still only 5 working days.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	got := availableHours(p, 40, monFri)
	if !almostEqual(got, 40) {
		t.Errorf("week spanning weekend = %v, want 40 (weekend excluded)", got)
	}
}

func TestAvailableHours_WeekendOnly(t *testing.T) {
	// Sat .. Mon exclusive = Sat+Sun, both non-working → 0 hours.
	p := Period{Start: day(2026, 6, 20), End: day(2026, 6, 22)}
	if got := availableHours(p, 40, monFri); !almostEqual(got, 0) {
		t.Errorf("weekend-only = %v, want 0", got)
	}
}

func TestAvailableHours_HalfOpenExcludesEnd(t *testing.T) {
	// [Mon, Tue) is a single day (Mon). 8 daily hours.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 16)}
	if got := availableHours(p, 40, monFri); !almostEqual(got, 8) {
		t.Errorf("single Mon = %v, want 8 (end exclusive)", got)
	}
}

func TestAvailableHours_EmptyPeriod(t *testing.T) {
	// Start == End → no days at all.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 15)}
	if got := availableHours(p, 40, monFri); !almostEqual(got, 0) {
		t.Errorf("empty period = %v, want 0", got)
	}
}

func TestAvailableHours_NoWorkingDays(t *testing.T) {
	// No working days configured → 0 (and no div-by-zero).
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	if got := availableHours(p, 40, nil); !almostEqual(got, 0) {
		t.Errorf("no working days = %v, want 0", got)
	}
}

func TestAvailableHours_CustomWorkingDays(t *testing.T) {
	// 4-day week (Mon–Thu), 32 weekly hours → 8/day. Full Mon–Sun period → 4 days.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	got := availableHours(p, 32, []int32{1, 2, 3, 4})
	if !almostEqual(got, 32) {
		t.Errorf("4-day week = %v, want 32", got)
	}
}

// ── calcLeaveHours ──────────────────────────────────────────────────────────

func leave(start, end time.Time) *store.LeaveEntry {
	return &store.LeaveEntry{StartDate: start, EndDate: end, Status: "approved"}
}

func TestCalcLeaveHours_InclusiveEndDate(t *testing.T) {
	// A single-day leave (Start==End) is INCLUSIVE: one working day blocked = 8h.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 16), day(2026, 6, 16))} // Tue only
	got := calcLeaveHours(leaves, p, 40, monFri)
	if !almostEqual(got, 8) {
		t.Errorf("single inclusive day = %v, want 8", got)
	}
}

func TestCalcLeaveHours_MultiDaySpan(t *testing.T) {
	// Tue..Thu inclusive = 3 working days * 8h = 24h.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 16), day(2026, 6, 18))}
	if got := calcLeaveHours(leaves, p, 40, monFri); !almostEqual(got, 24) {
		t.Errorf("Tue..Thu = %v, want 24", got)
	}
}

func TestCalcLeaveHours_LeaveOverWeekend(t *testing.T) {
	// Fri..Mon inclusive spans Sat+Sun (non-working). Only Fri + Mon count = 16h.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 23)}
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 19), day(2026, 6, 22))} // Fri..Mon
	if got := calcLeaveHours(leaves, p, 40, monFri); !almostEqual(got, 16) {
		t.Errorf("leave over weekend = %v, want 16 (weekend excluded)", got)
	}
}

func TestCalcLeaveHours_ClampedToPeriod(t *testing.T) {
	// Leave Sat-before .. Wed, but period starts Mon and ends Tue (exclusive).
	// Overlap working days inside [Mon, Tue) = just Mon = 8h.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 16)} // [Mon, Tue)
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 13), day(2026, 6, 17))}
	if got := calcLeaveHours(leaves, p, 40, monFri); !almostEqual(got, 8) {
		t.Errorf("clamped leave = %v, want 8", got)
	}
}

func TestCalcLeaveHours_NoOverlap(t *testing.T) {
	// Leave entirely before the period → 0.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 1), day(2026, 6, 5))}
	if got := calcLeaveHours(leaves, p, 40, monFri); !almostEqual(got, 0) {
		t.Errorf("non-overlapping leave = %v, want 0", got)
	}
}

func TestCalcLeaveHours_NoWorkingDays(t *testing.T) {
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 16), day(2026, 6, 18))}
	if got := calcLeaveHours(leaves, p, 40, nil); !almostEqual(got, 0) {
		t.Errorf("no working days = %v, want 0", got)
	}
}

func TestCalcLeaveHours_MultipleLeavesSum(t *testing.T) {
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 30)}
	leaves := []*store.LeaveEntry{
		leave(day(2026, 6, 16), day(2026, 6, 16)), // Tue = 8
		leave(day(2026, 6, 18), day(2026, 6, 19)), // Thu+Fri = 16
	}
	if got := calcLeaveHours(leaves, p, 40, monFri); !almostEqual(got, 24) {
		t.Errorf("multiple leaves = %v, want 24", got)
	}
}

// ── Effective math (availability − leave, floored at 0) ─────────────────────

func TestEffectiveMath_LeaveExceedsAvailability(t *testing.T) {
	// The EffectiveCapacity service floors effective at 0; replicate that logic on
	// the pure outputs to assert the contract without a DB.
	p := Period{Start: day(2026, 6, 15), End: day(2026, 6, 22)}
	avail := availableHours(p, 40, monFri) // 40
	// Leave covering the whole work week = 40h; effective should not go negative.
	leaves := []*store.LeaveEntry{leave(day(2026, 6, 15), day(2026, 6, 19))}
	lv := calcLeaveHours(leaves, p, 40, monFri) // 40
	eff := avail - lv
	if eff < 0 {
		eff = 0
	}
	if !almostEqual(eff, 0) {
		t.Errorf("effective = %v, want 0 (full week off)", eff)
	}
}

// ── date helpers ────────────────────────────────────────────────────────────

func TestDateHelpers(t *testing.T) {
	a := day(2026, 6, 15)
	b := day(2026, 6, 20)
	if !maxDate(a, b).Equal(b) {
		t.Error("maxDate wrong")
	}
	if !minDate(a, b).Equal(a) {
		t.Error("minDate wrong")
	}
	if !nextDay(a).Equal(day(2026, 6, 16)) {
		t.Error("nextDay wrong")
	}
	// Equal inputs: max/min return the first.
	if !maxDate(a, a).Equal(a) || !minDate(a, a).Equal(a) {
		t.Error("equal-date max/min wrong")
	}
}

func TestToSet(t *testing.T) {
	s := toSet([]int32{1, 3, 5})
	for _, d := range []int32{1, 3, 5} {
		if !s[d] {
			t.Errorf("toSet missing %d", d)
		}
	}
	for _, d := range []int32{2, 4, 6, 7} {
		if s[d] {
			t.Errorf("toSet should not contain %d", d)
		}
	}
}

// ── DeriveFromCommits stub ──────────────────────────────────────────────────

func TestDeriveFromCommits_Stub(t *testing.T) {
	drafts, err := DeriveFromCommits(nil, nil, "org", Period{})
	if err != nil {
		t.Errorf("stub should not error, got %v", err)
	}
	if len(drafts) != 0 {
		t.Errorf("stub should return no drafts, got %d", len(drafts))
	}
}
