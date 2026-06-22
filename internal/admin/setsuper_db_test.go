package admin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/exo/gitstate/internal/auth"
	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
)

// setSuperTestPool opens a pool gated on DATABASE_URL (skips cleanly without it).
func setSuperTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL not set — skipping admin setSuper DB test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// makeUser inserts a user (optionally already super-admin) and returns its id,
// registering cleanup.
func makeUser(t *testing.T, pool *pgxpool.Pool, super bool) (id, email string) {
	t.Helper()
	ctx := context.Background()
	email = fmt.Sprintf("admintest-%d@example.com", time.Now().UnixNano())
	u, err := store.CreateUser(ctx, pool, email, "Admin Test", "")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if super {
		if err := store.SetUserSuperAdmin(ctx, pool, u.ID, true); err != nil {
			t.Fatalf("set super: %v", err)
		}
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, u.ID) })
	return u.ID, email
}

// callDemote invokes the demote path (setSuper value=false) against a handler
// backed by pool/cfg, with actorID as the authenticated super-admin in context.
func callDemote(t *testing.T, pool *pgxpool.Pool, cfg *config.Config, targetID, actorID string) *httptest.ResponseRecorder {
	t.Helper()
	h := &adminHandlers{db: nil, cfg: cfg, pool: pool}

	r := httptest.NewRequest(http.MethodPost, "/admin/users/"+targetID+"/demote", nil)
	r.SetPathValue("id", targetID)
	// Inject the actor as the authenticated user via a real RequireAuth pass.
	r.Header.Set("Authorization", "Bearer "+mustToken(t, cfg.Auth.JWTSigningKey, actorID))

	rec := httptest.NewRecorder()
	// RequireAuth populates middleware.UserFromContext, which setSuper consults
	// for the self-demote guard.
	handler := middleware.RequireAuth(cfg.Auth.JWTSigningKey)(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		h.setSuper(w, req, false)
	}))
	handler.ServeHTTP(rec, r)
	return rec
}

func mustToken(t *testing.T, key, userID string) string {
	t.Helper()
	tok, err := auth.IssueAccessToken(key, userID, "actor@example.com", "Actor", time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return tok
}

// TestSetSuperSupremeCannotBeDemoted verifies a .env-declared supreme admin can
// NEVER be demoted from the console (refused with 409), and the column is left
// untouched.
func TestSetSuperSupremeCannotBeDemoted(t *testing.T) {
	pool := setSuperTestPool(t)
	targetID, targetEmail := makeUser(t, pool, true)
	actorID, _ := makeUser(t, pool, true) // a different super-admin acting

	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = "k"
	cfg.Admin.SuperAdminEmails = targetEmail // target is supreme

	rec := callDemote(t, pool, cfg, targetID, actorID)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 Conflict", rec.Code)
	}

	// The user must still be a super-admin (refusal happened before any write).
	u, err := store.GetUserByID(context.Background(), pool, targetID)
	if err != nil {
		t.Fatalf("refetch: %v", err)
	}
	if !u.IsSuperAdmin {
		t.Error("supreme admin was demoted despite refusal")
	}
}

// TestSetSuperCannotDemoteSelf verifies a super-admin cannot revoke their own
// access (409), guarding against accidental lock-out.
func TestSetSuperCannotDemoteSelf(t *testing.T) {
	pool := setSuperTestPool(t)
	id, _ := makeUser(t, pool, true)

	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = "k"
	cfg.Admin.SuperAdminEmails = "" // not supreme, so only the self guard applies

	rec := callDemote(t, pool, cfg, id, id) // actor == target
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409 Conflict", rec.Code)
	}

	u, err := store.GetUserByID(context.Background(), pool, id)
	if err != nil {
		t.Fatalf("refetch: %v", err)
	}
	if !u.IsSuperAdmin {
		t.Error("self-demote should have been refused")
	}
}

// TestSetSuperNormalAdminCanBeDemoted verifies the happy path: a normal (non-
// supreme, non-self) super-admin CAN be demoted, and the column flips to false.
func TestSetSuperNormalAdminCanBeDemoted(t *testing.T) {
	pool := setSuperTestPool(t)
	targetID, _ := makeUser(t, pool, true)
	actorID, _ := makeUser(t, pool, true) // different actor

	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = "k"
	cfg.Admin.SuperAdminEmails = "" // target is not supreme

	rec := callDemote(t, pool, cfg, targetID, actorID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 OK", rec.Code)
	}

	u, err := store.GetUserByID(context.Background(), pool, targetID)
	if err != nil {
		t.Fatalf("refetch: %v", err)
	}
	if u.IsSuperAdmin {
		t.Error("normal super-admin should have been demoted")
	}
}
