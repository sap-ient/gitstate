package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// RefreshToken mirrors the refresh_tokens table row.
type RefreshToken struct {
	ID         string
	UserID     string
	FamilyID   string
	TokenHash  string
	ReplacedBy string // empty when not yet rotated
	RevokedAt  *time.Time
	ExpiresAt  time.Time
	CreatedAt  time.Time
}

// InsertRefresh stores a new refresh token row.
// familyID is a UUID shared by all tokens in the same rotation chain.
func InsertRefresh(ctx context.Context, pool *pgxpool.Pool, userID, familyID, tokenHash string, expiresAt time.Time) (*RefreshToken, error) {
	const q = `
		INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, family_id, token_hash,
		          COALESCE(replaced_by::text, ''), revoked_at, expires_at, created_at`

	row := pool.QueryRow(ctx, q, userID, familyID, tokenHash, expiresAt)
	return scanRefreshToken(row)
}

// GetRefreshByHash looks up an active (non-revoked, non-expired) refresh token by its hash.
// Returns ErrNotFound when no matching active token exists.
func GetRefreshByHash(ctx context.Context, pool *pgxpool.Pool, tokenHash string) (*RefreshToken, error) {
	const q = `
		SELECT id, user_id, family_id, token_hash,
		       COALESCE(replaced_by::text, ''), revoked_at, expires_at, created_at
		FROM refresh_tokens
		WHERE token_hash = $1`

	row := pool.QueryRow(ctx, q, tokenHash)
	rt, err := scanRefreshToken(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return rt, err
}

// RotateRefresh atomically marks oldID as replaced by newID and inserts the new token.
// It uses a single transaction via the pool directly (no org scoping needed for tokens).
func RotateRefresh(ctx context.Context, pool *pgxpool.Pool, oldID, userID, familyID, newHash string, expiresAt time.Time) (*RefreshToken, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("store: rotate refresh: begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Insert the new token first so we have its ID.
	const insertQ = `
		INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, family_id, token_hash,
		          COALESCE(replaced_by::text, ''), revoked_at, expires_at, created_at`

	row := tx.QueryRow(ctx, insertQ, userID, familyID, newHash, expiresAt)
	newRT, err := scanRefreshToken(row)
	if err != nil {
		return nil, fmt.Errorf("store: rotate refresh: insert new: %w", err)
	}

	// Mark the old token as replaced.
	const updateQ = `UPDATE refresh_tokens SET replaced_by = $1 WHERE id = $2`
	if _, err = tx.Exec(ctx, updateQ, newRT.ID, oldID); err != nil {
		return nil, fmt.Errorf("store: rotate refresh: mark replaced: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("store: rotate refresh: commit: %w", err)
	}
	return newRT, nil
}

// RevokeFamily sets revoked_at = now() on all tokens in the given family.
// Called on reuse detection (decisions A5) to invalidate the entire chain.
func RevokeFamily(ctx context.Context, pool *pgxpool.Pool, familyID string) error {
	const q = `UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`
	if _, err := pool.Exec(ctx, q, familyID); err != nil {
		return fmt.Errorf("store: revoke family %s: %w", familyID, err)
	}
	return nil
}

// scanRefreshToken reads a single refresh_tokens row.
func scanRefreshToken(row pgx.Row) (*RefreshToken, error) {
	var rt RefreshToken
	err := row.Scan(
		&rt.ID, &rt.UserID, &rt.FamilyID, &rt.TokenHash,
		&rt.ReplacedBy, &rt.RevokedAt, &rt.ExpiresAt, &rt.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("store: scan refresh token: %w", err)
	}
	return &rt, nil
}
