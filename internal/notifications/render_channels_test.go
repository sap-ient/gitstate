package notifications

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ── Discord ─────────────────────────────────────────────────────────────────

func TestRenderDiscord_Structure(t *testing.T) {
	d := sampleDigest()
	p := renderDiscord(d)

	if p["content"] == "" || p["content"] == nil {
		t.Error("discord payload missing content")
	}
	embeds, ok := p["embeds"].([]map[string]any)
	if !ok || len(embeds) != 1 {
		t.Fatalf("embeds missing or wrong type: %T", p["embeds"])
	}
	e := embeds[0]
	if e["title"] != "Weekly status" {
		t.Errorf("embed title = %v", e["title"])
	}
	if e["color"] != brandColorInt {
		t.Errorf("embed color = %v, want %d", e["color"], brandColorInt)
	}
	fields, ok := e["fields"].([]map[string]any)
	if !ok || len(fields) == 0 {
		t.Fatalf("embed fields missing: %T", e["fields"])
	}
	// First two fields are the inline metrics.
	if fields[0]["name"] != "Issues shipped" || fields[0]["inline"] != true {
		t.Errorf("metric field[0] = %+v", fields[0])
	}
	// A section field (non-inline) with the bulleted evidence exists.
	foundSection := false
	for _, f := range fields {
		if f["name"] == "Recent movement" && f["inline"] == false {
			foundSection = true
			if !strings.Contains(f["value"].(string), "• Fixed login bug") {
				t.Errorf("section field value = %v", f["value"])
			}
		}
	}
	if !foundSection {
		t.Error("expected a non-inline 'Recent movement' section field")
	}
	// Valid JSON.
	if _, err := json.Marshal(p); err != nil {
		t.Errorf("discord payload not marshalable: %v", err)
	}
}

func TestRenderDiscord_EmptyState(t *testing.T) {
	d := &Digest{Title: "Stale PRs", GeneratedAt: genAt(), Empty: true, EmptyReason: "Nothing is blocked."}
	p := renderDiscord(d)
	if p["content"] != "Stale PRs — nothing to report" {
		t.Errorf("empty content = %v", p["content"])
	}
	e := p["embeds"].([]map[string]any)[0]
	if !strings.Contains(e["description"].(string), "Nothing is blocked.") {
		t.Errorf("empty description = %v", e["description"])
	}
}

func TestRenderDiscord_Escapes(t *testing.T) {
	d := &Digest{
		Title:       "T",
		GeneratedAt: genAt(),
		Sections: []Section{
			{Heading: "H*x", Lines: []Line{{Text: "a_b *c* `d`", Meta: "by ~e~"}}},
		},
	}
	p := renderDiscord(d)
	blob, _ := json.Marshal(p)
	s := string(blob)
	// Markdown control chars in user content must be backslash-escaped.
	if strings.Contains(s, "a_b *c*") {
		t.Errorf("discord did not escape markdown control chars: %s", s)
	}
	if !strings.Contains(s, `\\_`) && !strings.Contains(s, `\_`) {
		t.Errorf("expected escaped underscore in output: %s", s)
	}
}

// ── Google Chat ─────────────────────────────────────────────────────────────

func TestRenderGoogleChat_Structure(t *testing.T) {
	d := sampleDigest()
	p := renderGoogleChat(d)
	text, ok := p["text"].(string)
	if !ok || text == "" {
		t.Fatalf("google chat payload missing text: %T", p["text"])
	}
	if !strings.HasPrefix(text, "*Weekly status*") {
		t.Errorf("text should start with bold title, got: %q", text[:min(40, len(text))])
	}
	if !strings.Contains(text, "• Fixed login bug") {
		t.Errorf("evidence bullet missing:\n%s", text)
	}
	if !strings.Contains(text, "*Recent movement*") {
		t.Errorf("section heading missing:\n%s", text)
	}
	if _, err := json.Marshal(p); err != nil {
		t.Errorf("google chat payload not marshalable: %v", err)
	}
}

func TestRenderGoogleChat_EmptyState(t *testing.T) {
	d := &Digest{Title: "Who's out", GeneratedAt: genAt(), Empty: true, EmptyReason: "Full availability."}
	text := renderGoogleChat(d)["text"].(string)
	if !strings.Contains(text, "Full availability.") {
		t.Errorf("empty reason missing:\n%s", text)
	}
}

