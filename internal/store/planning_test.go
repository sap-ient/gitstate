// Package store — planning_test.go
// DB-backed test for capacity-aware planning at the store layer:
//   - GetAvailability / ApprovedLeaveInPeriod / SumTimeMinutesInPeriod feed the
//     effective-capacity math; we assert availability minus approved leave for a
//     week, and that approving leave reduces the effective figure.
//   - WeeklyVelocity returns a dense per-week series of merged PRs + done issues.
//   - OpenBacklog returns open/in-progress issues with their effort estimate.
//
// One transaction, always rolled back. RLS enforced under the app role.
package store

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// effectiveWeekHours mirrors the capacity formula at a daily grain over a
// Mon–Fri week: dailyHours = weekly/len(workingDays); count working days that are
// fully off via approved leave and subtract. Kept here so the planning test
// stays inside the store package (the capacity package is out of scope).
func effectiveWeekHours(weeklyHours float64, workingDays map[int]bool, weekStart time.Time, leaves []*LeaveEntry) (avail, leaveHrs float64) {
	daily := weeklyHours / float64(len(workingDays))
	for d := 0; d < 7; d++ {
		day := weekStart.AddDate(0, 0, d)
		iso := int(day.Weekday())
		if iso == 0 {
			iso = 7
		}
		if !workingDays[iso] {
			continue
		}
		avail += daily
		for _, l := range leaves {
			if !day.Before(l.StartDate) && !day.After(l.EndDate) {
				leaveHrs += daily
				break
			}
		}
	}
	return avail, leaveHrs
}

