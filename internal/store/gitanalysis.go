// Package store — gitanalysis.go
// Org-scoped persistence + reads for the deep git-analysis engine
// (internal/gitanalysis): commit_files, author_survival, bug_introductions.
//
// These power the gaming-resistant contribution dimensions:
//   - DURABILITY  : SurvivalByAuthor — does a person's code still exist at HEAD?
//   - QUALITY     : BugIntroCountByAuthor — whose change a later fix had to repair (SZZ)?
//   - TEST-COUPLING: TestCouplingByAuthor — tested-vs-total file-touch ratio.
//
// Every WRITE runs inside db.WithOrg(ctx, orgID, …) so the org_isolation RLS
// policy fires (migration 20260619_010). READS take a store.Querier (satisfied by
// pgx.Tx and *pgxpool.Pool); they MUST be called with the org RLS context set
// (i.e. from inside db.WithOrg) — on a bare pool RLS returns zero rows.
//
// Identity is the lower-cased git author EMAIL (citext columns store it; we still
// normalise in Go for the contribution engine's map keys to line up with
// cmd/seed's member emails).
package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/gitanalysis"
)

// ── Writes (db.WithOrg tx) ────────────────────────────────────────────────────

// UpsertCommitFiles writes per-(commit,file) churn rows. Idempotent on
// (org_id, repo_id, commit_sha, path). Batched for throughput.
func UpsertCommitFiles(ctx context.Context, tx pgx.Tx, orgID, repoID string, files []gitanalysis.CommitFile) error {
	if len(files) == 0 {
		return nil
	}
	const q = `
		INSERT INTO commit_files
		    (org_id, repo_id, commit_sha, author_email, path,
		     additions, deletions, is_test, committed_at)
		VALUES ($1, $2, $3, NULLIF($4,'')::citext, $5, $6, $7, $8, $9)
		ON CONFLICT (org_id, repo_id, commit_sha, path) DO UPDATE SET
		    author_email = EXCLUDED.author_email,
		    additions    = EXCLUDED.additions,
		    deletions    = EXCLUDED.deletions,
		    is_test      = EXCLUDED.is_test,
		    committed_at = EXCLUDED.committed_at`

	batch := &pgx.Batch{}
	for _, f := range files {
		var at any
		if !f.CommittedAt.IsZero() {
			at = f.CommittedAt
		}
		batch.Queue(q, orgID, repoID, f.CommitSHA, strings.ToLower(f.AuthorEmail),
			f.Path, f.Additions, f.Deletions, f.IsTest, at)
	}
	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for range files {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("store.gitanalysis: upsert commit_files: %w", err)
		}
	}
	return nil
}

// UpsertAuthorSurvival writes per-author blame-survival rows. Idempotent on
// (org_id, repo_id, author_email); each call replaces the prior computation.
func UpsertAuthorSurvival(ctx context.Context, tx pgx.Tx, orgID, repoID string, rows []gitanalysis.AuthorSurvival) error {
	if len(rows) == 0 {
		return nil
	}
	const q = `
		INSERT INTO author_survival
		    (org_id, repo_id, author_email, surviving_lines, authored_lines, computed_at)
		VALUES ($1, $2, $3::citext, $4, $5, now())
		ON CONFLICT (org_id, repo_id, author_email) DO UPDATE SET
		    surviving_lines = EXCLUDED.surviving_lines,
		    authored_lines  = EXCLUDED.authored_lines,
		    computed_at     = now()`

	batch := &pgx.Batch{}
	n := 0
	for _, r := range rows {
		email := strings.ToLower(strings.TrimSpace(r.AuthorEmail))
		if email == "" {
			continue // author_email is NOT NULL in this table
		}
		batch.Queue(q, orgID, repoID, email, r.SurvivingLines, r.AuthoredLines)
		n++
	}
	if n == 0 {
		return nil
	}
	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for i := 0; i < n; i++ {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("store.gitanalysis: upsert author_survival: %w", err)
		}
	}
	return nil
}