func TestRenderGoogleChat_Escapes(t *testing.T) {
	d := &Digest{
		Title:       "*evil* <a|b>",
		GeneratedAt: genAt(),
	}
	text := renderGoogleChat(d)["text"].(string)
	// The user-supplied asterisks/angle brackets must be neutralised so they are
	// not interpreted as Chat formatting; only our own wrapping *…* remains.
	if strings.Contains(text, "<a|b>") {
		t.Errorf("angle-bracket link syntax not neutralised:\n%s", text)
	}
}

// ── Microsoft Teams ─────────────────────────────────────────────────────────

func TestRenderTeams_Structure(t *testing.T) {
	d := sampleDigest()
	p := renderTeams(d)

	if p["@type"] != "MessageCard" {
		t.Errorf("@type = %v, want MessageCard", p["@type"])
	}
	if p["themeColor"] != brandColorHex {
		t.Errorf("themeColor = %v, want %s", p["themeColor"], brandColorHex)
	}
	if p["title"] != "Weekly status" {
		t.Errorf("title = %v", p["title"])
	}
	if p["summary"] == "" || p["summary"] == nil {
		t.Error("summary missing")
	}
	sections, ok := p["sections"].([]map[string]any)
	if !ok || len(sections) == 0 {
		t.Fatalf("sections missing: %T", p["sections"])
	}
	// The lead section carries the metric facts.
	foundFacts := false
	for _, s := range sections {
		if facts, ok := s["facts"].([]map[string]any); ok && len(facts) == 2 {
			foundFacts = true
			if facts[0]["name"] != "Issues shipped" {
				t.Errorf("fact[0] = %+v", facts[0])
			}
		}
	}
	if !foundFacts {
		t.Error("expected a section with 2 metric facts")
	}
	// A section carries the evidence text.
	joined := ""
	for _, s := range sections {
		if t, ok := s["text"].(string); ok {
			joined += t
		}
	}
	if !strings.Contains(joined, "Fixed login bug") {
		t.Errorf("evidence text missing from sections:\n%s", joined)
	}
	if _, err := json.Marshal(p); err != nil {
		t.Errorf("teams payload not marshalable: %v", err)
	}
}

func TestRenderTeams_EmptyState(t *testing.T) {
	d := &Digest{Title: "Stale PRs", GeneratedAt: genAt(), Empty: true, EmptyReason: "Nothing is blocked."}
	p := renderTeams(d)
	sections := p["sections"].([]map[string]any)
	if !strings.Contains(sections[0]["text"].(string), "Nothing is blocked.") {
		t.Errorf("empty reason missing: %v", sections[0])
	}
}

func TestRenderTeams_Escapes(t *testing.T) {
	d := &Digest{
		Title:       "T",
		GeneratedAt: genAt(),
		Sections: []Section{
			{Heading: "H", Lines: []Line{{Text: "a<b>c & *d*"}}},
		},
	}
	blob, _ := json.Marshal(renderTeams(d))
	s := string(blob)
	if strings.Contains(s, "a<b>c") {
		t.Errorf("teams did not HTML-escape angle brackets: %s", s)
	}
}

// ── Render aggregates all payloads ──────────────────────────────────────────

func TestRender_AllPayloads(t *testing.T) {
	r := Render(sampleDigest())
	if r.SlackPayload == nil || r.DiscordPayload == nil ||
		r.GoogleChatPayload == nil || r.TeamsPayload == nil {
		t.Error("Render should populate every per-platform payload")
	}
	for _, kind := range []string{"slack", "webhook", "discord", "google_chat", "teams"} {
		if r.PayloadFor(kind) == nil {
			t.Errorf("PayloadFor(%q) = nil", kind)
		}
	}
	if r.PayloadFor("email") != nil {
		t.Error("PayloadFor(email) should be nil")
	}
	if r.PayloadFor("nope") != nil {
		t.Error("PayloadFor(unknown) should be nil")
	}
}

// ── Deliver routing (httptest) ──────────────────────────────────────────────

