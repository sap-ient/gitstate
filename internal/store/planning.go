// Package store — planning.go
// Read-only helpers that power capacity-aware planning & forecasting:
//   - velocity (recent merged-PR / closed-issue throughput per week),
//   - sized open backlog (effort_estimates where present, median fallback),
//   - org member list for capacity expansion.
//
// All functions run inside a db.WithOrg transaction (org-scoped tx) so RLS
// enforces the org boundary. No writes happen here.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// ── Velocity (delivery rate) ──────────────────────────────────────────────────

// VelocityPoint is the number of completed units in a calendar week.
type VelocityPoint struct {
	WeekStart time.Time `json:"weekStart"`
	Issues    int       `json:"issues"` // issues moved to done/closed that week
	PRs       int       `json:"prs"`    // PRs merged that week
}

// WeeklyVelocity returns, for each of the last n weeks, the count of issues
// completed (done/closed, optionally project-scoped) and pull requests merged.
// Weeks with no activity are present as zero rows so the series is dense.
// Must run inside a db.WithOrg transaction.
func WeeklyVelocity(ctx context.Context, tx pgx.Tx, orgID, projectID string, weeks int) ([]VelocityPoint, error) {
	if weeks <= 0 {
		weeks = 12
	}

	// Build a dense week spine, then LEFT JOIN issue-done and PR-merged counts.
	q := `
		WITH spine AS (
			SELECT generate_series(
				date_trunc('week', now() - make_interval(weeks => $2)),
				date_trunc('week', now()),
				'1 week'::interval
			)::date AS week_start
		),
		issue_done AS (
			SELECT date_trunc('week', updated_at)::date AS week_start, COUNT(*) AS n
			FROM issues
			WHERE org_id = $1
			  AND COALESCE(derived_state, state) IN ('done','closed')
			  AND updated_at >= now() - make_interval(weeks => $2)`

	args := []any{orgID, weeks}
	if projectID != "" {
		args = append(args, projectID)
		q += fmt.Sprintf(`
			  AND project_id = $%d`, len(args))
	}
	q += `
			GROUP BY 1
		),
		pr_merged AS (
			SELECT date_trunc('week', merged_at)::date AS week_start, COUNT(*) AS n
			FROM pull_requests
			WHERE org_id = $1
			  AND state = 'merged'
			  AND merged_at IS NOT NULL
			  AND merged_at >= now() - make_interval(weeks => $2)
			GROUP BY 1
		)
		SELECT s.week_start,
		       COALESCE(i.n, 0) AS issues,
		       COALESCE(p.n, 0) AS prs
		FROM spine s
		LEFT JOIN issue_done i ON i.week_start = s.week_start
		LEFT JOIN pr_merged  p ON p.week_start = s.week_start
		ORDER BY s.week_start`

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("store.planning: weekly velocity: %w", err)
	}
	defer rows.Close()

	var out []VelocityPoint
	for rows.Next() {
		var p VelocityPoint
		if err := rows.Scan(&p.WeekStart, &p.Issues, &p.PRs); err != nil {
			return nil, fmt.Errorf("store.planning: scan velocity point: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ── Backlog (sized open work) ─────────────────────────────────────────────────

// BacklogIssue is an open issue with its best-available effort estimate.
type BacklogIssue struct {
	ID         string    `json:"id"`
	Title      string    `json:"title"`
	State      string    `json:"state"`
	ProjectID  string    `json:"projectId,omitempty"`
	Difficulty *float64  `json:"difficulty"` // nil → no estimate, a fallback is applied by the caller
	CreatedAt  time.Time `json:"createdAt"`
}

// OpenBacklog returns every open / in-progress issue for the org (optionally a
// single project), joined to its most-recent effort estimate where one exists.
// Difficulty is nil when the issue has no estimate; the planning layer applies a
// clearly-labelled median fallback in that case.
// Must run inside a db.WithOrg transaction.
func OpenBacklog(ctx context.Context, tx pgx.Tx, orgID, projectID string) ([]*BacklogIssue, error) {
	q := `
		SELECT i.id,
		       i.title,
		       COALESCE(i.derived_state, i.state) AS eff_state,
		       COALESCE(i.project_id::text, ''),
		       e.difficulty::float8,
		       i.created_at
		FROM issues i
		LEFT JOIN LATERAL (
			SELECT difficulty
			FROM effort_estimates ee
			WHERE ee.org_id = i.org_id AND ee.issue_id = i.id
			ORDER BY ee.created_at DESC
			LIMIT 1
		) e ON true
		WHERE i.org_id = $1
		  AND COALESCE(i.derived_state, i.state) IN ('open','in_progress')`

	args := []any{orgID}
	if projectID != "" {
		args = append(args, projectID)
		q += fmt.Sprintf(`
		  AND i.project_id = $%d`, len(args))
	}
	q += `
		ORDER BY i.created_at ASC`

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("store.planning: open backlog: %w", err)
	}
	defer rows.Close()

	var out []*BacklogIssue
	for rows.Next() {
		var b BacklogIssue
		var diff *float64
		if err := rows.Scan(&b.ID, &b.Title, &b.State, &b.ProjectID, &diff, &b.CreatedAt); err != nil {
			return nil, fmt.Errorf("store.planning: scan backlog issue: %w", err)
		}
		b.Difficulty = diff
		out = append(out, &b)
	}
	return out, rows.Err()
}

// ── Member roster ─────────────────────────────────────────────────────────────

// PlanningMember is a lightweight org member identity for capacity expansion.
type PlanningMember struct {
	UserID string `json:"userId"`
	Name   string `json:"name,omitempty"`
	Email  string `json:"email,omitempty"`
	Role   string `json:"role,omitempty"`
}

// ListPlanningMembers returns the org's members (id + identity) for capacity
// expansion. Must run inside a db.WithOrg transaction.
func ListPlanningMembers(ctx context.Context, tx pgx.Tx, orgID string) ([]*PlanningMember, error) {
	const q = `
		SELECT om.user_id::text,
		       COALESCE(u.name, ''),
		       COALESCE(u.email::text, ''),
		       COALESCE(om.role, '')
		FROM org_members om
		LEFT JOIN users u ON u.id = om.user_id
		WHERE om.org_id = $1
		ORDER BY u.name NULLS LAST`

	rows, err := tx.Query(ctx, q, orgID)
	if err != nil {
		return nil, fmt.Errorf("store.planning: list members: %w", err)
	}
	defer rows.Close()

	var out []*PlanningMember
	for rows.Next() {
		var m PlanningMember
		if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Role); err != nil {
			return nil, fmt.Errorf("store.planning: scan member: %w", err)
		}
		out = append(out, &m)
	}
	return out, rows.Err()
}
