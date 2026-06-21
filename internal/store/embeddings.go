// Package store — embeddings.go
// Persistence for the semantic (pgvector) layer over issues. The embedder lives in
// internal/embed; this file owns the SQL that (a) finds issues whose embedding is
// missing or stale and (b) writes a freshly-computed vector back.
//
// Vectors are bound as a pgvector TEXT LITERAL (e.g. "[0.1,0.2,...]") and cast
// `::vector` in SQL — gitstate does NOT depend on pgvector-go. Every call runs on
// a db.WithOrg tx so FORCE-RLS scopes reads/writes to the org.
package store

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// IssueForEmbedding is the minimal projection the embedder needs: the id plus the
// text it embeds (title + body).
type IssueForEmbedding struct {
	ID    string
	Title string
	Body  string
}

// ListIssuesNeedingEmbedding returns up to `limit` issues in the org whose
// embedding is missing or stale (the issue was updated after it was last embedded,
// or the stored model differs from the active one). The caller embeds them and
// writes the result back via SetIssueEmbedding. Ordered oldest-touched first so a
// bounded batch makes steady forward progress.
//
// tx MUST come from db.WithOrg so RLS scopes the read to orgID.
func ListIssuesNeedingEmbedding(ctx context.Context, tx pgx.Tx, orgID, model string, limit int) ([]IssueForEmbedding, error) {
	if limit <= 0 {
		limit = 500
	}
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

	rows, err := tx.Query(ctx, q, orgID, model, limit)
	if err != nil {
		return nil, fmt.Errorf("store: list issues needing embedding: %w", err)
	}
	defer rows.Close()

	var out []IssueForEmbedding
	for rows.Next() {
		var it IssueForEmbedding
		if err := rows.Scan(&it.ID, &it.Title, &it.Body); err != nil {
			return nil, fmt.Errorf("store: scan issue-for-embedding: %w", err)
		}
		out = append(out, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: issues-needing-embedding rows: %w", err)
	}
	return out, nil
}

// SetIssueEmbedding stores a freshly-computed embedding for one issue. vecLiteral
// is a pgvector text literal (embed.ToPGVector) bound as a parameter and cast
// `::vector`; model is the embedder identifier (embed.Model). Sets embedded_at to
// now() so subsequent edits to the issue mark it stale again.
//
// tx MUST come from db.WithOrg so RLS scopes the write to the org.
func SetIssueEmbedding(ctx context.Context, tx pgx.Tx, issueID, vecLiteral, model string) error {
	const q = `
		UPDATE issues
		SET embedding = $2::vector,
		    embedding_model = $3,
		    embedded_at = now()
		WHERE id = $1`
	tag, err := tx.Exec(ctx, q, issueID, vecLiteral, model)
	if err != nil {
		return fmt.Errorf("store: set issue embedding %s: %w", issueID, err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// VectorHit is one (issueID, similarity) pair from a KNN search. Similarity is
// cosine similarity in [-1,1] (1 - cosine_distance); higher is closer.
type VectorHit struct {
	IssueID    string
	Similarity float64
}

// SearchIssuesByVector runs an HNSW cosine KNN over embedded issues and returns the
// top `limit` issues by similarity. qVecLiteral is the query embedding as a
// pgvector text literal (bound + cast `::vector`). Only rows WHERE embedding IS NOT
// NULL participate, so it returns nothing (and the caller falls back to FTS only)
// before any issue has been embedded.
//
// tx MUST come from db.WithOrg so RLS scopes the read to the org.
func SearchIssuesByVector(ctx context.Context, tx pgx.Tx, qVecLiteral string, limit int) ([]VectorHit, error) {
	if limit <= 0 {
		limit = 20
	}
	const q = `
		SELECT id::text, 1 - (embedding <=> $1::vector) AS sim
		FROM issues
		WHERE embedding IS NOT NULL
		ORDER BY embedding <=> $1::vector
		LIMIT $2`
	rows, err := tx.Query(ctx, q, qVecLiteral, limit)
	if err != nil {
		return nil, fmt.Errorf("store: vector search issues: %w", err)
	}
	defer rows.Close()

	var out []VectorHit
	for rows.Next() {
		var h VectorHit
		if err := rows.Scan(&h.IssueID, &h.Similarity); err != nil {
			return nil, fmt.Errorf("store: scan vector hit: %w", err)
		}
		out = append(out, h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("store: vector search rows: %w", err)
	}
	return out, nil
}
