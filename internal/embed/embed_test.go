package embed

import (
	"math"
	"strings"
	"testing"
)

// TestEmbedDeterministic: the same text always yields the identical vector.
func TestEmbedDeterministic(t *testing.T) {
	const text = "Fix authentication redirect loop on login"
	a := Embed(text)
	b := Embed(text)
	if len(a) != Dim || len(b) != Dim {
		t.Fatalf("expected Dim=%d vectors, got len(a)=%d len(b)=%d", Dim, len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("non-deterministic at index %d: %v != %v", i, a[i], b[i])
		}
	}
}

// TestEmbedNormalized: non-empty text produces a unit-L2 vector; empty text is the
// zero vector (and does not divide by zero).
func TestEmbedNormalized(t *testing.T) {
	v := Embed("semantic search over issues")
	var sumSq float64
	for _, f := range v {
		sumSq += float64(f) * float64(f)
	}
	norm := math.Sqrt(sumSq)
	if math.Abs(norm-1.0) > 1e-5 {
		t.Fatalf("expected unit L2 norm, got %v", norm)
	}

	z := Embed("")
	if len(z) != Dim {
		t.Fatalf("empty text: expected Dim=%d vector, got %d", Dim, len(z))
	}
	for i, f := range z {
		if f != 0 {
			t.Fatalf("empty text should be the zero vector; index %d = %v", i, f)
		}
	}
	// Whitespace / punctuation-only is also zero (no tokens).
	for _, f := range Embed("   ... !!! ") {
		if f != 0 {
			t.Fatalf("punctuation-only text should be the zero vector")
		}
	}
}

// TestEmbedNearDuplicateCosine: near-duplicate text is more similar than unrelated
// text. This is the property semantic search relies on.
func TestEmbedNearDuplicateCosine(t *testing.T) {
	base := "users cannot log in, the authentication flow is broken"
	nearDup := "users can not login; the authentication flow seems broken"
	unrelated := "update the billing invoice export to CSV format"

	simDup := Cosine(Embed(base), Embed(nearDup))
	simUnrel := Cosine(Embed(base), Embed(unrelated))

	if simDup <= simUnrel {
		t.Fatalf("near-duplicate cosine (%.4f) should exceed unrelated cosine (%.4f)", simDup, simUnrel)
	}
	if simDup <= 0 {
		t.Fatalf("expected positive similarity for near-duplicate text, got %.4f", simDup)
	}
	// Identical text is maximally similar (cosine ~1 for a normalised vector).
	if s := Cosine(Embed(base), Embed(base)); math.Abs(s-1.0) > 1e-5 {
		t.Fatalf("identical text cosine should be ~1, got %.6f", s)
	}
}

// TestEmbedTypoRobust: a single-character typo keeps most of the signal (the
// character-trigram features overlap), so the vectors remain close.
func TestEmbedTypoRobust(t *testing.T) {
	good := Embed("authentication")
	typo := Embed("authentcation") // missing an 'i'
	cross := Embed("deployment pipeline")
	if Cosine(good, typo) <= Cosine(good, cross) {
		t.Fatalf("typo variant should be closer than an unrelated word")
	}
}

// TestToPGVector: produces a valid pgvector literal of the right shape.
func TestToPGVector(t *testing.T) {
	lit := ToPGVector([]float32{0.5, -0.25, 0})
	if lit != "[0.5,-0.25,0]" {
		t.Fatalf("unexpected literal: %q", lit)
	}
	full := ToPGVector(Embed("hello world"))
	if !strings.HasPrefix(full, "[") || !strings.HasSuffix(full, "]") {
		t.Fatalf("literal must be bracketed: %q", full[:min(20, len(full))])
	}
	// Dim comma-separated values → Dim-1 commas.
	if got := strings.Count(full, ","); got != Dim-1 {
		t.Fatalf("expected %d commas for a Dim=%d vector, got %d", Dim-1, Dim, got)
	}
}

// TestModelID: the model identifier is stable.
func TestModelID(t *testing.T) {
	if Model() != "local-hash-256" {
		t.Fatalf("unexpected model id %q", Model())
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