// UpsertBugIntroductions writes SZZ attributions. Idempotent on
// (org_id, repo_id, introduced_sha, fix_sha).
func UpsertBugIntroductions(ctx context.Context, tx pgx.Tx, orgID, repoID string, rows []gitanalysis.BugIntroduction) error {
	if len(rows) == 0 {
		return nil
	}
	const q = `
		INSERT INTO bug_introductions
		    (org_id, repo_id, author_email, introduced_sha, fix_sha, lines, detected_at)
		VALUES ($1, $2, $3::citext, $4, $5, $6, now())
		ON CONFLICT (org_id, repo_id, introduced_sha, fix_sha) DO UPDATE SET
		    author_email = EXCLUDED.author_email,
		    lines        = EXCLUDED.lines,
		    detected_at  = now()`

	batch := &pgx.Batch{}
	n := 0
	for _, r := range rows {
		email := strings.ToLower(strings.TrimSpace(r.AuthorEmail))
		if email == "" {
			continue // author_email is NOT NULL
		}
		lines := r.Lines
		if lines < 1 {
			lines = 1
		}
		batch.Queue(q, orgID, repoID, email, r.IntroducedSHA, r.FixSHA, lines)
		n++
	}
	if n == 0 {
		return nil
	}
	br := tx.SendBatch(ctx, batch)
	defer br.Close()
	for i := 0; i < n; i++ {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("store.gitanalysis: upsert bug_introductions: %w", err)
		}
	}
	return nil
}

// dbExecer is the minimal surface StoreResult needs from *db.DB without importing
// the db package (which would create an import cycle: db imports nothing here, but
// keeping store free of db keeps layering clean). The real *db.DB satisfies it.
type dbExecer interface {
	WithOrg(ctx context.Context, orgID string, fn func(pgx.Tx) error) error
}

// StoreResult persists an entire gitanalysis.Result for one repo in a single
// org-scoped transaction. database is *db.DB (it satisfies dbExecer). Pass the
// repoID the result was computed for. A nil/empty Result is a no-op.
func StoreResult(ctx context.Context, database dbExecer, orgID, repoID string, res *gitanalysis.Result) error {
	if res == nil {
		return nil
	}
	return database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if err := UpsertCommitFiles(ctx, tx, orgID, repoID, res.CommitFiles); err != nil {
			return err
		}
		if err := UpsertAuthorSurvival(ctx, tx, orgID, repoID, res.Survival); err != nil {
			return err
		}
		if err := UpsertBugIntroductions(ctx, tx, orgID, repoID, res.BugIntros); err != nil {
			return err
		}
		return nil
	})
}

// ── Reads (the contribution engine depends on these signatures) ──────────────

// AuthorSurvivalRow is a per-author durability fact aggregated across all repos
// in the org. SurvivalRatio is surviving/authored (0 when authored==0).
type AuthorSurvivalRow struct {
	AuthorEmail    string
	SurvivingLines int
	AuthoredLines  int
	SurvivalRatio  float64
}

// SurvivalByAuthor returns blame-survival aggregated per author email across the
// org's repos. Must run with the org RLS context set (db.WithOrg). The map key is
// the lower-cased author email (matches cmd/seed member emails).
func SurvivalByAuthor(ctx context.Context, qr Querier, orgID string) (map[string]AuthorSurvivalRow, error) {
	const q = `
		SELECT lower(author_email::text) AS email,
		       SUM(surviving_lines)::bigint,
		       SUM(authored_lines)::bigint
		FROM author_survival
		WHERE org_id = $1
		GROUP BY 1`
	rows, err := qr.Query(ctx, q, orgID)
	if err != nil {
		return nil, fmt.Errorf("store.gitanalysis: survival by author: %w", err)
	}
	defer rows.Close()

	out := map[string]AuthorSurvivalRow{}
	for rows.Next() {
		var email string
		var surviving, authored int64
		if err := rows.Scan(&email, &surviving, &authored); err != nil {
			return nil, fmt.Errorf("store.gitanalysis: scan survival: %w", err)
		}
		if email == "" {
			continue
		}
		ratio := 0.0
		if authored > 0 {
			ratio = float64(surviving) / float64(authored)
		}
		out[email] = AuthorSurvivalRow{
			AuthorEmail:    email,
			SurvivingLines: int(surviving),
			AuthoredLines:  int(authored),
			SurvivalRatio:  ratio,
		}
	}
	return out, rows.Err()
}

