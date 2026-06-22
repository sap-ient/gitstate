package auth_test

import (
	"encoding/hex"
	"testing"

	"github.com/exo/gitstate/internal/auth"
)

// TestGenerateRefreshTokenShape verifies the raw token is 32 random bytes
// hex-encoded (64 chars) and that the returned hash matches HashToken(raw).
func TestGenerateRefreshTokenShape(t *testing.T) {
	raw, hash, err := auth.GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	if len(raw) != 64 {
		t.Errorf("raw len = %d, want 64 hex chars", len(raw))
	}
	if _, err := hex.DecodeString(raw); err != nil {
		t.Errorf("raw is not valid hex: %v", err)
	}
	if hash != auth.HashToken(raw) {
		t.Error("returned hash does not equal HashToken(raw)")
	}
	// The raw token must never equal its hash (i.e. the stored value differs
	// from the bearer value).
	if hash == raw {
		t.Error("hash must not equal raw token")
	}
}

// TestGenerateRefreshTokenUniqueness verifies tokens are not predictable: two
// successive generations must differ in both raw and hash.
func TestGenerateRefreshTokenUniqueness(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		raw, hash, err := auth.GenerateRefreshToken()
		if err != nil {
			t.Fatalf("GenerateRefreshToken: %v", err)
		}
		if seen[raw] {
			t.Fatal("duplicate raw refresh token generated")
		}
		if seen[hash] {
			t.Fatal("duplicate refresh token hash generated")
		}
		seen[raw] = true
		seen[hash] = true
	}
}

// TestHashTokenDeterministic verifies HashToken is a stable function of input
// (lookup-by-hash depends on this) and is sensitive to input changes.
func TestHashTokenDeterministic(t *testing.T) {
	const in = "some-refresh-token-value"
	h1 := auth.HashToken(in)
	h2 := auth.HashToken(in)
	if h1 != h2 {
		t.Error("HashToken not deterministic for equal input")
	}
	if len(h1) != 64 { // sha256 hex digest
		t.Errorf("hash len = %d, want 64", len(h1))
	}
	if auth.HashToken(in) == auth.HashToken(in+"x") {
		t.Error("HashToken collided on distinct inputs")
	}
}
