// Package capacity provides capacity math: effective availability minus approved leave
// for a period, plus helpers to ingest git-derived time entries.
//
// Formula (decisions P1/P4):
//
//	EffectiveHours(member, period) =
//	    AvailableHours(member, period)          // from availability table
//	  - ApprovedLeaveHours(member, period)      // from leave_entries (status=approved)
//
// AvailableHours is computed by counting working days in the period that fall on
// the member's configured working_days ISO weekdays, then scaling by daily hours
// (weekly_hours / len(working_days)).
//
// ApprovedLeaveHours counts calendar days in the overlap of each approved leave
// block with the period (clamped to the period bounds) that fall on working days,
// then multiplies by daily hours.
//
// Git-derivation is stubbed: DeriveFromCommits returns a slice of candidate
// TimeEntryDraft structs that callers can review before persisting.  Manual entry
// is the primary path today (decisions P1/P4).
package capacity

import (
	"context"
	"time"

	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5"
)

// Period is a half-open date range [Start, End).
type Period struct {
	Start time.Time
	End   time.Time
}

// MemberCapacity is the effective capacity result for a single org member.
type MemberCapacity struct {
	UserID             string
	AvailableHours     float64 // raw available hours in period
	ApprovedLeaveHours float64 // hours blocked by approved leave
	EffectiveHours     float64 // AvailableHours − ApprovedLeaveHours (never < 0)
	LoggedMinutes      int     // actual minutes logged via time_entries
}

// EffectiveCapacity computes MemberCapacity for every member in memberIDs over
// the given period.  All DB access runs inside db.WithOrg (RLS enforced).
//
// Formula:
//
//	EffectiveHours = max(0, AvailableHours − ApprovedLeaveHours)
func EffectiveCapacity(ctx context.Context, database *db.DB, orgID string, period Period, memberIDs []string) ([]*MemberCapacity, error) {
	var results []*MemberCapacity

	err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, uid := range memberIDs {
			avail, err := store.GetAvailability(ctx, tx, orgID, uid, period.End)
			var weeklyHours float64
			var workingDays []int32
			if err == store.ErrNotFound {
				// No availability configured — assume standard 40h / Mon–Fri.
				weeklyHours = 40
				workingDays = []int32{1, 2, 3, 4, 5}
			} else if err != nil {
				return err
			} else {
				weeklyHours = avail.WeeklyHours
				workingDays = avail.WorkingDays
			}

			availHours := availableHours(period, weeklyHours, workingDays)

			leaves, err := store.ApprovedLeaveInPeriod(ctx, tx, orgID, uid, period.Start, period.End)
			if err != nil {
				return err
			}
			leaveHours := calcLeaveHours(leaves, period, weeklyHours, workingDays)

			effective := availHours - leaveHours
			if effective < 0 {
				effective = 0
			}

			logged, err := store.SumTimeMinutesInPeriod(ctx, tx, orgID, uid, period.Start, period.End)
			if err != nil {
				return err
			}

			results = append(results, &MemberCapacity{
				UserID:             uid,
				AvailableHours:     availHours,
				ApprovedLeaveHours: leaveHours,
				EffectiveHours:     effective,
				LoggedMinutes:      logged,
			})
		}
		return nil
	})
	return results, err
}

// availableHours counts the number of working-day hours in [period.Start, period.End).
func availableHours(period Period, weeklyHours float64, workingDays []int32) float64 {
	if len(workingDays) == 0 {
		return 0
	}
	dailyHours := weeklyHours / float64(len(workingDays))
	wdSet := toSet(workingDays)

	count := 0
	for d := period.Start; d.Before(period.End); d = d.AddDate(0, 0, 1) {
		// time.Weekday: 0=Sun,1=Mon...6=Sat → convert to ISO: Mon=1,...,Sun=7
		iso := isoWeekday(d)
		if wdSet[iso] {
			count++
		}
	}
	return float64(count) * dailyHours
}

// calcLeaveHours sums daily hours for every working day covered by approved leave
// that overlaps the period.
func calcLeaveHours(leaves []*store.LeaveEntry, period Period, weeklyHours float64, workingDays []int32) float64 {
	if len(workingDays) == 0 {
		return 0
	}
	dailyHours := weeklyHours / float64(len(workingDays))
	wdSet := toSet(workingDays)

	var total float64
	for _, l := range leaves {
		// Clamp leave block to the period.
		blockStart := maxDate(l.StartDate, period.Start)
		blockEnd := minDate(nextDay(l.EndDate), period.End) // EndDate is inclusive
		for d := blockStart; d.Before(blockEnd); d = d.AddDate(0, 0, 1) {
			if wdSet[isoWeekday(d)] {
				total += dailyHours
			}
		}
	}
	return total
}

// isoWeekday converts a time.Time to an ISO weekday number (1=Mon … 7=Sun).
func isoWeekday(t time.Time) int32 {
	wd := t.Weekday() // 0=Sun
	if wd == time.Sunday {
		return 7
	}
	return int32(wd)
}

func toSet(days []int32) map[int32]bool {
	m := make(map[int32]bool, len(days))
	for _, d := range days {
		m[d] = true
	}
	return m
}

func maxDate(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minDate(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func nextDay(t time.Time) time.Time {
	return t.AddDate(0, 0, 1)
}

// ── Git-derivation stub ───────────────────────────────────────────────────

// TimeEntryDraft is a candidate time entry derived from git activity.
// Callers review these before persisting with store.CreateTimeEntry.
// Git-derivation is the secondary path (decisions P1); manual entry is primary.
type TimeEntryDraft struct {
	UserID     string
	IssueID    string // may be empty
	Source     string // always "git" for derived entries
	Minutes    int
	OccurredOn time.Time
	Note       string // e.g. "derived from commit abc123"
}

// DeriveFromCommits is a stub for git-to-time-entry derivation.
// In a future iteration this will walk the commits table (within the period and
// org) and produce candidate time entries based on commit metadata and diff size.
// For now it returns an empty slice so the primary manual-entry path is exercised.
func DeriveFromCommits(_ context.Context, _ *db.DB, _ string, _ Period) ([]*TimeEntryDraft, error) {
	// TODO(Wave 5+): query commits by org/period, group by author + day,
	// estimate minutes from additions+deletions, return as drafts for human review.
	return nil, nil
}