// BugIntroCountByAuthor returns, per author email, the number of distinct
// (introduced_sha, fix_sha) bug attributions and the total blamed line count
// across the org's repos. Higher ⇒ more bugs others had to fix (a quality
// signal the contribution engine INVERTS). Must run with the org RLS context set.
//
// The returned maps are keyed by lower-cased author email. The first map is the
// attribution COUNT (rows), the second is the total LINES blamed.
func BugIntroCountByAuthor(ctx context.Context, qr Querier, orgID string) (counts map[string]int, lines map[string]int, err error) {
	const q = `
		SELECT lower(author_email::text) AS email,
		       COUNT(*)::bigint,
		       COALESCE(SUM(lines),0)::bigint
		FROM bug_introductions
		WHERE org_id = $1
		GROUP BY 1`
	rows, qerr := qr.Query(ctx, q, orgID)
	if qerr != nil {
		return nil, nil, fmt.Errorf("store.gitanalysis: bug intro by author: %w", qerr)
	}
	defer rows.Close()

	counts = map[string]int{}
	lines = map[string]int{}
	for rows.Next() {
		var email string
		var cnt, ln int64
		if err := rows.Scan(&email, &cnt, &ln); err != nil {
			return nil, nil, fmt.Errorf("store.gitanalysis: scan bug intro: %w", err)
		}
		if email == "" {
			continue
		}
		counts[email] = int(cnt)
		lines[email] = int(ln)
	}
	return counts, lines, rows.Err()
}

// TestCouplingRow is a per-author test-coupling fact: how many of the author's
// file-touches were to test files vs all files. Ratio is tested/total (0 when
// total==0). This rewards shipping tests alongside code.
type TestCouplingRow struct {
	AuthorEmail  string
	TestTouches  int
	TotalTouches int
	Ratio        float64
}

// TestCouplingByAuthor returns the tested-vs-total file-touch ratio per author
// email across the org's repos, derived from commit_files. A "touch" is one
// (commit,file) row. Must run with the org RLS context set. Keyed by lower-cased
// author email.
func TestCouplingByAuthor(ctx context.Context, qr Querier, orgID string) (map[string]TestCouplingRow, error) {
	const q = `
		SELECT lower(author_email::text) AS email,
		       COUNT(*) FILTER (WHERE is_test)::bigint AS test_touches,
		       COUNT(*)::bigint                        AS total_touches
		FROM commit_files
		WHERE org_id = $1 AND author_email IS NOT NULL
		GROUP BY 1`
	rows, err := qr.Query(ctx, q, orgID)
	if err != nil {
		return nil, fmt.Errorf("store.gitanalysis: test coupling by author: %w", err)
	}
	defer rows.Close()

	out := map[string]TestCouplingRow{}
	for rows.Next() {
		var email string
		var testT, totalT int64
		if err := rows.Scan(&email, &testT, &totalT); err != nil {
			return nil, fmt.Errorf("store.gitanalysis: scan test coupling: %w", err)
		}
		if email == "" {
			continue
		}
		ratio := 0.0
		if totalT > 0 {
			ratio = float64(testT) / float64(totalT)
		}
		out[email] = TestCouplingRow{
			AuthorEmail:  email,
			TestTouches:  int(testT),
			TotalTouches: int(totalT),
			Ratio:        ratio,
		}
	}
	return out, rows.Err()
}

// CommitFileStats is a tiny summary used by the seed/CLI to print what landed.
type CommitFileStats struct {
	Rows      int
	TestRows  int
	Authors   int
	UpdatedAt time.Time
}

// CommitFileSummary returns counts for the org's commit_files (for CLI summaries).
// Must run with the org RLS context set.
func CommitFileSummary(ctx context.Context, qr Querier, orgID string) (CommitFileStats, error) {
	const q = `
		SELECT COUNT(*)::bigint,
		       COUNT(*) FILTER (WHERE is_test)::bigint,
		       COUNT(DISTINCT lower(author_email::text))::bigint
		FROM commit_files
		WHERE org_id = $1`
	rows, err := qr.Query(ctx, q, orgID)
	if err != nil {
		return CommitFileStats{}, fmt.Errorf("store.gitanalysis: commit file summary: %w", err)
	}
	defer rows.Close()

	var nRows, testRows, authors int64
	if rows.Next() {
		if err := rows.Scan(&nRows, &testRows, &authors); err != nil {
			return CommitFileStats{}, fmt.Errorf("store.gitanalysis: scan commit file summary: %w", err)
		}
	}
	if err := rows.Err(); err != nil {
		return CommitFileStats{}, err
	}
	return CommitFileStats{Rows: int(nRows), TestRows: int(testRows), Authors: int(authors), UpdatedAt: time.Now()}, nil
}
