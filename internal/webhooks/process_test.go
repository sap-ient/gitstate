// Package webhooks — process_test.go
// DB-backed test for event processing (Process). Because Process commits via
// db.WithOrg, this test cannot wrap everything in a rollback; instead it seeds a
// dedicated throwaway org and DELETEs it (cascade) at the end so the DB is left
// clean. Skips cleanly when DATABASE_URL is unset.
//
// Covered:
//   - a GitHub deployment_status "success" event → a deployments row;
//   - a GitHub deployment_status "failure" event → a deployments row + an open
//     incident (MTTR lifecycle);
//   - an unknown event → ignored, no rows written.
package webhooks

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/store"
)

func newTestDB(t *testing.T) *db.DB {
	t.Helper()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping webhooks process integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	database, err := db.New(ctx, &config.Config{Database: config.DatabaseConfig{URL: dbURL}})
	if err != nil {
		t.Fatalf("db.New: %v", err)
	}
	return database
}

func TestProcessGitHubDeployments(t *testing.T) {
	database := newTestDB(t)
	defer database.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ns := time.Now().UnixNano()
	// Seed a throwaway org + connected repo on the raw pool (organizations has no
	// RLS; the repo insert needs the org context).
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("wh-proc-%d", ns), "Webhook Proc Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	// Always clean up: deleting the org cascades to repos/deployments/incidents.
	defer func() {
		if _, err := database.Pool().Exec(context.Background(),
			`DELETE FROM organizations WHERE id = $1`, orgID); err != nil {
			t.Logf("cleanup org %s: %v", orgID, err)
		}
	}()

	fullName := "acme/svc"
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		_, e := tx.Exec(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,$2)`,
			orgID, fullName)
		return e
	}); err != nil {
		t.Fatalf("seed repo: %v", err)
	}

	// ── failure deployment → deployments row + open incident ──
	failBody := fmt.Sprintf(`{
		"repository": {"full_name": %q},
		"deployment_status": {"state": "failure", "environment": "production", "id": %d, "created_at": "2026-03-10T12:00:00Z"},
		"deployment": {"sha": "deadbeef", "environment": "production", "id": %d}
	}`, fullName, ns, ns)
	res, err := Process(ctx, database, orgID, "github", "deployment_status", []byte(failBody))
	if err != nil {
		t.Fatalf("Process(failure): %v", err)
	}
	if res.Deployments != 1 {
		t.Errorf("failure deployments = %d, want 1", res.Deployments)
	}
	if res.Incidents != 1 {
		t.Errorf("failure opened incidents = %d, want 1", res.Incidents)
	}

	// ── success deployment for SAME repo → new deploy row + closes the incident ──
	okBody := fmt.Sprintf(`{
		"repository": {"full_name": %q},
		"deployment_status": {"state": "success", "environment": "production", "id": %d, "created_at": "2026-03-10T14:00:00Z"},
		"deployment": {"sha": "cafef00d", "environment": "production", "id": %d}
	}`, fullName, ns+1, ns+1)
	res2, err := Process(ctx, database, orgID, "github", "deployment_status", []byte(okBody))
	if err != nil {
		t.Fatalf("Process(success): %v", err)
	}
	if res2.Deployments != 1 {
		t.Errorf("success deployments = %d, want 1", res2.Deployments)
	}
	if res2.Closed != 1 {
		t.Errorf("success closed incidents = %d, want 1 (recovery)", res2.Closed)
	}

	// ── unknown event → ignored, nothing more written ──
	res3, err := Process(ctx, database, orgID, "github", "star", []byte(`{}`))
	if err != nil {
		t.Fatalf("Process(unknown): %v", err)
	}
	if !res3.Ignored {
		t.Errorf("unknown event Ignored = false, want true")
	}

	// Verify persisted state: 2 deployments (1 failure, 1 success), 1 incident
	// now resolved, and MTTR ~2h.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		var deploys, failures int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*), COUNT(*) FILTER (WHERE status='failure') FROM deployments WHERE org_id=$1`, orgID).
			Scan(&deploys, &failures); err != nil {
			return err
		}
		if deploys != 2 {
			t.Errorf("persisted deployments = %d, want 2", deploys)
		}
		if failures != 1 {
			t.Errorf("persisted failures = %d, want 1", failures)
		}
		var open, resolved int
		if err := tx.QueryRow(ctx,
			`SELECT COUNT(*) FILTER (WHERE resolved_at IS NULL), COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)
			 FROM incidents WHERE org_id=$1`, orgID).Scan(&open, &resolved); err != nil {
			return err
		}
		if open != 0 || resolved != 1 {
			t.Errorf("incidents open/resolved = %d/%d, want 0/1", open, resolved)
		}
		ms, err := store.MTTRForWindow(ctx, tx, orgID,
			time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC))
		if err != nil {
			return err
		}
		if ms.MeanHours < 1.99 || ms.MeanHours > 2.01 {
			t.Errorf("MTTR = %.3f h, want 2.0", ms.MeanHours)
		}
		return nil
	}); err != nil {
		t.Fatalf("verify: %v", err)
	}

	t.Logf("webhooks Process OK: 2 deploys (1 fail), incident opened then resolved (MTTR 2h)")
}

func TestProcessUnknownProvider(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set — skipping webhooks process integration test")
	}
	// Unknown provider is a pure-dispatch path; no DB work happens.
	res, err := Process(context.Background(), nil, "org", "bitbucket", "push", []byte(`{}`))
	if err != nil {
		t.Fatalf("Process(unknown provider): %v", err)
	}
	if !res.Ignored {
		t.Errorf("unknown provider Ignored = false, want true")
	}
}
