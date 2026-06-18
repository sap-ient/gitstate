// Package store — capacity CRUD.
// All functions run inside a db.WithOrg transaction (RLS boundary set).
package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// ── Leave entries ─────────────────────────────────────────────────────────

// LeaveEntry mirrors a row from leave_entries.
type LeaveEntry struct {
	ID        string
	OrgID     string
	UserID    string
	Kind      string    // pto | sick | holiday
	StartDate time.Time // date stored as timestamptz midnight UTC
	EndDate   time.Time
	Status    string // pending | approved | rejected
	Note      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ListLeaveEntries returns all leave entries for the org, optionally filtered
// to a single user when userID is non-empty.
func ListLeaveEntries(ctx context.Context, tx pgx.Tx, orgID, userID string) ([]*LeaveEntry, error) {
	query := `
		SELECT id, org_id, user_id, kind, start_date, end_date, status, COALESCE(note,''), created_at, updated_at
		FROM leave_entries
		WHERE org_id = $1`
	args := []any{orgID}
	if userID != "" {
		query += ` AND user_id = $2`
		args = append(args, userID)
	}
	query += ` ORDER BY start_date DESC`

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*LeaveEntry
	for rows.Next() {
		var e LeaveEntry
		if err := rows.Scan(
			&e.ID, &e.OrgID, &e.UserID, &e.Kind,
			&e.StartDate, &e.EndDate, &e.Status, &e.Note,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

// CreateLeaveEntry inserts a new leave entry.
func CreateLeaveEntry(ctx context.Context, tx pgx.Tx, orgID, userID, kind, note string, start, end time.Time) (*LeaveEntry, error) {
	var e LeaveEntry
	err := tx.QueryRow(ctx, `
		INSERT INTO leave_entries (org_id, user_id, kind, start_date, end_date, note)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6,''))
		RETURNING id, org_id, user_id, kind, start_date, end_date, status, COALESCE(note,''), created_at, updated_at`,
		orgID, userID, kind, start, end, note).
		Scan(
			&e.ID, &e.OrgID, &e.UserID, &e.Kind,
			&e.StartDate, &e.EndDate, &e.Status, &e.Note,
			&e.CreatedAt, &e.UpdatedAt,
		)
	return &e, err
}

// ApproveLeaveEntry sets the status of a leave entry (approved | rejected).
func ApproveLeaveEntry(ctx context.Context, tx pgx.Tx, orgID, id, status string) (*LeaveEntry, error) {
	var e LeaveEntry
	err := tx.QueryRow(ctx, `
		UPDATE leave_entries
		SET status = $1, updated_at = now()
		WHERE id = $2 AND org_id = $3
		RETURNING id, org_id, user_id, kind, start_date, end_date, status, COALESCE(note,''), created_at, updated_at`,
		status, id, orgID).
		Scan(
			&e.ID, &e.OrgID, &e.UserID, &e.Kind,
			&e.StartDate, &e.EndDate, &e.Status, &e.Note,
			&e.CreatedAt, &e.UpdatedAt,
		)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &e, err
}

// ApprovedLeaveInPeriod returns approved leave entries for a user that overlap
// the half-open period [from, to).
func ApprovedLeaveInPeriod(ctx context.Context, tx pgx.Tx, orgID, userID string, from, to time.Time) ([]*LeaveEntry, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, org_id, user_id, kind, start_date, end_date, status, COALESCE(note,''), created_at, updated_at
		FROM leave_entries
		WHERE org_id = $1
		  AND user_id = $2
		  AND status = 'approved'
		  AND start_date < $4
		  AND end_date   >= $3
		ORDER BY start_date`,
		orgID, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*LeaveEntry
	for rows.Next() {
		var e LeaveEntry
		if err := rows.Scan(
			&e.ID, &e.OrgID, &e.UserID, &e.Kind,
			&e.StartDate, &e.EndDate, &e.Status, &e.Note,
			&e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

// ── Availability ──────────────────────────────────────────────────────────

// Availability mirrors a row from the availability table.
type Availability struct {
	ID            string
	OrgID         string
	UserID        string
	WeeklyHours   float64
	WorkingDays   []int32 // ISO weekday numbers: 1=Mon…7=Sun
	EffectiveFrom time.Time
	CreatedAt     time.Time
}

// GetAvailability returns the most-recent availability row effective on or before
// asOf for a given member. Returns ErrNotFound if no row exists.
func GetAvailability(ctx context.Context, tx pgx.Tx, orgID, userID string, asOf time.Time) (*Availability, error) {
	var a Availability
	err := tx.QueryRow(ctx, `
		SELECT id, org_id, user_id, weekly_hours, working_days, effective_from, created_at
		FROM availability
		WHERE org_id = $1 AND user_id = $2 AND effective_from <= $3
		ORDER BY effective_from DESC
		LIMIT 1`,
		orgID, userID, asOf).
		Scan(&a.ID, &a.OrgID, &a.UserID, &a.WeeklyHours, &a.WorkingDays, &a.EffectiveFrom, &a.CreatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &a, err
}

// ListAvailability returns all availability rows for a user, newest first.
func ListAvailability(ctx context.Context, tx pgx.Tx, orgID, userID string) ([]*Availability, error) {
	rows, err := tx.Query(ctx, `
		SELECT id, org_id, user_id, weekly_hours, working_days, effective_from, created_at
		FROM availability
		WHERE org_id = $1 AND user_id = $2
		ORDER BY effective_from DESC`,
		orgID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Availability
	for rows.Next() {
		var a Availability
		if err := rows.Scan(&a.ID, &a.OrgID, &a.UserID, &a.WeeklyHours, &a.WorkingDays, &a.EffectiveFrom, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, &a)
	}
	return out, rows.Err()
}

// UpsertAvailability inserts a new availability row (a more recent effective_from
// supersedes the old one by query logic — no UPSERT needed since each row is a
// point-in-time snapshot).
func UpsertAvailability(ctx context.Context, tx pgx.Tx, orgID, userID string, weeklyHours float64, workingDays []int32, effectiveFrom time.Time) (*Availability, error) {
	var a Availability
	err := tx.QueryRow(ctx, `
		INSERT INTO availability (org_id, user_id, weekly_hours, working_days, effective_from)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT DO NOTHING
		RETURNING id, org_id, user_id, weekly_hours, working_days, effective_from, created_at`,
		orgID, userID, weeklyHours, workingDays, effectiveFrom).
		Scan(&a.ID, &a.OrgID, &a.UserID, &a.WeeklyHours, &a.WorkingDays, &a.EffectiveFrom, &a.CreatedAt)
	if err == pgx.ErrNoRows {
		// Row already existed for this effective_from; fetch it.
		return GetAvailability(ctx, tx, orgID, userID, effectiveFrom)
	}
	return &a, err
}

// ── Time entries ──────────────────────────────────────────────────────────

// TimeEntry mirrors a row from time_entries.
type TimeEntry struct {
	ID         string
	OrgID      string
	UserID     string
	IssueID    string // may be empty
	Source     string // git | manual
	Minutes    int
	OccurredOn time.Time
	Note       string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// ListTimeEntries returns time entries for the org, optionally scoped to a user.
func ListTimeEntries(ctx context.Context, tx pgx.Tx, orgID, userID string) ([]*TimeEntry, error) {
	query := `
		SELECT id, org_id, user_id, COALESCE(issue_id::text,''), source, minutes,
		       occurred_on, COALESCE(note,''), created_at, updated_at
		FROM time_entries
		WHERE org_id = $1`
	args := []any{orgID}
	if userID != "" {
		query += ` AND user_id = $2`
		args = append(args, userID)
	}
	query += ` ORDER BY occurred_on DESC`

	rows, err := tx.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*TimeEntry
	for rows.Next() {
		var e TimeEntry
		if err := rows.Scan(
			&e.ID, &e.OrgID, &e.UserID, &e.IssueID, &e.Source,
			&e.Minutes, &e.OccurredOn, &e.Note, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, &e)
	}
	return out, rows.Err()
}

// CreateTimeEntry inserts a manual (or git-derived) time entry.
func CreateTimeEntry(ctx context.Context, tx pgx.Tx, orgID, userID, issueID, source, note string, minutes int, occurredOn time.Time) (*TimeEntry, error) {
	var e TimeEntry
	var issueIDArg any
	if issueID != "" {
		issueIDArg = issueID
	}
	err := tx.QueryRow(ctx, `
		INSERT INTO time_entries (org_id, user_id, issue_id, source, minutes, occurred_on, note)
		VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7,''))
		RETURNING id, org_id, user_id, COALESCE(issue_id::text,''), source, minutes,
		          occurred_on, COALESCE(note,''), created_at, updated_at`,
		orgID, userID, issueIDArg, source, minutes, occurredOn, note).
		Scan(
			&e.ID, &e.OrgID, &e.UserID, &e.IssueID, &e.Source,
			&e.Minutes, &e.OccurredOn, &e.Note, &e.CreatedAt, &e.UpdatedAt,
		)
	return &e, err
}

// SumTimeMinutesInPeriod returns the total minutes logged by a user in [from, to).
func SumTimeMinutesInPeriod(ctx context.Context, tx pgx.Tx, orgID, userID string, from, to time.Time) (int, error) {
	var total int
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(minutes), 0)
		FROM time_entries
		WHERE org_id = $1
		  AND user_id = $2
		  AND occurred_on >= $3
		  AND occurred_on <  $4`,
		orgID, userID, from, to).Scan(&total)
	return total, err
}
