// Package embed — batch.go
// The post-sync hook that keeps issue embeddings current. EmbedPendingIssues lists
// the org's issues whose vector is missing or stale, embeds each with the local
// (fast, deterministic) embedder, and persists the result. It is idempotent: only
// NULL/stale rows are touched, so re-running it after a no-op sync does no work.
//
// Everything runs inside db.WithOrg so FORCE-RLS scopes the batch to the org, and
// vectors are bound as text literals cast `::vector` (no pgvector-go dependency).
//
// The SQL here is deliberately inlined rather than calling internal/store: the
// store package imports embed (for the query-side embedding in Search), so embed
// must not import store back. The shapes mirror store.ListIssuesNeedingEmbedding /
// store.SetIssueEmbedding.
package embed

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/exo/gitstate/internal/db"
	"github.com/jackc/pgx/v5"
)

// embedBatchLimit caps how many issues a single post-sync pass embeds. The local
// embedder is fast, but bounding the batch keeps the post-sync tx short; a later
// sync picks up any remainder (they stay flagged stale).
const embedBatchLimit = 1000

// pendingIssue is the minimal projection the embedder needs.
type pendingIssue struct {
	id    string
	title string
	body  string
}

// EmbedPendingIssues embeds every issue in the org whose embedding is missing or
// stale and persists the vectors. Returns the number of issues (re)embedded.
//
// It is safe to call repeatedly (idempotent) and is wired into the post-sync path;
// callers treat its error as non-fatal. Uses Default (the local embedder by
// default) so it needs no config and never touches the network.
func EmbedPendingIssues(ctx context.Context, database *db.DB, orgID string) (int, error) {
	model := Default.Model()

	// ── 1. List pending issues (missing or stale embedding). ──────────────────
	var pending []pendingIssue
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		const q = `
			SELECT id::text, COALESCE(title,''), COALESCE(body,'')
			FROM issues
			WHERE org_id = $1
			  AND ( embedding IS NULL
			     OR embedded_at IS NULL
			     OR embedded_at < updated_at
			     OR embedding_model IS DISTINCT FROM $2 )
			ORDER BY updated_at ASC
			LIMIT $3`
		rows, err := tx.Query(ctx, q, orgID, model, embedBatchLimit)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var p pendingIssue
			if err := rows.Scan(&p.id, &p.title, &p.body); err != nil {
				return err
			}
			pending = append(pending, p)
		}
		return rows.Err()
	}); err != nil {
		return 0, fmt.Errorf("embed: list pending issues: %w", err)
	}
	if len(pending) == 0 {
		return 0, nil
	}

	// ── 2. Compute every vector up front (CPU-only, no DB). ───────────────────
	type computedVec struct {
		id  string
		lit string
	}
	computed := make([]computedVec, 0, len(pending))
	for _, it := range pending {
		vec := Default.Embed(it.title + "\n" + it.body)
		computed = append(computed, computedVec{id: it.id, lit: ToPGVector(vec)})
	}

	// ── 3. Persist them in one org-scoped tx. ─────────────────────────────────
	embedded := 0
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		const q = `
			UPDATE issues
			SET embedding = $2::vector, embedding_model = $3, embedded_at = now()
			WHERE id = $1`
		for _, c := range computed {
			tag, err := tx.Exec(ctx, q, c.id, c.lit, model)
			if err != nil {
				// Non-fatal per-issue: a transient error shouldn't abort the batch.
				slog.Warn("embed: set issue embedding failed",
					"org_id", orgID, "issue_id", c.id, "err", err)
				continue
			}
			if tag.RowsAffected() > 0 {
				embedded++
			}
		}
		return nil
	}); err != nil {
		return embedded, fmt.Errorf("embed: persist embeddings: %w", err)
	}

	slog.Info("embed: embedded pending issues",
		"org_id", orgID, "model", model, "pending", len(pending), "embedded", embedded)
	return embedded, nil
}
