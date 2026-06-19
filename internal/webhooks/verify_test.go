package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestVerifyGitHubSignature(t *testing.T) {
	secret := "topsecret"
	body := []byte(`{"action":"opened"}`)
	good := sign(secret, body)

	cases := []struct {
		name   string
		secret string
		body   []byte
		header string
		want   bool
	}{
		{"valid", secret, body, good, true},
		{"valid no prefix", secret, body, good[len("sha256="):], true},
		{"wrong secret", "other", body, good, false},
		{"tampered body", secret, []byte(`{"action":"closed"}`), good, false},
		{"empty header", secret, body, "", false},
		{"empty secret", "", body, good, false},
		{"garbage header", secret, body, "sha256=zzzz", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := VerifyGitHubSignature(c.secret, c.body, c.header); got != c.want {
				t.Fatalf("VerifyGitHubSignature = %v, want %v", got, c.want)
			}
		})
	}
}

func TestGenerateSecretUnique(t *testing.T) {
	a, err := GenerateSecret()
	if err != nil || len(a) != 64 {
		t.Fatalf("GenerateSecret a=%q err=%v", a, err)
	}
	b, _ := GenerateSecret()
	if a == b {
		t.Fatal("expected distinct secrets")
	}
}
