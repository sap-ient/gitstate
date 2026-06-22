package auth_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/exo/gitstate/internal/auth"
)

const testKey = "test-signing-key-do-not-use-in-prod"

// TestIssueParseRoundTrip covers the happy path: a token issued with a key
// parses back to the same claims with that key.
func TestIssueParseRoundTrip(t *testing.T) {
	tok, err := auth.IssueAccessToken(testKey, "user-123", "alice@example.com", "Alice", time.Hour)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	if tok == "" {
		t.Fatal("expected non-empty token")
	}

	claims, err := auth.ParseAccessToken(testKey, tok)
	if err != nil {
		t.Fatalf("ParseAccessToken: %v", err)
	}
	if claims.UserID() != "user-123" {
		t.Errorf("UserID = %q, want user-123", claims.UserID())
	}
	if claims.Subject != "user-123" {
		t.Errorf("Subject = %q, want user-123", claims.Subject)
	}
	if claims.Email != "alice@example.com" {
		t.Errorf("Email = %q, want alice@example.com", claims.Email)
	}
	if claims.Name != "Alice" {
		t.Errorf("Name = %q, want Alice", claims.Name)
	}
	if claims.ExpiresAt == nil || claims.IssuedAt == nil {
		t.Fatal("expected exp and iat to be set")
	}
	if !claims.ExpiresAt.After(claims.IssuedAt.Time) {
		t.Error("expected exp to be after iat")
	}
}

// TestParseWrongKeyRejected covers signature verification: a token signed with
// one key must NOT verify under a different key.
func TestParseWrongKeyRejected(t *testing.T) {
	tok, err := auth.IssueAccessToken(testKey, "u1", "e@x.com", "E", time.Hour)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	if _, err := auth.ParseAccessToken("a-totally-different-key", tok); err == nil {
		t.Fatal("expected error parsing token with wrong key, got nil")
	}
}

// TestParseExpiredRejected covers expiry: a token whose exp is in the past must
// be rejected with the ErrTokenExpired sentinel.
func TestParseExpiredRejected(t *testing.T) {
	// Negative TTL → exp already in the past.
	tok, err := auth.IssueAccessToken(testKey, "u1", "e@x.com", "E", -time.Minute)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	_, err = auth.ParseAccessToken(testKey, tok)
	if err == nil {
		t.Fatal("expected expired token to be rejected")
	}
	if !errors.Is(err, auth.ErrTokenExpired) {
		t.Errorf("expected ErrTokenExpired, got %v", err)
	}
}

// TestParseTamperedRejected covers tampering: flipping a byte in the payload
// breaks the signature and the token must not verify.
func TestParseTamperedRejected(t *testing.T) {
	tok, err := auth.IssueAccessToken(testKey, "u1", "e@x.com", "E", time.Hour)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		t.Fatalf("expected 3 JWT parts, got %d", len(parts))
	}
	// Mutate one character of the payload segment.
	payload := []byte(parts[1])
	if payload[0] == 'A' {
		payload[0] = 'B'
	} else {
		payload[0] = 'A'
	}
	tampered := parts[0] + "." + string(payload) + "." + parts[2]

	if _, err := auth.ParseAccessToken(testKey, tampered); err == nil {
		t.Fatal("expected tampered token to be rejected")
	}
}

// TestParseGarbageRejected covers malformed input.
func TestParseGarbageRejected(t *testing.T) {
	for _, in := range []string{"", "not-a-jwt", "a.b.c", "....."} {
		if _, err := auth.ParseAccessToken(testKey, in); err == nil {
			t.Errorf("expected error for input %q, got nil", in)
		}
	}
}

// TestParseRejectsAlgNone covers the alg-confusion attack surface: a token using
// an unexpected (non-HMAC) signing method must be rejected by the keyfunc guard.
func TestParseRejectsAlgNone(t *testing.T) {
	claims := auth.Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "attacker",
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		Email: "attacker@example.com",
	}
	// "none" alg tokens are signed with the special UnsafeAllowNoneSignatureType.
	unsigned := jwt.NewWithClaims(jwt.SigningMethodNone, claims)
	tok, err := unsigned.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none token: %v", err)
	}
	if _, err := auth.ParseAccessToken(testKey, tok); err == nil {
		t.Fatal("expected alg=none token to be rejected")
	}
}
