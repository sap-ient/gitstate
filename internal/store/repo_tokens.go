// Package store — encrypted repo token persistence.
//
// SetRepoToken and GetRepoToken persist and retrieve the AES-256-GCM encrypted
// repo access token stored in repos.token_encrypted (added by migration
// 20260618_003_repo_tokens.sql).
//
// Callers are responsible for encryption/decryption via internal/crypto;
// these functions deal only with the raw encrypted bytes so that the store
// layer remains free of key-management concerns.
//
// Both functions run inside an org-scoped transaction (pgx.Tx) — the caller
// must use db.WithOrg so that the RLS policy (org_id = current_org()) is
// enforced, preventing cross-org token access.
package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// SetRepoToken stores the encrypted token bytes for a repo.
// The repo must belong to the org that is active in the RLS context of tx.
// Passing nil or empty encrypted clears the stored token.
func SetRepoToken(ctx context.Context, tx pgx.Tx, repoID string, encrypted []byte) error {
	const q = `
		UPDATE repos
		SET    token_encrypted = $1
		WHERE  id = $2`

	tag, err := tx.Exec(ctx, q, encrypted, repoID)
	if err != nil {
		return fmt.Errorf("store: set repo token: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// RLS filtered the row (wrong org) or repo does not exist.
		return ErrNotFound
	}
	return nil
}

// GetRepoToken retrieves the encrypted token bytes for a repo.
// Returns ErrNotFound if the repo does not exist or belongs to another org
// (RLS will filter it out). Returns nil bytes (no error) if no token has been
// stored yet (token_encrypted IS NULL).
func GetRepoToken(ctx context.Context, tx pgx.Tx, repoID string) ([]byte, error) {
	const q = `SELECT token_encrypted FROM repos WHERE id = $1`

	var encrypted []byte
	err := tx.QueryRow(ctx, q, repoID).Scan(&encrypted)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store: get repo token: %w", err)
	}
	return encrypted, nil
}
