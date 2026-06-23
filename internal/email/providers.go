// Providers: Resend (native HTTPS API) and Amazon SES (native SigV4, no SDK) as
// alternatives to raw SMTP. The active backend is auto-selected by which env is
// configured (or forced via EMAIL_PROVIDER): resend | ses | smtp. All three share
// the same MIME builder so an invoice PDF rides along identically.
package email

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// providerConfig carries the non-SMTP backend settings, resolved from env.
type providerConfig struct {
	provider  string // "resend" | "ses" | "smtp" (empty ⇒ smtp/no-op)
	resendKey string
	awsRegion string
	awsKey    string
	awsSecret string
}

func loadProviderConfig() providerConfig {
	p := providerConfig{
		provider:  strings.ToLower(strings.TrimSpace(getenv("EMAIL_PROVIDER"))),
		resendKey: strings.TrimSpace(getenv("RESEND_API_KEY")),
		awsRegion: strings.TrimSpace(getenv("AWS_REGION")),
		awsKey:    strings.TrimSpace(getenv("AWS_ACCESS_KEY_ID")),
		awsSecret: strings.TrimSpace(getenv("AWS_SECRET_ACCESS_KEY")),
	}
	// Auto-select when not explicitly set: Resend if its key is present, else SES
	// if AWS creds are present, else fall through to SMTP.
	if p.provider == "" {
		switch {
		case p.resendKey != "":
			p.provider = "resend"
		case p.awsKey != "" && p.awsSecret != "" && p.awsRegion != "":
			p.provider = "ses"
		default:
			p.provider = "smtp"
		}
	}
	return p
}

// sendVia dispatches to the configured non-SMTP backend. Returns (handled, err):
// handled=false means "not my backend — fall back to SMTP".
func (m *Mailer) sendVia(ctx context.Context, to []string, subject, htmlBody string, atts []Attachment) (bool, error) {
	switch m.prov.provider {
	case "resend":
		return true, m.sendResend(ctx, to, subject, htmlBody, atts)
	case "ses":
		return true, m.sendSES(ctx, to, subject, htmlBody, atts)
	default:
		return false, nil
	}
}

// ── Resend (https://resend.com) ──────────────────────────────────────────────

func (m *Mailer) sendResend(ctx context.Context, to []string, subject, htmlBody string, atts []Attachment) error {
	type resendAtt struct {
		Filename string `json:"filename"`
		Content  string `json:"content"` // base64
	}
	body := map[string]any{
		"from":    m.cfg.From,
		"to":      to,
		"subject": subject,
		"html":    htmlBody,
	}
	if len(atts) > 0 {
		ra := make([]resendAtt, 0, len(atts))
		for _, a := range atts {
			ra = append(ra, resendAtt{Filename: a.Filename, Content: base64.StdEncoding.EncodeToString(a.Data)})
		}
		body["attachments"] = ra
	}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.prov.resendKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient().Do(req)
	if err != nil {
		return errors.New("email: resend request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		io.Copy(io.Discard, resp.Body)
		return fmt.Errorf("email: resend status %d", resp.StatusCode)
	}
	return nil
}

// ── Amazon SES v2 SendEmail (raw MIME, signed with SigV4 — no AWS SDK) ────────

func (m *Mailer) sendSES(ctx context.Context, to []string, subject, htmlBody string, atts []Attachment) error {
	raw, err := BuildMIME(m.cfg.From, to, subject, htmlBody, atts)
	if err != nil {
		return fmt.Errorf("email: build message: %w", err)
	}
	reqBody, _ := json.Marshal(map[string]any{
		"Content": map[string]any{
			"Raw": map[string]any{"Data": base64.StdEncoding.EncodeToString(raw)},
		},
	})
	host := "email." + m.prov.awsRegion + ".amazonaws.com"
	endpoint := "https://" + host + "/v2/email/outbound-emails"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := signSigV4(req, reqBody, "ses", m.prov.awsRegion, m.prov.awsKey, m.prov.awsSecret, time.Now().UTC()); err != nil {
		return err
	}
	resp, err := httpClient().Do(req)
	if err != nil {
		return errors.New("email: ses request failed")
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		io.Copy(io.Discard, resp.Body)
		return fmt.Errorf("email: ses status %d", resp.StatusCode)
	}
	return nil
}

func httpClient() *http.Client { return &http.Client{Timeout: sendTimeout} }

// signSigV4 applies an AWS Signature V4 to req (Authorization + x-amz-date) for a
// JSON POST. Compact, dependency-free; deterministic given `now` for testability.
func signSigV4(req *http.Request, body []byte, service, region, accessKey, secretKey string, now time.Time) error {
	if region == "" || accessKey == "" || secretKey == "" {
		return errors.New("email: ses requires AWS_REGION + AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY")
	}
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")
	host := req.URL.Host

	payloadHash := hexSHA256(body)
	req.Header.Set("Host", host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)

	// Canonical request (signed headers: host, x-amz-content-sha256, x-amz-date).
	signedHeaders := "host;x-amz-content-sha256;x-amz-date"
	canonicalHeaders := fmt.Sprintf("host:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n", host, payloadHash, amzDate)
	canonicalReq := strings.Join([]string{
		req.Method, req.URL.EscapedPath(), req.URL.RawQuery,
		canonicalHeaders, signedHeaders, payloadHash,
	}, "\n")

	scope := strings.Join([]string{dateStamp, region, service, "aws4_request"}, "/")
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256", amzDate, scope, hexSHA256([]byte(canonicalReq)),
	}, "\n")

	kDate := hmacSHA256([]byte("AWS4"+secretKey), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, service)
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))

	auth := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, scope, signedHeaders, signature)
	req.Header.Set("Authorization", auth)
	return nil
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func hexSHA256(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}
