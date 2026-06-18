package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/exo/gitstate/internal/auth"
)

// authClaimsKey is the context key for verified JWT claims.
type authClaimsKey struct{}

// AuthUser holds the verified identity attached to a request context.
type AuthUser struct {
	ID    string
	Email string
	Name  string
}

// UserFromContext returns the verified AuthUser stored by RequireAuth, or nil.
func UserFromContext(ctx context.Context) *AuthUser {
	v, _ := ctx.Value(authClaimsKey{}).(*AuthUser)
	return v
}

// RequireAuth is a middleware that extracts and verifies the Bearer JWT from
// the Authorization header. On success it stores the AuthUser in the context.
// On failure it returns 401 JSON {"error":"..."} and aborts the chain.
func RequireAuth(signingKey string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			tokenStr, ok := strings.CutPrefix(header, "Bearer ")
			if !ok || tokenStr == "" {
				writeAuthError(w, "missing or malformed Authorization header", http.StatusUnauthorized)
				return
			}

			claims, err := auth.ParseAccessToken(signingKey, tokenStr)
			if err != nil {
				writeAuthError(w, "invalid or expired token", http.StatusUnauthorized)
				return
			}

			user := &AuthUser{
				ID:    claims.UserID(),
				Email: claims.Email,
				Name:  claims.Name,
			}
			ctx := context.WithValue(r.Context(), authClaimsKey{}, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeAuthError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
