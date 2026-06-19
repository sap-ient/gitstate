// Package store — webhooks.go
// Org-scoped persistence for inbound webhook configs (per-org HMAC secret used to
// verify GitHub/GitLab payloads) plus the pre-auth, RLS-bypassing helpers the
// public receiver needs to resolve an org from a payload's secret/signature.
//
// All authed reads/writes run inside db.WithOrg so the org_isolation RLS policy
// (migration 20260619_015) is active. The two pre-auth helpers
// (WebhookOrgBySecret / ListWebhookConfigsByProvider) go through the SECURITY
// DEFINER function or the raw pool because there is no org context yet — the
// public receiver resolves the org first, then re-reads everything under RLS.
//
// Secrets are NEVER logged. Callers must not echo WebhookConfig.Secret into any
// response except the one-time reveal at rotation time.
package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// WebhookConfig mirrors the webhook_configs table.
type WebhookConfig struct {
	ID          string
	OrgID       string
	Provider    string // github | gitlab
	Secret      string // HMAC secret (github) / token (gitlab) — never expose except one-time reveal
	Enabled     bool
	LastEventAt *time.Time
	CreatedAt   time.Time
}

// ── Authed config (db.WithOrg) ─────────────────────────────────────────────────

// ListWebhookConfigs returns the org's webhook configs (one per provider) ordered
// by provider. Must run inside db.WithOrg.
func ListWebhookConfigs(ctx context.Context, tx pgx.Tx, orgID string) ([]WebhookConfig, error) {
	const q = `
		SELECT id, org_id, provider, secret, enabled, last_event_at, created_at
		FROM webhook_configs
		WHERE org_id = $1
		ORDER BY provider`
	rows, err := tx.Query(ctx, q, orgID)
	if err != nil {
		return nil, fmt.Errorf("store.webhooks: list configs: %w", err)
	}
	defer rows.Close()

	var out []WebhookConfig
	for rows.Next() {
		var c WebhookConfig
		if err := rows.Scan(&c.ID, &c.OrgID, &c.Provider, &c.Secret, &c.Enabled, &c.LastEventAt, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("store.webhooks: scan config: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetWebhookConfig returns the org's config for a provider, or ErrNotFound.
func GetWebhookConfig(ctx context.Context, tx pgx.Tx, orgID, provider string) (*WebhookConfig, error) {
	const q = `
		SELECT id, org_id, provider, secret, enabled, last_event_at, created_at
		FROM webhook_configs
		WHERE org_id = $1 AND provider = $2`
	var c WebhookConfig
	err := tx.QueryRow(ctx, q, orgID, provider).Scan(
		&c.ID, &c.OrgID, &c.Provider, &c.Secret, &c.Enabled, &c.LastEventAt, &c.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("store.webhooks: get config: %w", err)
	}
	return &c, nil
}

// UpsertWebhookSecret generates/rotates the secret for (org, provider). On
// conflict it replaces the secret and re-enables the config. Returns the stored
// row (with the new secret) so the api layer can reveal it once. Must run inside
// db.WithOrg.
func UpsertWebhookSecret(ctx context.Context, tx pgx.Tx, orgID, provider, secret string) (*WebhookConfig, error) {
	const q = `
		INSERT INTO webhook_configs (org_id, provider, secret, enabled)
		VALUES ($1, $2, $3, true)
		ON CONFLICT (org_id, provider) DO UPDATE SET
			secret  = EXCLUDED.secret,
			enabled = true
		RETURNING id, org_id, provider, secret, enabled, last_event_at, created_at`
	var c WebhookConfig
	err := tx.QueryRow(ctx, q, orgID, provider, secret).Scan(
		&c.ID, &c.OrgID, &c.Provider, &c.Secret, &c.Enabled, &c.LastEventAt, &c.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("store.webhooks: upsert secret: %w", err)
	}
	return &c, nil
}

// TouchWebhookLastEvent stamps last_event_at = now() for (org, provider). Run
// inside db.WithOrg (the receiver already has org context at this point).
func TouchWebhookLastEvent(ctx context.Context, tx pgx.Tx, orgID, provider string) error {
	const q = `UPDATE webhook_configs SET last_event_at = now() WHERE org_id = $1 AND provider = $2`
	if _, err := tx.Exec(ctx, q, orgID, provider); err != nil {
		return fmt.Errorf("store.webhooks: touch last_event: %w", err)
	}
	return nil
}

// ── Pre-auth resolution (no org context yet) ───────────────────────────────────

// WebhookOrgBySecret resolves the org_id whose enabled config for `provider` has
// the exact `secret`. Used by the GitLab receiver (token equality) and as a fast
// path. Goes through the SECURITY DEFINER webhook_org_by_secret() function so it
// works with no RLS context. Returns ErrNotFound when no match.
func WebhookOrgBySecret(ctx context.Context, q Querier, provider, secret string) (string, error) {
	const sql = `SELECT webhook_org_by_secret($1, $2)::text`
	rows, err := q.Query(ctx, sql, provider, secret)
	if err != nil {
		return "", fmt.Errorf("store.webhooks: org by secret: %w", err)
	}
	defer rows.Close()
	if !rows.Next() {
		return "", ErrNotFound
	}
	var orgID *string
	if err := rows.Scan(&orgID); err != nil {
		return "", fmt.Errorf("store.webhooks: scan org by secret: %w", err)
	}
	if orgID == nil || *orgID == "" {
		return "", ErrNotFound
	}
	return *orgID, nil
}

// RepoIDByExternal resolves an internal repo id from (org, platform,
// external_id). Webhook payloads identify repos by full name (owner/name), which
// is what the repos table stores in external_id for connected repos. Returns
// ErrNotFound when the repo isn't connected. Must run inside db.WithOrg.
func RepoIDByExternal(ctx context.Context, tx pgx.Tx, orgID, platform, externalID string) (string, error) {
	const q = `SELECT id::text FROM repos WHERE org_id = $1 AND platform = $2 AND external_id = $3`
	var id string
	err := tx.QueryRow(ctx, q, orgID, platform, externalID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("store.webhooks: repo by external: %w", err)
	}
	return id, nil
}

// GetEnabledWebhookSecret returns the enabled secret for (org, provider) under
// RLS (run inside db.WithOrg for the hinted org). Used by the GitHub receiver:
// the payload URL carries the org id as a hint, the receiver opens
// db.WithOrg(orgHint, …), reads that one org's secret here, then verifies the
// X-Hub-Signature-256 HMAC against it. Returns ErrNotFound when absent/disabled.
func GetEnabledWebhookSecret(ctx context.Context, tx pgx.Tx, orgID, provider string) (string, error) {
	const q = `SELECT secret FROM webhook_configs WHERE org_id = $1 AND provider = $2 AND enabled`
	var secret string
	err := tx.QueryRow(ctx, q, orgID, provider).Scan(&secret)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("store.webhooks: get enabled secret: %w", err)
	}
	return secret, nil
}
