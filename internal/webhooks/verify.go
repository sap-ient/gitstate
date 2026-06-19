// Package webhooks implements inbound webhook receiving (real-time sync) and
// CI/CD deployment ingestion for GitHub and GitLab.
//
// Signature verification (security):
//   - GitHub sends `X-Hub-Signature-256: sha256=<hex>` — an HMAC-SHA256 of the
//     RAW request body keyed by the org's stored secret. We recompute it with
//     crypto/hmac + crypto/sha256 and compare in constant time (hmac.Equal).
//     The org is identified by a `?org=<id>` hint baked into the payload URL the
//     user copies from Settings; we read that one org's secret under RLS and
//     verify against it. A wrong/absent signature → 401.
//   - GitLab sends `X-Gitlab-Token: <secret>` — a plain shared token. We resolve
//     the org directly from the token via the SECURITY DEFINER
//     webhook_org_by_secret() lookup (constant-time compared inside the match).
//
// Secrets and raw bodies are NEVER logged.
package webhooks

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// GenerateSecret returns a URL-safe random secret suitable for a webhook HMAC
// key / shared token (32 bytes → 64 hex chars).
func GenerateSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// VerifyGitHubSignature reports whether the `X-Hub-Signature-256` header is a
// valid HMAC-SHA256 of body keyed by secret. header form: "sha256=<hex>".
// Constant-time; tolerant of an absent "sha256=" prefix.
func VerifyGitHubSignature(secret string, body []byte, header string) bool {
	if secret == "" || header == "" {
		return false
	}
	want := strings.TrimSpace(header)
	want = strings.TrimPrefix(want, "sha256=")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	got := hex.EncodeToString(mac.Sum(nil))

	// hmac.Equal is constant-time. Compare the hex strings as bytes.
	return hmac.Equal([]byte(got), []byte(strings.ToLower(want)))
}

// ConstantTimeEqual compares two strings without early exit (for the GitLab
// token equality path when matching an already-resolved candidate).
func ConstantTimeEqual(a, b string) bool {
	return hmac.Equal([]byte(a), []byte(b))
}
