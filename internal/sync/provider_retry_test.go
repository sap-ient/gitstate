// Package sync — unit tests for the rate-limit-aware retry helpers that make a
// sync COMPLETE (slow but never truncated) under GitHub/GitLab rate limits.
package sync

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"

	gogithub "github.com/google/go-github/v66/github"
	gogitlab "gitlab.com/gitlab-org/api/client-go"
)

// TestGhDoRetriesOnRateLimit proves ghDo sleeps until the (near-now) reset and
// RETRIES rather than surfacing the rate-limit error: the fake fn fails once with
// a *gogithub.RateLimitError, then succeeds, and ghDo must return the value.
func TestGhDoRetriesOnRateLimit(t *testing.T) {
	calls := 0
	// Reset ~now so the ctx-aware sleep is tiny (a few ms), keeping the test fast.
	rle := &gogithub.RateLimitError{
		Rate: gogithub.Rate{Reset: gogithub.Timestamp{Time: time.Now().Add(20 * time.Millisecond)}},
	}
	got, _, err := ghDo(context.Background(), func() (string, *gogithub.Response, error) {
		calls++
		if calls == 1 {
			return "", nil, rle
		}
		return "ok", nil, nil
	})
	if err != nil {
		t.Fatalf("ghDo returned error: %v", err)
	}
	if got != "ok" {
		t.Errorf("ghDo value = %q, want \"ok\"", got)
	}
	if calls != 2 {
		t.Errorf("fn called %d times, want 2 (retried once after rate limit)", calls)
	}
}

// TestGhDoRetriesOnSecondaryRateLimit covers the *gogithub.AbuseRateLimitError
// (secondary) path with a small RetryAfter.
func TestGhDoRetriesOnSecondaryRateLimit(t *testing.T) {
	calls := 0
	d := 10 * time.Millisecond
	arle := &gogithub.AbuseRateLimitError{RetryAfter: &d}
	got, _, err := ghDo(context.Background(), func() (int, *gogithub.Response, error) {
		calls++
		if calls == 1 {
			return 0, nil, arle
		}
		return 42, nil, nil
	})
	if err != nil {
		t.Fatalf("ghDo returned error: %v", err)
	}
	if got != 42 || calls != 2 {
		t.Errorf("got=%d calls=%d, want 42 / 2", got, calls)
	}
}

// TestGhDoStopsOnContextCancel proves a rate-limit wait is ctx-aware: a cancelled
// context aborts the sleep and surfaces the ctx error rather than hanging.
func TestGhDoStopsOnContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	rle := &gogithub.RateLimitError{
		Rate: gogithub.Rate{Reset: gogithub.Timestamp{Time: time.Now().Add(time.Hour)}},
	}
	_, _, err := ghDo(ctx, func() (string, *gogithub.Response, error) {
		return "", nil, rle
	})
	if !errors.Is(err, context.Canceled) {
		t.Errorf("err = %v, want context.Canceled", err)
	}
}

// TestGlDoRetriesOn429 proves the GitLab helper detects HTTP 429, honours
// Retry-After, waits, and retries.
func TestGlDoRetriesOn429(t *testing.T) {
	calls := 0
	resp := &gogitlab.Response{Response: &http.Response{
		StatusCode: 429,
		Header:     http.Header{"Retry-After": []string{"1"}}, // 1s honoured by the helper
	}}
	got, _, err := glDo(context.Background(), func() (string, *gogitlab.Response, error) {
		calls++
		if calls == 1 {
			return "", resp, errors.New("429 Too Many Requests")
		}
		return "done", nil, nil
	})
	if err != nil {
		t.Fatalf("glDo returned error: %v", err)
	}
	if got != "done" || calls != 2 {
		t.Errorf("got=%q calls=%d, want done / 2", got, calls)
	}
}

// TestRetryAfter checks the Retry-After header parser.
func TestRetryAfter(t *testing.T) {
	if d := retryAfter("12"); d != 12*time.Second {
		t.Errorf("retryAfter(\"12\") = %v, want 12s", d)
	}
	if d := retryAfter(""); d != 0 {
		t.Errorf("retryAfter(\"\") = %v, want 0", d)
	}
	if d := retryAfter("nope"); d != 0 {
		t.Errorf("retryAfter(\"nope\") = %v, want 0", d)
	}
}
