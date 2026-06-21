// Package embed provides a real, deterministic, dependency-free local text
// embedder for gitstate's semantic issue search. It turns arbitrary text into a
// fixed-dimension dense vector that can be stored in the pgvector `issues.embedding`
// column and compared with cosine distance.
//
// Why local + deterministic?
//   - No external service, no network, no API key — works offline in dev and CI.
//   - Deterministic: the same text ALWAYS produces the same vector, so re-embedding
//     is idempotent and tests are stable.
//
// The default embedder uses the classic "hashing trick" (feature hashing): text is
// tokenised into word unigrams + character 3-grams, each feature is signed-hashed
// into one of Dim buckets, accumulated with a log-scaled term-frequency weight, and
// the resulting vector is L2-normalised. Character 3-grams give it robustness to
// typos / morphology (so "authentication" and "authenticate" share most of their
// trigrams), while word tokens anchor exact terms. Cosine similarity of the
// normalised vectors then measures shared content.
//
// A neural provider (OpenAI / a local ONNX model / etc.) can replace the default by
// implementing the Embedder interface; the local one is the shipped, no-config
// default. Vectors are bound to Postgres as a text literal and cast `::vector` in
// SQL (no pgvector-go dependency).
package embed

import (
	"hash/fnv"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// Dim is the embedding dimension. It MUST match the pgvector column width
// (migration 021: issues.embedding vector(256)).
const Dim = 256

// Embedder produces a fixed-dimension embedding for a piece of text and reports
// the model identifier it was produced with. The local default is deterministic
// and dependency-free; a neural provider can satisfy this interface later.
type Embedder interface {
	// Embed returns a Dim-length L2-normalised vector for text. A zero/empty text
	// yields the zero vector (which is safe to store and compares as similarity 0).
	Embed(text string) []float32
	// Model returns the stable identifier persisted alongside the vector so a
	// future re-embed can detect a model change.
	Model() string
}

// localModelID is the stable identifier for the built-in hashing embedder.
const localModelID = "local-hash-256"

// Local is the default, deterministic, dependency-free embedder.
type Local struct{}

// NewLocal returns the shipped default embedder. No config, no network.
func NewLocal() Local { return Local{} }

// Default is the package-level default Embedder used by the convenience helpers
// Embed and Model. Reassign it to swap in a neural provider process-wide.
var Default Embedder = NewLocal()

// Embed is a convenience wrapper around Default.Embed.
func Embed(text string) []float32 { return Default.Embed(text) }

// Model is a convenience wrapper around Default.Model.
func Model() string { return Default.Model() }

// Model implements Embedder.
func (Local) Model() string { return localModelID }

// Embed implements Embedder. It tokenises text into word unigrams and character
// 3-grams, signed-hashes each feature into [0,Dim) with a log-TF weight, then
// L2-normalises the accumulated vector. Deterministic and zero-vector safe.
func (Local) Embed(text string) []float32 {
	vec := make([]float32, Dim)

	tokens := tokenize(text)
	if len(tokens) == 0 {
		return vec // zero vector — safe to store; cosine similarity will be 0.
	}

	// Accumulate raw term frequencies per feature so we can apply a log-TF weight
	// (1 + ln(tf)) which dampens very repetitive text without dropping signal.
	counts := make(map[string]int)
	for _, tok := range tokens {
		counts["w:"+tok]++ // word unigram feature
		for _, tg := range charTrigrams(tok) {
			counts["c:"+tg]++ // character 3-gram feature
		}
	}

	for feat, tf := range counts {
		bucket, sign := hashFeature(feat)
		weight := float32(1.0 + math.Log(float64(tf)))
		vec[bucket] += sign * weight
	}

	l2Normalize(vec)
	return vec
}

// tokenize lowercases text and splits it into alphanumeric word tokens. Anything
// that is not a letter or digit is treated as a separator.
func tokenize(text string) []string {
	text = strings.ToLower(text)
	fields := strings.FieldsFunc(text, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	return fields
}

// charTrigrams returns the character 3-grams of a single token, padded with a
// leading/trailing space so prefixes and suffixes are represented. A short token
// (<3 runes after padding has no full window) still yields at least one gram via
// the padding. Operates on runes for unicode safety.
func charTrigrams(tok string) []string {
	padded := " " + tok + " "
	runes := []rune(padded)
	if len(runes) < 3 {
		return []string{padded}
	}
	out := make([]string, 0, len(runes)-2)
	for i := 0; i+3 <= len(runes); i++ {
		out = append(out, string(runes[i:i+3]))
	}
	return out
}

// hashFeature maps a feature string to a (bucket, sign) pair using FNV-1a. The
// sign bit is taken from an independent low bit of the hash so collisions are as
// likely to cancel as to reinforce — the standard signed hashing trick that keeps
// the embedding approximately unbiased.
func hashFeature(feat string) (bucket int, sign float32) {
	h := fnv.New32a()
	_, _ = h.Write([]byte(feat))
	sum := h.Sum32()
	bucket = int(sum % uint32(Dim))
	if sum&0x80000000 != 0 {
		return bucket, -1
	}
	return bucket, 1
}

// l2Normalize scales vec in place to unit L2 norm. A zero vector is left
// unchanged (no division by zero).
func l2Normalize(vec []float32) {
	var sumSq float64
	for _, v := range vec {
		sumSq += float64(v) * float64(v)
	}
	if sumSq == 0 {
		return
	}
	norm := float32(math.Sqrt(sumSq))
	for i := range vec {
		vec[i] /= norm
	}
}

// ToPGVector formats a vector as a pgvector text literal, e.g. "[0.1,0.2,...]",
// suitable for binding as a parameter and casting `::vector` in SQL. Values use
// the shortest round-trippable float32 representation.
func ToPGVector(v []float32) string {
	var b strings.Builder
	b.Grow(len(v)*10 + 2)
	b.WriteByte('[')
	for i, f := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(f), 'g', -1, 32))
	}
	b.WriteByte(']')
	return b.String()
}

// Cosine returns the cosine similarity of two equal-length vectors. For
// already-L2-normalised vectors (as produced by Embed) this is just the dot
// product. Returns 0 when either vector is the zero vector or lengths differ.
// Exposed primarily for tests and callers that want to score in-process.
func Cosine(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
