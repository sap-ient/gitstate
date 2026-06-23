// Package store — reviews.go
// Org-scoped persistence for PR/MR review events (the pr_reviews table). These
// power the REAL "reviews done" dimension on the Involvement dashboard — the
// invisible senior work that a commit/PR count alone can never surface
// (decisions P2). Writes run inside db.WithOrg so the org_isolation RLS policy
// is enforced.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// PRReview mirrors the pr_reviews table.
type PRReview struct {
	ID            string
	OrgID         string
	RepoID        string
	PRID          string
	ReviewerLogin string
	State         string // approved | changes_requested | commented | dismissed
	ExternalID    string
	SubmittedAt   time.Time
	CreatedAt     time.Time
}

// PRReviewInput is the payload for UpsertPRReview.
type PRReviewInput struct {
	OrgID         string
	RepoID        string
	PRID          string
	ReviewerLogin string
	State         string
	ExternalID    string
	SubmittedAt   time.Time
}

// UpsertPRReview inserts a review event idempotently. The unique key is
// (org_id, pr_id, reviewer_login, submitted_at), so a re-sync of the same review
// is a no-op (only the mutable state/external_id are refreshed). Must run inside
// db.WithOrg so RLS (FORCE RLS on the app role) sees current_org().
func UpsertPRReview(ctx context.Context, tx pgx.Tx, in PRReviewInput) error {
	state := in.State
	if state == "" {
		state = "commented"
	}
	submitted := in.SubmittedAt
	if submitted.IsZero() {
		submitted = time.Now().UTC()
	}
	var extID *string
	if in.ExternalID != "" {
		extID = &in.ExternalID
	}
	const q = `
		INSERT INTO pr_reviews
			(org_id, repo_id, pr_id, reviewer_login, state, external_id, submitted_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (org_id, pr_id, reviewer_login, submitted_at) DO UPDATE SET
			state       = EXCLUDED.state,
			external_id = COALESCE(EXCLUDED.external_id, pr_reviews.external_id)`
	if _, err := tx.Exec(ctx, q,
		in.OrgID, in.RepoID, in.PRID, in.ReviewerLogin, state, extID, submitted.UTC(),
	); err != nil {
		return fmt.Errorf("store.reviews: upsert review %s/%s: %w", in.PRID, in.ReviewerLogin, err)
	}
	return nil
}

// ListPRReviewsForPR returns all review rows for a single PR. Must run inside
// db.WithOrg. Primarily used by tests + debugging.
func ListPRReviewsForPR(ctx context.Context, qr Querier, orgID, prID string) ([]PRReview, error) {
	const q = `
		SELECT id, org_id, repo_id, pr_id, reviewer_login, state,
		       COALESCE(external_id,''), submitted_at, created_at
		FROM pr_reviews
		WHERE org_id = $1 AND pr_id = $2
		ORDER BY submitted_at ASC`
	rows, err := qr.Query(ctx, q, orgID, prID)
	if err != nil {
		return nil, fmt.Errorf("store.reviews: list for pr %s: %w", prID, err)
	}
	defer rows.Close()
	var out []PRReview
	for rows.Next() {
		var r PRReview
		if err := rows.Scan(
			&r.ID, &r.OrgID, &r.RepoID, &r.PRID, &r.ReviewerLogin, &r.State,
			&r.ExternalID, &r.SubmittedAt, &r.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("store.reviews: scan: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