// TestDeliver_SelectsPayloadPerKind asserts the kind→payload router picks the
// platform-native body shape for each kind, without touching the network.
func TestDeliver_SelectsPayloadPerKind(t *testing.T) {
	r := Render(sampleDigest())
	cases := []struct {
		kind   string
		assert func(map[string]any) bool
	}{
		{"slack", func(p map[string]any) bool { _, ok := p["blocks"]; return ok }},
		{"webhook", func(p map[string]any) bool { _, ok := p["blocks"]; return ok }},
		{"discord", func(p map[string]any) bool { _, ok := p["embeds"]; return ok }},
		{"google_chat", func(p map[string]any) bool { _, ok := p["text"].(string); return ok }},
		{"teams", func(p map[string]any) bool { return p["@type"] == "MessageCard" }},
	}
	for _, c := range cases {
		p := r.PayloadFor(c.kind)
		if p == nil {
			t.Errorf("PayloadFor(%q) = nil", c.kind)
			continue
		}
		if !c.assert(p) {
			t.Errorf("PayloadFor(%q) wrong shape: %v", c.kind, p)
		}
	}
}

// TestDeliver_PostsNativeBody verifies the end-to-end POST body shape against a
// real httptest server. The server listens on loopback; to exercise the actual
// postWebhook path we temporarily swap the shared client's transport for a plain
// one (no SSRF guard) so the request reaches the test server. SSRF coverage for
// the new kinds is asserted separately in TestDeliver_SSRFGuardsNewKinds.
func TestDeliver_PostsNativeBody(t *testing.T) {
	bodies := make(map[string][]byte)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		b, _ := io.ReadAll(req.Body)
		bodies[req.URL.Path] = b
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	// Swap in a guard-free transport for the duration of this test.
	orig := httpClient.Transport
	httpClient.Transport = http.DefaultTransport
	defer func() { httpClient.Transport = orig }()

	r := Render(sampleDigest())
	cases := []struct {
		kind  string
		check func(t *testing.T, body []byte)
	}{
		{"discord", func(t *testing.T, body []byte) {
			var m map[string]any
			if err := json.Unmarshal(body, &m); err != nil {
				t.Fatalf("discord body not JSON: %v", err)
			}
			if _, ok := m["embeds"]; !ok {
				t.Errorf("discord body missing embeds: %s", body)
			}
		}},
		{"google_chat", func(t *testing.T, body []byte) {
			var m map[string]any
			if err := json.Unmarshal(body, &m); err != nil {
				t.Fatalf("google_chat body not JSON: %v", err)
			}
			if _, ok := m["text"].(string); !ok {
				t.Errorf("google_chat body missing text: %s", body)
			}
		}},
		{"teams", func(t *testing.T, body []byte) {
			var m map[string]any
			if err := json.Unmarshal(body, &m); err != nil {
				t.Fatalf("teams body not JSON: %v", err)
			}
			if m["@type"] != "MessageCard" {
				t.Errorf("teams body not a MessageCard: %s", body)
			}
		}},
		{"slack", func(t *testing.T, body []byte) {
			var m map[string]any
			if err := json.Unmarshal(body, &m); err != nil {
				t.Fatalf("slack body not JSON: %v", err)
			}
			if _, ok := m["blocks"]; !ok {
				t.Errorf("slack body missing blocks: %s", body)
			}
		}},
	}
	for _, c := range cases {
		path := "/" + c.kind
		if err := Deliver(context.Background(), c.kind, srv.URL+path, r); err != nil {
			t.Fatalf("Deliver(%q) error: %v", c.kind, err)
		}
		c.check(t, bodies[path])
	}
}

// TestDeliver_SSRFGuardsNewKinds confirms the SSRF guard blocks an internal URL
// for every new webhook kind (the guard is shared by postWebhook).
func TestDeliver_SSRFGuardsNewKinds(t *testing.T) {
	r := Render(sampleDigest())
	for _, kind := range []string{"discord", "google_chat", "teams"} {
		// Bad scheme.
		if err := Deliver(context.Background(), kind, "ftp://evil/", r); err == nil {
			t.Errorf("Deliver(%q, ftp) accepted, want rejected", kind)
		}
		// Loopback target → SSRF sentinel.
		err := Deliver(context.Background(), kind, "http://127.0.0.1:9/hook", r)
		if err == nil {
			t.Errorf("Deliver(%q, loopback) accepted, want blocked", kind)
		}
	}
}
