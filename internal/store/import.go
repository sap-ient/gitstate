package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// FindOrCreateProjectByKey returns an existing project matching key (or, when key
// is empty, name) for the org, creating it if absent. Idempotent so re-imports
// reuse the same project rather than duplicating it. Run inside db.WithOrg.
//
// Returns (project, created) where created reports whether a new row was inserted.
func FindOrCreateProjectByKey(ctx context.Context, tx pgx.Tx, orgID, key, name string) (*Project, bool, error) {
	if name == "" {
		name = key
	}

	// Match on key when we have one, otherwise on name. This keeps imported
	// projects stable across repeated imports.
	var (
		p     Project
		query string
		arg   string
	)
	if key != "" {
		query = `SELECT id, org_id, name, COALESCE(key,''), archived, created_at
		         FROM projects WHERE org_id = $1 AND key = $2 LIMIT 1`
		arg = key
	} else {
		query = `SELECT id, org_id, name, COALESCE(key,''), archived, created_at
		         FROM projects WHERE org_id = $1 AND name = $2 LIMIT 1`
		arg = name
	}

	err := tx.QueryRow(ctx, query, orgID, arg).
		Scan(&p.ID, &p.OrgID, &p.Name, &p.Key, &p.Archived, &p.CreatedAt)
	if err == nil {
		return &p, false, nil
	}
	if err != pgx.ErrNoRows {
		return nil, false, fmt.Errorf("store: find project: %w", err)
	}

	created, err := CreateProject(ctx, tx, orgID, name, key)
	if err != nil {
		return nil, false, fmt.Errorf("store: create imported project: %w", err)
	}
	return created, true, nil
}

// ImportedIssue is the input for UpsertImportedIssue.
type ImportedIssue struct {
	OrgID      string
	ProjectID  string // optional
	Source     string // "jira" | "linear"
	ExternalID string // provider key, used with platform for idempotency
	Title      string
	Body       string
	State      string // open | in_progress | done | closed
	Labels     []string
}

// UpsertImportedIssue inserts or updates a single imported issue, keyed on
// (org_id, platform, external_id) so re-importing the same issue updates it in
// place rather than creating a duplicate. The source/platform column is set to
// the provider name ("jira"/"linear") so imported issues coexist with
// git-derived ('git') and manual ('native') issues.
//
// Returns inserted=true when a new row was created, false when an existing one
// was updated. Run inside db.WithOrg.
func UpsertImportedIssue(ctx context.Context, tx pgx.Tx, in ImportedIssue) (inserted bool, err error) {
	labels := in.Labels
	if labels == nil {
		labels = []string{}
	}
	var projectID *string
	if in.ProjectID != "" {
		projectID = &in.ProjectID
	}

	// xmax = 0 on the returned row means the row was freshly inserted (Postgres
	// trick): on an UPDATE path xmax is non-zero.
	const q = `
		INSERT INTO issues
			(org_id, project_id, source, platform, external_id, title, body, state, labels)
		VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (org_id, platform, external_id)
		DO UPDATE SET
			title      = EXCLUDED.title,
			body       = EXCLUDED.body,
			state      = EXCLUDED.state,
			labels     = EXCLUDED.labels,
			project_id = COALESCE(EXCLUDED.project_id, issues.project_id),
			updated_at = now()
		WHERE issues.source = EXCLUDED.source
		RETURNING (xmax = 0)`

	row := tx.QueryRow(ctx, q,
		in.OrgID, projectID, in.Source, in.ExternalID,
		in.Title, in.Body, in.State, labels,
	)
	if err := row.Scan(&inserted); err != nil {
		// No row returned means the conflict matched a non-imported issue (e.g. a
		// git issue with the same external id) and the WHERE guard skipped it.
		if err == pgx.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("store: upsert imported issue %s/%s: %w", in.Source, in.ExternalID, err)
	}
	return inserted, nil
}
