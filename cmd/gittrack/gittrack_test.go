package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// TestClientRequestBuilding verifies that do() sets the Authorization header,
// joins the base URL + path correctly, and surfaces the body for 2xx.
func TestClientRequestBuilding(t *testing.T) {
	var gotAuth, gotPath, gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		gotQuery = r.URL.RawQuery
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	cl := newClient(srv.URL+"/", "gsk_secret123") // trailing slash must be trimmed
	body, err := cl.do("GET", "/api/issues?state=open")
	if err != nil {
		t.Fatalf("do: %v", err)
	}

	if gotAuth != "Bearer gsk_secret123" {
		t.Errorf("Authorization = %q, want Bearer gsk_secret123", gotAuth)
	}
	if gotPath != "/api/issues" {
		t.Errorf("path = %q, want /api/issues", gotPath)
	}
	if gotQuery != "state=open" {
		t.Errorf("query = %q, want state=open", gotQuery)
	}
	if string(body) != `{"ok":true}` {
		t.Errorf("body = %q", body)
	}
}

// TestClientErrorBody verifies non-2xx responses surface the server's error
// body via *apiError.
func TestClientErrorBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":"invalid token"}`))
	}))
	defer srv.Close()

	cl := newClient(srv.URL, "gsk_bad")
	_, err := cl.do("GET", "/api/issues")
	if err == nil {
		t.Fatal("expected error for 401")
	}
	ae, ok := err.(*apiError)
	if !ok {
		t.Fatalf("error type = %T, want *apiError", err)
	}
	if ae.status != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", ae.status)
	}
	if !strings.Contains(err.Error(), "invalid token") {
		t.Errorf("error %q should include server body", err.Error())
	}
}

// TestResolveClientMissingToken ensures a missing token is a hard error and the
// token is never echoed in the message.
func TestResolveClientMissingToken(t *testing.T) {
	t.Setenv(envToken, "")
	t.Setenv(envURL, "")
	_, err := resolveClient("", "")
	if err == nil {
		t.Fatal("expected error when no token set")
	}
	if !strings.Contains(err.Error(), envToken) {
		t.Errorf("error should mention %s, got %q", envToken, err.Error())
	}
}

// TestResolveClientPrecedence checks flag > env > default resolution for URL.
func TestResolveClientPrecedence(t *testing.T) {
	t.Setenv(envURL, "http://env-host:9000")
	t.Setenv(envToken, "gsk_env")

	// Flag overrides env.
	cl, err := resolveClient("http://flag-host:1", "gsk_flag")
	if err != nil {
		t.Fatal(err)
	}
	if cl.baseURL != "http://flag-host:1" {
		t.Errorf("baseURL = %q, want flag value", cl.baseURL)
	}
	if cl.token != "gsk_flag" {
		t.Errorf("token = %q, want flag value", cl.token)
	}

	// Env used when no flag.
	cl2, err := resolveClient("", "")
	if err != nil {
		t.Fatal(err)
	}
	if cl2.baseURL != "http://env-host:9000" || cl2.token != "gsk_env" {
		t.Errorf("env resolution wrong: url=%q token=%q", cl2.baseURL, cl2.token)
	}
}

// TestMaskTokenNeverLeaks ensures the secret body is never fully printed.
func TestMaskTokenNeverLeaks(t *testing.T) {
	tok := "gsk_abcdefghijklmnop"
	masked := maskToken(tok)
	if masked == tok {
		t.Fatal("mask returned the full token")
	}
	if strings.Contains(masked, "efghijklmnop") {
		t.Errorf("mask %q leaks secret body", masked)
	}
	if !strings.HasPrefix(masked, "gsk_") {
		t.Errorf("mask %q should keep the gsk_ prefix", masked)
	}
	if got := maskToken(""); got != "(none)" {
		t.Errorf("empty token mask = %q, want (none)", got)
	}
}

// TestRunDispatch covers top-level arg parsing exit codes.
func TestRunDispatch(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want int
	}{
		{"no args", nil, 2},
		{"help", []string{"help"}, 0},
		{"help flag", []string{"-h"}, 0},
		{"unknown", []string{"frobnicate"}, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := run(tc.args); got != tc.want {
				t.Errorf("run(%v) = %d, want %d", tc.args, got, tc.want)
			}
		})
	}
}

