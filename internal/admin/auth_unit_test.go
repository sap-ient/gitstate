package admin

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/auth"
	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
)

// TestIsEmailAllowed exercises the hand-written comma-list parser that gates the
// supreme (.env-declared) super-admins. Case- and space-insensitive matching is
// security-relevant: a mismatch here either locks out a real admin or admits the
// wrong account.
func TestIsEmailAllowed(t *testing.T) {
	cases := []struct {
		name  string
		email string
		list  string
		want  bool
	}{
		{"empty list", "a@x.com", "", false},
		{"empty email", "", "a@x.com", false},
		{"both empty", "", "", false},
		{"single match", "a@x.com", "a@x.com", true},
		{"single no match", "b@x.com", "a@x.com", false},
		{"case-insensitive email", "A@X.com", "a@x.com", true},
		{"case-insensitive list", "a@x.com", "A@X.COM", true},
		{"spaces around entries", "b@x.com", " a@x.com , b@x.com ,c@x.com", true},
		{"match in middle", "b@x.com", "a@x.com,b@x.com,c@x.com", true},
		{"no match in list", "z@x.com", "a@x.com,b@x.com,c@x.com", false},
		{"trailing comma", "a@x.com", "a@x.com,", true},
		{"substring is not a match", "x.com", "a@x.com", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isEmailAllowed(tc.email, tc.list); got != tc.want {
				t.Errorf("isEmailAllowed(%q,%q) = %v, want %v", tc.email, tc.list, got, tc.want)
			}
		})
	}
}

// TestIsAdminUser verifies the shared super-admin decision: allow-listed email
// OR the is_super_admin column.
func TestIsAdminUser(t *testing.T) {
	cfg := &config.Config{}
	cfg.Admin.SuperAdminEmails = "root@x.com"

	cases := []struct {
		name string
		u    *store.User
		want bool
	}{
		{"allow-listed email", &store.User{Email: "root@x.com"}, true},
		{"allow-listed email, case", &store.User{Email: "ROOT@x.com"}, true},
		{"column flag set", &store.User{Email: "other@x.com", IsSuperAdmin: true}, true},
		{"neither", &store.User{Email: "other@x.com"}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isAdminUser(cfg, tc.u); got != tc.want {
				t.Errorf("isAdminUser = %v, want %v", got, tc.want)
			}
		})
	}
}

// issueAuthHeader issues a valid access token and returns a chain that injects
// the verified AuthUser into context (mirroring production: RequireAuth must run
// before RequireSuperAdmin).
func authedRequest(t *testing.T, key, userID, email string) *http.Request {
	t.Helper()
	tok, err := auth.IssueAccessToken(key, userID, email, "Name", time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	r := httptest.NewRequest(http.MethodGet, "/admin", nil)
	r.Header.Set("Authorization", "Bearer "+tok)
	return r
}

// TestRequireSuperAdminEmailAllow verifies the no-DB allow path: an allow-listed
// email passes the gate (database may be nil).
func TestRequireSuperAdminEmailAllow(t *testing.T) {
	const key = "k"
	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = key
	cfg.Admin.SuperAdminEmails = "root@x.com"

	var reached bool
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached = true; w.WriteHeader(200) })
	// RequireAuth populates the context; RequireSuperAdmin (database=nil) gates.
	handler := middleware.RequireAuth(key)(RequireSuperAdmin(cfg, nil)(next))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authedRequest(t, key, "u1", "root@x.com"))

	if !reached {
		t.Errorf("allow-listed admin was not admitted (status %d)", rec.Code)
	}
}

// TestRequireSuperAdminForbidden verifies a valid, non-admin user is rejected
// with 403 (database=nil so the column path can't rescue them).
func TestRequireSuperAdminForbidden(t *testing.T) {
	const key = "k"
	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = key
	cfg.Admin.SuperAdminEmails = "root@x.com"

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("next should not run"); w.WriteHeader(200) })
	handler := middleware.RequireAuth(key)(RequireSuperAdmin(cfg, nil)(next))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, authedRequest(t, key, "u1", "nobody@x.com"))

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
}

// TestRequireSuperAdminUnauthenticated verifies that with no user in context the
// gate returns 401 (defence in depth even though RequireAuth normally runs first).
func TestRequireSuperAdminUnauthenticated(t *testing.T) {
	cfg := &config.Config{}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { t.Error("next should not run") })
	handler := RequireSuperAdmin(cfg, nil)(next)

	rec := httptest.NewRecorder()
	// No RequireAuth in front → context has no user.
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/admin", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}