func TestPlanningCapacityAndVelocity(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping planning integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	defer pool.Close()

	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire conn: %v", err)
	}
	defer conn.Release()

	tx, err := conn.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	ns := time.Now().UnixNano()
	var orgID, userID, repoID, projID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("plan-%d", ns), "Plan Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	if _, err := tx.Exec(ctx, "SELECT set_config('app.current_org', $1, true)", orgID); err != nil {
		t.Fatalf("set org: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO users (email, name) VALUES ($1,'Dev') RETURNING id`,
		fmt.Sprintf("plan-u-%d@x.io", ns)).Scan(&userID); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO org_members (org_id, user_id, role) VALUES ($1,$2,'member')`, orgID, userID); err != nil {
		t.Fatalf("member: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/plan') RETURNING id`,
		orgID, fmt.Sprintf("plan-repo-%d", ns)).Scan(&repoID); err != nil {
		t.Fatalf("create repo: %v", err)
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO projects (org_id, name) VALUES ($1,'Mercury') RETURNING id`, orgID).Scan(&projID); err != nil {
		t.Fatalf("create project: %v", err)
	}

	// Availability: 40h/week, Mon–Fri, effective from the start of our test week.
	weekStart := time.Date(2026, 3, 2, 0, 0, 0, 0, time.UTC) // a Monday
	if _, err := UpsertAvailability(ctx, tx, orgID, userID, 40, []int32{1, 2, 3, 4, 5}, weekStart); err != nil {
		t.Fatalf("UpsertAvailability: %v", err)
	}
	weekEnd := weekStart.AddDate(0, 0, 7)

	avail, err := GetAvailability(ctx, tx, orgID, userID, weekEnd)
	if err != nil {
		t.Fatalf("GetAvailability: %v", err)
	}
	if avail.WeeklyHours != 40 {
		t.Errorf("weekly hours = %v, want 40", avail.WeeklyHours)
	}

	workDays := map[int]bool{1: true, 2: true, 3: true, 4: true, 5: true}

	// No leave yet → effective = 40 (5 working days × 8h).
	noLeave, err := ApprovedLeaveInPeriod(ctx, tx, orgID, userID, weekStart, weekEnd)
	if err != nil {
		t.Fatalf("ApprovedLeaveInPeriod(none): %v", err)
	}
	a0, l0 := effectiveWeekHours(avail.WeeklyHours, workDays, weekStart, noLeave)
	if a0 != 40 || l0 != 0 {
		t.Fatalf("baseline avail/leave = %v/%v, want 40/0", a0, l0)
	}

	// Create a 2-working-day leave (Tue–Wed Mar 3–4), approve it.
	leaveStart := time.Date(2026, 3, 3, 0, 0, 0, 0, time.UTC)
	leaveEnd := time.Date(2026, 3, 4, 0, 0, 0, 0, time.UTC)
	le, err := CreateLeaveEntry(ctx, tx, orgID, userID, "pto", "", "vacation", leaveStart, leaveEnd, false, "full")
	if err != nil {
		t.Fatalf("CreateLeaveEntry: %v", err)
	}

	// Still pending → no reduction.
	pend, err := ApprovedLeaveInPeriod(ctx, tx, orgID, userID, weekStart, weekEnd)
	if err != nil {
		t.Fatalf("ApprovedLeaveInPeriod(pending): %v", err)
	}
	if len(pend) != 0 {
		t.Errorf("pending leave returned %d approved rows, want 0", len(pend))
	}

	if _, err := ApproveLeaveEntry(ctx, tx, orgID, le.ID, "approved"); err != nil {
		t.Fatalf("ApproveLeaveEntry: %v", err)
	}
	approved, err := ApprovedLeaveInPeriod(ctx, tx, orgID, userID, weekStart, weekEnd)
	if err != nil {
		t.Fatalf("ApprovedLeaveInPeriod(approved): %v", err)
	}
	if len(approved) != 1 {
		t.Fatalf("approved leave rows = %d, want 1", len(approved))
	}
	a1, l1 := effectiveWeekHours(avail.WeeklyHours, workDays, weekStart, approved)
	if a1 != 40 {
		t.Errorf("avail with leave = %v, want 40", a1)
	}
	if l1 != 16 {
		t.Errorf("approved-leave hours = %v, want 16 (2 working days × 8h)", l1)
	}
	effective := a1 - l1
	if effective != 24 {
		t.Errorf("effective capacity = %v, want 24 (40 − 16)", effective)
	}

	// Logged time reads back.
	if _, err := CreateTimeEntry(ctx, tx, orgID, userID, "", "manual", "worked", 300, weekStart); err != nil {
		t.Fatalf("CreateTimeEntry: %v", err)
	}
	mins, err := SumTimeMinutesInPeriod(ctx, tx, orgID, userID, weekStart, weekEnd)
	if err != nil {
		t.Fatalf("SumTimeMinutesInPeriod: %v", err)
	}
	if mins != 300 {
		t.Errorf("logged minutes = %d, want 300", mins)
	}

	// ── WeeklyVelocity: 2 merged PRs + 1 done issue this week. ──
	nowMerge := time.Now().UTC().Add(-24 * time.Hour)
	for i := 0; i < 2; i++ {
		if _, err := tx.Exec(ctx,
			`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, state, merged_at, created_at)
			 VALUES ($1,$2,'github',$3,$4,'pr','merged',$5,$5)`,
			orgID, repoID, fmt.Sprintf("plan-pr-%d-%d", i, ns), i+1, nowMerge); err != nil {
			t.Fatalf("insert pr %d: %v", i, err)
		}
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO issues (org_id, project_id, repo_id, source, title, state, created_at, updated_at)
		 VALUES ($1,$2,$3,'native','done issue','done',$4,$4)`,
		orgID, projID, repoID, nowMerge); err != nil {
		t.Fatalf("insert done issue: %v", err)
	}
	// An open backlog issue with an effort estimate.
	var backlogIssue string
	if err := tx.QueryRow(ctx,
		`INSERT INTO issues (org_id, project_id, repo_id, source, title, state, created_at, updated_at)
		 VALUES ($1,$2,$3,'native','backlog','open',now(),now()) RETURNING id`,
		orgID, projID, repoID).Scan(&backlogIssue); err != nil {
		t.Fatalf("insert open issue: %v", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO effort_estimates (org_id, issue_id, difficulty, model) VALUES ($1,$2,8,'gpt')`,
		orgID, backlogIssue); err != nil {
		t.Fatalf("insert estimate: %v", err)
	}

	vel, err := WeeklyVelocity(ctx, tx, orgID, "", 8)
	if err != nil {
		t.Fatalf("WeeklyVelocity: %v", err)
	}
	var totalPRs, totalIssues int
	for _, v := range vel {
		totalPRs += v.PRs
		totalIssues += v.Issues
	}
	if totalPRs != 2 {
		t.Errorf("velocity merged PRs total = %d, want 2", totalPRs)
	}
	if totalIssues != 1 {
		t.Errorf("velocity done issues total = %d, want 1", totalIssues)
	}
	if len(vel) < 2 {
		t.Errorf("velocity series too short (%d) — should be dense weekly", len(vel))
	}

	backlog, err := OpenBacklog(ctx, tx, orgID, projID)
	if err != nil {
		t.Fatalf("OpenBacklog: %v", err)
	}
	if len(backlog) != 1 {
		t.Fatalf("backlog issues = %d, want 1 (open only)", len(backlog))
	}
	if backlog[0].Difficulty == nil || *backlog[0].Difficulty != 8 {
		t.Errorf("backlog difficulty = %v, want 8", backlog[0].Difficulty)
	}

	t.Logf("planning OK: effective=%vh (40−16 leave); velocity PRs=%d issues=%d; backlog=%d",
		effective, totalPRs, totalIssues, len(backlog))
}