// TestCmdContextEndpointAndSummary drives cmdContext against an httptest server
// and verifies (a) it hits the right URL with auth, (b) summary output mode.
func TestCmdContextEndpointAndSummary(t *testing.T) {
	var gotPath, gotAuth string
	bundle := issueContext{
		Issue: issue{Number: 42, Title: "Login bug", State: "open", Labels: []string{"bug"}},
		RelatedPRs: []relatedPR{
			{Number: 7, Title: "Fix login", State: "merged", Merged: true, LeadTimeSecs: 90000},
		},
		Commits:      []relatedCommit{{SHA: "abcdef1234567890", Subject: "patch auth"}},
		TouchedPaths: []string{"internal/auth/login.go"},
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		json.NewEncoder(w).Encode(bundle)
	}))
	defer srv.Close()

	out := captureStdout(t, func() int {
		return cmdContext([]string{"42", "--url", srv.URL, "--token", "gsk_t"})
	})

	if gotPath != "/api/context/issue/42" {
		t.Errorf("path = %q", gotPath)
	}
	if gotAuth != "Bearer gsk_t" {
		t.Errorf("auth = %q", gotAuth)
	}
	for _, want := range []string{"#42", "Login bug", "Related PRs", "#7", "internal/auth/login.go"} {
		if !strings.Contains(out, want) {
			t.Errorf("summary missing %q in:\n%s", want, out)
		}
	}
	// Summary mode should NOT be raw JSON.
	if strings.Contains(out, `"title":`) {
		t.Errorf("summary output looks like raw JSON:\n%s", out)
	}
}

// TestCmdContextJSON verifies --json streams the server payload (raw fields).
func TestCmdContextJSON(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"issue":{"number":9,"title":"raw"},"extraField":"kept"}`))
	}))
	defer srv.Close()

	out := captureStdout(t, func() int {
		return cmdContext([]string{"9", "--json", "--url", srv.URL, "--token", "gsk_t"})
	})

	if !strings.Contains(out, `"extraField"`) {
		t.Errorf("--json should preserve unknown server fields:\n%s", out)
	}
	if !strings.Contains(out, `"title": "raw"`) {
		t.Errorf("--json should pretty-print server payload:\n%s", out)
	}
}

// TestCmdIssuesLimitAndState verifies --state is sent as a query param and
// --limit caps the table.
func TestCmdIssuesLimitAndState(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		json.NewEncoder(w).Encode([]issue{
			{Number: 1, Title: "one", State: "open"},
			{Number: 2, Title: "two", State: "open"},
			{Number: 3, Title: "three", State: "open"},
		})
	}))
	defer srv.Close()

	out := captureStdout(t, func() int {
		return cmdIssues([]string{"--state", "open", "--limit", "2", "--url", srv.URL, "--token", "gsk_t"})
	})

	if gotQuery != "state=open" {
		t.Errorf("query = %q, want state=open", gotQuery)
	}
	if !strings.Contains(out, "#1") || !strings.Contains(out, "#2") {
		t.Errorf("expected first two issues:\n%s", out)
	}
	if strings.Contains(out, "#3") {
		t.Errorf("--limit 2 should drop #3:\n%s", out)
	}
}

// TestCmdWhoami exercises the validation path and confirms the token body is
// never printed.
func TestCmdWhoami(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	out := captureStdout(t, func() int {
		return cmdWhoami([]string{"--url", srv.URL, "--token", "gsk_supersecretbody"})
	})

	if !strings.Contains(out, "OK") {
		t.Errorf("whoami should report OK:\n%s", out)
	}
	if strings.Contains(out, "supersecretbody") {
		t.Errorf("whoami leaked the token body:\n%s", out)
	}
}

// captureStdout redirects os.Stdout for the duration of fn and returns what was
// written. It restores the original on return.
func captureStdout(t *testing.T, fn func() int) string {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stdout = w
	defer func() { os.Stdout = old }()

	done := make(chan string, 1)
	go func() {
		var buf bytes.Buffer
		buf.ReadFrom(r)
		done <- buf.String()
	}()

	fn()
	w.Close()
	return <-done
}
