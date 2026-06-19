// Package llm — pure unit tests for prompt building, markdown-JSON stripping,
// difficulty-response parsing/clamping, and the Service operations driven by a
// fake in-memory Provider. No network, no API key.
package llm

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/exo/gitstate/internal/config"
)

// nilConfig returns a config with no API key, so New() yields a nil-provider
// Service (every operation returns ErrLLMNotConfigured).
func nilConfig() *config.Config { return &config.Config{} }

// fakeProvider returns a canned reply (or error) and records the last call.
type fakeProvider struct {
	reply      string
	err        error
	lastSystem string
	lastUser   string
}

func (f *fakeProvider) Complete(ctx context.Context, system, user string) (string, error) {
	f.lastSystem, f.lastUser = system, user
	return f.reply, f.err
}

// ── stripMarkdownJSON ───────────────────────────────────────────────────────

func TestStripMarkdownJSON(t *testing.T) {
	cases := []struct{ in, want string }{
		{`{"a":1}`, `{"a":1}`},
		{"```json\n{\"a\":1}\n```", `{"a":1}`},
		{"```\n{\"a\":2}\n```", `{"a":2}`},
		{"  ```json\n{\"a\":3}\n```  ", `{"a":3}`},
		{"{\"a\":4}", `{"a":4}`},
	}
	for _, c := range cases {
		if got := stripMarkdownJSON(c.in); got != c.want {
			t.Errorf("stripMarkdownJSON(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// ── parseDifficultyResponse ─────────────────────────────────────────────────

func TestParseDifficultyResponse(t *testing.T) {
	raw := "```json\n{\"difficulty\":7.5,\"rationale\":\"tricky\",\"evidence\":{\"key_changes\":[\"a\"]}}\n```"
	got, err := parseDifficultyResponse(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got.Difficulty != 7.5 {
		t.Errorf("difficulty = %v, want 7.5", got.Difficulty)
	}
	if got.Rationale != "tricky" {
		t.Errorf("rationale = %q", got.Rationale)
	}
	if got.Evidence["key_changes"] == nil {
		t.Error("evidence not parsed")
	}
}

func TestParseDifficultyResponse_Malformed(t *testing.T) {
	if _, err := parseDifficultyResponse("not json at all"); err == nil {
		t.Error("expected parse error on malformed JSON")
	}
}

// ── buildDiffPrompt ─────────────────────────────────────────────────────────

func TestBuildDiffPrompt(t *testing.T) {
	// All metadata present → header lines + fenced diff.
	got := buildDiffPrompt("the diff", DiffMeta{PRTitle: "Fix X", RepoName: "acme/repo", PRID: "id-1"})
	for _, want := range []string{"PR title: Fix X", "Repository: acme/repo", "PR ID: id-1", "Git diff:\n```\nthe diff\n```"} {
		if !strings.Contains(got, want) {
			t.Errorf("prompt missing %q:\n%s", want, got)
		}
	}
}

func TestBuildDiffPrompt_NoMeta(t *testing.T) {
	got := buildDiffPrompt("d", DiffMeta{})
	// No metadata header, no leading blank line before the diff.
	if strings.Contains(got, "PR title") || strings.Contains(got, "Repository") {
		t.Errorf("empty meta should not add header lines:\n%s", got)
	}
	if !strings.HasPrefix(got, "Git diff:\n```\nd\n```") {
		t.Errorf("prompt = %q", got)
	}
}

// ── buildStatusPrompt ───────────────────────────────────────────────────────

func TestBuildStatusPrompt(t *testing.T) {
	items := []ActivityItem{
		{Kind: "pr", Title: "Merge auth", Author: "ada", State: "merged"},
		{Kind: "issue", Title: "Broken login"},
		{Kind: "commit", Title: "wip", Summary: "extra detail"},
	}
	got := buildStatusPrompt(items)
	if !strings.HasPrefix(got, "Recent activity:") {
		t.Errorf("missing header:\n%s", got)
	}
	// Kind uppercased, numbered, author + state included when present.
	if !strings.Contains(got, "1. [PR] Merge auth (by ada) — merged") {
		t.Errorf("PR line wrong:\n%s", got)
	}
	// No author/state → no parenthetical or em-dash suffix.
	if !strings.Contains(got, "2. [ISSUE] Broken login\n") {
		t.Errorf("issue line wrong:\n%s", got)
	}
	// Summary rendered on its own indented line.
	if !strings.Contains(got, "3. [COMMIT] wip\n   extra detail") {
		t.Errorf("commit line wrong:\n%s", got)
	}
}

// ── Service.EstimateDifficulty ──────────────────────────────────────────────

func TestEstimateDifficulty_NotConfigured(t *testing.T) {
	s := New(nilConfig())
	if _, err := s.EstimateDifficulty(context.Background(), "diff", DiffMeta{}); !errors.Is(err, ErrLLMNotConfigured) {
		t.Errorf("expected ErrLLMNotConfigured, got %v", err)
	}
}

func TestEstimateDifficulty_ClampsRange(t *testing.T) {
	cases := []struct {
		reply string
		want  float64
	}{
		{`{"difficulty":5.5,"rationale":"r"}`, 5.5},
		{`{"difficulty":0,"rationale":"r"}`, 1},   // clamp up to 1
		{`{"difficulty":-3,"rationale":"r"}`, 1},  // clamp up to 1
		{`{"difficulty":42,"rationale":"r"}`, 10}, // clamp down to 10
	}
	for _, c := range cases {
		fp := &fakeProvider{reply: c.reply}
		s := NewWithProvider(fp, "test-model")
		got, err := s.EstimateDifficulty(context.Background(), "diff", DiffMeta{PRTitle: "T"})
		if err != nil {
			t.Fatalf("reply %q: %v", c.reply, err)
		}
		if got.Difficulty != c.want {
			t.Errorf("reply %q → difficulty %v, want %v", c.reply, got.Difficulty, c.want)
		}
		if got.Model != "test-model" {
			t.Errorf("model = %q, want test-model", got.Model)
		}
		// The system prompt used is the difficulty prompt; user carries the diff.
		if fp.lastSystem != systemEstimateDifficulty {
			t.Error("wrong system prompt used")
		}
		if !strings.Contains(fp.lastUser, "T") {
			t.Error("user prompt missing PR title")
		}
	}
}

func TestEstimateDifficulty_ProviderError(t *testing.T) {
	s := NewWithProvider(&fakeProvider{err: errors.New("boom")}, "m")
	if _, err := s.EstimateDifficulty(context.Background(), "d", DiffMeta{}); err == nil {
		t.Error("expected error propagated from provider")
	}
}

func TestEstimateDifficulty_BadJSON(t *testing.T) {
	s := NewWithProvider(&fakeProvider{reply: "garbage"}, "m")
	if _, err := s.EstimateDifficulty(context.Background(), "d", DiffMeta{}); err == nil {
		t.Error("expected parse error")
	}
}

// ── Service.SynthesizeStatus ────────────────────────────────────────────────

func TestSynthesizeStatus_TrimsAndUsesPrompt(t *testing.T) {
	fp := &fakeProvider{reply: "  Status: all good.  \n"}
	s := NewWithProvider(fp, "m")
	got, err := s.SynthesizeStatus(context.Background(), []ActivityItem{{Kind: "pr", Title: "x"}})
	if err != nil {
		t.Fatal(err)
	}
	if got != "Status: all good." {
		t.Errorf("result not trimmed: %q", got)
	}
	if fp.lastSystem != systemSynthesizeStatus {
		t.Error("wrong system prompt for synthesis")
	}
}

func TestSynthesizeStatus_NotConfigured(t *testing.T) {
	s := New(nilConfig())
	if _, err := s.SynthesizeStatus(context.Background(), nil); !errors.Is(err, ErrLLMNotConfigured) {
		t.Errorf("expected ErrLLMNotConfigured, got %v", err)
	}
}

// ── Service.Complete ────────────────────────────────────────────────────────

func TestComplete_NotConfigured(t *testing.T) {
	s := New(nilConfig())
	if _, err := s.Complete(context.Background(), "sys", "usr"); !errors.Is(err, ErrLLMNotConfigured) {
		t.Errorf("expected ErrLLMNotConfigured, got %v", err)
	}
}

func TestComplete_PassesThrough(t *testing.T) {
	fp := &fakeProvider{reply: "answer"}
	s := NewWithProvider(fp, "m")
	got, err := s.Complete(context.Background(), "SYS", "USR")
	if err != nil {
		t.Fatal(err)
	}
	if got != "answer" {
		t.Errorf("Complete = %q", got)
	}
	if fp.lastSystem != "SYS" || fp.lastUser != "USR" {
		t.Errorf("prompts not passed through: %q / %q", fp.lastSystem, fp.lastUser)
	}
}

func TestComplete_ProviderError(t *testing.T) {
	s := NewWithProvider(&fakeProvider{err: errors.New("x")}, "m")
	if _, err := s.Complete(context.Background(), "s", "u"); err == nil {
		t.Error("expected provider error")
	}
}
