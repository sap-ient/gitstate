package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// capturedRequest records what the stand-in gitstate server received so tests
// can assert path, auth header, and body.
type capturedRequest struct {
	method string
	path   string
	rawURL string
	auth   string
	body   string
}

// newUpstream builds an httptest server standing in for gitstate. It records
// every request and replies per the route table; unknown routes 404.
func newUpstream(t *testing.T, captured *[]capturedRequest) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if captured != nil {
			*captured = append(*captured, capturedRequest{
				method: r.Method,
				path:   r.URL.Path,
				rawURL: r.URL.RequestURI(),
				auth:   r.Header.Get("Authorization"),
				body:   string(b),
			})
		}
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/api/search":
			_, _ = w.Write([]byte(`[{"id":"i1","title":"login bug"}]`))
		case strings.HasPrefix(r.URL.Path, "/api/context/issue/"):
			if strings.HasSuffix(r.URL.Path, "/missing") {
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":"issue not found"}`))
				return
			}
			_, _ = w.Write([]byte(`{"id":"i1","summary":"start here"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"no route"}`))
		}
	}))
}

// runScript drives a server over an in-memory stdin script and returns the
// parsed response lines plus the raw stdout bytes.
func runScript(t *testing.T, upstreamURL string, lines []string) ([]rpcResponse, []byte, []capturedRequest) {
	t.Helper()
	var captured []capturedRequest
	// Re-point the client at the upstream by constructing the server directly.
	srv := &server{
		client: newClient(upstreamURL, "gsk_test_token"),
		tools:  buildTools(),
		logger: log.New(io.Discard, "", 0),
	}

	in := strings.NewReader(strings.Join(lines, "\n") + "\n")
	var out bytes.Buffer
	if err := srv.serve(in, &out); err != nil {
		t.Fatalf("serve: %v", err)
	}

	var resps []rpcResponse
	sc := bufio.NewScanner(bytes.NewReader(out.Bytes()))
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var resp rpcResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			t.Fatalf("stdout line is not valid JSON-RPC: %q: %v", line, err)
		}
		resps = append(resps, resp)
	}
	return resps, out.Bytes(), captured
}

// idOf returns the numeric id of a response (tests use integer ids).
func idOf(t *testing.T, r rpcResponse) float64 {
	t.Helper()
	var id float64
	if err := json.Unmarshal(r.ID, &id); err != nil {
		t.Fatalf("response id not a number: %q", r.ID)
	}
	return id
}

func TestFullSession(t *testing.T) {
	var captured []capturedRequest
	up := newUpstream(t, &captured)
	defer up.Close()
	// captured is appended to by the upstream handler; share the slice.
	up.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		captured = append(captured, capturedRequest{
			method: r.Method, path: r.URL.Path, rawURL: r.URL.RequestURI(),
			auth: r.Header.Get("Authorization"), body: string(b),
		})
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/api/search":
			_, _ = w.Write([]byte(`[{"id":"i1","title":"login bug"}]`))
		case strings.HasSuffix(r.URL.Path, "/missing"):
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"issue not found"}`))
		case strings.HasPrefix(r.URL.Path, "/api/context/issue/"):
			_, _ = w.Write([]byte(`{"id":"i1","summary":"start here"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"no route"}`))
		}
	})

	script := []string{
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_issues","arguments":{"query":"login","type":"issues","limit":5}}}`,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_issue","arguments":{"id":"i1"}}}`,
	}
	resps, raw, _ := runScript(t, up.URL, script)

	// The notification must produce NO response: 4 requests with ids → 4 responses.
	if len(resps) != 4 {
		t.Fatalf("expected 4 responses (notification suppressed), got %d: %s", len(resps), raw)
	}

	// Every stdout line must be a well-formed JSON-RPC 2.0 object.
	for _, r := range resps {
		if r.JSONRPC != "2.0" {
			t.Errorf("response missing jsonrpc 2.0: %+v", r)
		}
	}

	// initialize
	init := resps[0]
	if idOf(t, init) != 1 {
		t.Errorf("initialize id = %v, want 1", idOf(t, init))
	}
	var ir initializeResult
	mustResult(t, init, &ir)
	if ir.ProtocolVersion != "2024-11-05" {
		t.Errorf("protocolVersion = %q", ir.ProtocolVersion)
	}
	if ir.ServerInfo.Name != "gitstate-mcp" || ir.ServerInfo.Version != "0.1.0" {
		t.Errorf("serverInfo = %+v", ir.ServerInfo)
	}
	if _, ok := ir.Capabilities["tools"]; !ok {
		t.Errorf("capabilities missing tools: %+v", ir.Capabilities)
	}

	// tools/list — all 6 tools present with object schemas.
	var lt listToolsResult
	mustResult(t, resps[1], &lt)
	if len(lt.Tools) != 6 {
		t.Fatalf("expected 6 tools, got %d", len(lt.Tools))
	}
	want := map[string]bool{
		"search_issues": false, "get_issue": false, "get_pr_context": false,
		"list_issues": false, "log_agent_run": false, "update_issue_state": false,
	}
	for _, tl := range lt.Tools {
		if _, ok := want[tl.Name]; !ok {
			t.Errorf("unexpected tool %q", tl.Name)
		}
		want[tl.Name] = true
		if tl.InputSchema["type"] != "object" {
			t.Errorf("tool %s inputSchema.type != object", tl.Name)
		}
		if _, ok := tl.InputSchema["properties"]; !ok {
			t.Errorf("tool %s inputSchema missing properties", tl.Name)
		}
	}
	for name, seen := range want {
		if !seen {
			t.Errorf("missing tool %q", name)
		}
	}

	// search_issues result — success, contains upstream body.
	searchRes := mustToolResult(t, resps[2])
	if searchRes.IsError {
		t.Errorf("search_issues returned isError")
	}
	if !strings.Contains(searchRes.Content[0].Text, "login bug") {
		t.Errorf("search_issues text missing upstream body: %q", searchRes.Content[0].Text)
	}

	// get_issue result — success.
	issueRes := mustToolResult(t, resps[3])
	if issueRes.IsError {
		t.Errorf("get_issue returned isError")
	}
	if !strings.Contains(issueRes.Content[0].Text, "start here") {
		t.Errorf("get_issue text missing upstream body: %q", issueRes.Content[0].Text)
	}

	// ── upstream request assertions ──
	if len(captured) != 2 {
		t.Fatalf("expected 2 upstream requests, got %d: %+v", len(captured), captured)
	}
	search := captured[0]
	if search.method != http.MethodGet || search.path != "/api/search" {
		t.Errorf("search upstream = %s %s", search.method, search.path)
	}
	if search.auth != "Bearer gsk_test_token" {
		t.Errorf("search Authorization = %q", search.auth)
	}
	// Query params correctly mapped (q, type, limit).
	for _, frag := range []string{"q=login", "type=issues", "limit=5"} {
		if !strings.Contains(search.rawURL, frag) {
			t.Errorf("search URL %q missing %q", search.rawURL, frag)
		}
	}
	issue := captured[1]
	if issue.method != http.MethodGet || issue.path != "/api/context/issue/i1" {
		t.Errorf("get_issue upstream = %s %s", issue.method, issue.path)
	}
	if issue.auth != "Bearer gsk_test_token" {
		t.Errorf("get_issue Authorization = %q", issue.auth)
	}

	// stdout must be protocol-only: nothing that fails to parse as JSON-RPC. We
	// already parsed every non-empty line above without fatal, so this re-asserts
	// there is no stray text.
	for _, line := range bytes.Split(bytes.TrimRight(raw, "\n"), []byte("\n")) {
		if len(bytes.TrimSpace(line)) == 0 {
			continue
		}
		var probe map[string]any
		if err := json.Unmarshal(line, &probe); err != nil {
			t.Fatalf("non-protocol bytes on stdout: %q", line)
		}
		if probe["jsonrpc"] != "2.0" {
			t.Fatalf("stdout line not a JSON-RPC frame: %q", line)
		}
	}
}

func TestToolErrorPassthrough(t *testing.T) {
	var captured []capturedRequest
	up := newUpstream(t, &captured)
	defer up.Close()

	// Upstream 404 → in-band tool error (isError:true), NOT a JSON-RPC error.
	script := []string{
		`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_issue","arguments":{"id":"missing"}}}`,
	}
	resps, _, _ := runScript(t, up.URL, script)
	if len(resps) != 1 {
		t.Fatalf("expected 1 response, got %d", len(resps))
	}
	r := resps[0]
	if r.Error != nil {
		t.Fatalf("upstream error surfaced as JSON-RPC error, want in-band: %+v", r.Error)
	}
	res := mustToolResult(t, r)
	if !res.IsError {
		t.Errorf("expected isError:true on upstream 404")
	}
	if !strings.Contains(res.Content[0].Text, "404") && !strings.Contains(res.Content[0].Text, "issue not found") {
		t.Errorf("error text missing upstream detail: %q", res.Content[0].Text)
	}
}

func TestMissingRequiredArg(t *testing.T) {
	var captured []capturedRequest
	up := newUpstream(t, &captured)
	defer up.Close()

	// No query → in-band tool error, no upstream call.
	script := []string{
		`{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"search_issues","arguments":{}}}`,
	}
	resps, _, _ := runScript(t, up.URL, script)
	res := mustToolResult(t, resps[0])
	if !res.IsError {
		t.Errorf("expected isError for missing query")
	}
	if len(captured) != 0 {
		t.Errorf("expected no upstream call on arg error, got %d", len(captured))
	}
}

func TestUnknownMethodIsJSONRPCError(t *testing.T) {
	up := newUpstream(t, &[]capturedRequest{})
	defer up.Close()
	script := []string{
		`{"jsonrpc":"2.0","id":11,"method":"does/not/exist"}`,
	}
	resps, _, _ := runScript(t, up.URL, script)
	r := resps[0]
	if r.Error == nil {
		t.Fatalf("expected JSON-RPC error for unknown method")
	}
	if r.Error.Code != codeMethodNotFound {
		t.Errorf("error code = %d, want %d", r.Error.Code, codeMethodNotFound)
	}
}

func TestMalformedLineIsParseError(t *testing.T) {
	up := newUpstream(t, &[]capturedRequest{})
	defer up.Close()
	script := []string{`{not json`}
	resps, _, _ := runScript(t, up.URL, script)
	if len(resps) != 1 {
		t.Fatalf("expected 1 response, got %d", len(resps))
	}
	if resps[0].Error == nil || resps[0].Error.Code != codeParseError {
		t.Errorf("expected parse error -32700, got %+v", resps[0].Error)
	}
}

func TestLogAgentRunBuildsDiffSummary(t *testing.T) {
	var captured []capturedRequest
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		captured = append(captured, capturedRequest{
			method: r.Method, path: r.URL.Path, auth: r.Header.Get("Authorization"), body: string(b),
		})
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"run1"}`))
	}))
	defer up.Close()

	script := []string{
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"log_agent_run","arguments":{"goal":"fix bug","agentName":"claude","additions":10,"deletions":2,"changedFiles":3,"costUsd":0.5,"testsPassed":true}}}`,
	}
	resps, _, _ := runScript(t, up.URL, script)
	res := mustToolResult(t, resps[0])
	if res.IsError {
		t.Fatalf("log_agent_run errored: %q", res.Content[0].Text)
	}
	if len(captured) != 1 {
		t.Fatalf("expected 1 upstream call, got %d", len(captured))
	}
	req := captured[0]
	if req.method != http.MethodPost || req.path != "/api/agent-runs" {
		t.Errorf("upstream = %s %s", req.method, req.path)
	}
	var body map[string]any
	if err := json.Unmarshal([]byte(req.body), &body); err != nil {
		t.Fatalf("body not JSON: %v", err)
	}
	if body["goal"] != "fix bug" {
		t.Errorf("goal = %v", body["goal"])
	}
	ds, ok := body["diffSummary"].(map[string]any)
	if !ok {
		t.Fatalf("diffSummary not nested object: %v", body["diffSummary"])
	}
	if ds["additions"].(float64) != 10 || ds["changedFiles"].(float64) != 3 {
		t.Errorf("diffSummary fields wrong: %v", ds)
	}
}

func TestUpdateIssueStateBody(t *testing.T) {
	var captured []capturedRequest
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		captured = append(captured, capturedRequest{
			method: r.Method, path: r.URL.Path, body: string(b),
		})
		_, _ = w.Write([]byte(`{"id":"i1","state":"done"}`))
	}))
	defer up.Close()

	script := []string{
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"update_issue_state","arguments":{"id":"i1","state":"done"}}}`,
	}
	resps, _, _ := runScript(t, up.URL, script)
	if mustToolResult(t, resps[0]).IsError {
		t.Fatalf("update_issue_state errored")
	}
	req := captured[0]
	if req.method != http.MethodPatch || req.path != "/api/issues/i1" {
		t.Errorf("upstream = %s %s", req.method, req.path)
	}
	var body map[string]any
	_ = json.Unmarshal([]byte(req.body), &body)
	if body["state"] != "done" {
		t.Errorf("PATCH body state = %v, want done", body["state"])
	}
}

func TestNotificationProducesNoOutput(t *testing.T) {
	up := newUpstream(t, &[]capturedRequest{})
	defer up.Close()
	script := []string{
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
	}
	resps, raw, _ := runScript(t, up.URL, script)
	if len(resps) != 0 {
		t.Errorf("notification produced %d responses, want 0", len(resps))
	}
	if len(bytes.TrimSpace(raw)) != 0 {
		t.Errorf("notification wrote to stdout: %q", raw)
	}
}

// ── helpers ──

func mustResult(t *testing.T, r rpcResponse, into any) {
	t.Helper()
	if r.Error != nil {
		t.Fatalf("unexpected JSON-RPC error: %+v", r.Error)
	}
	b, err := json.Marshal(r.Result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if err := json.Unmarshal(b, into); err != nil {
		t.Fatalf("decode result into %T: %v", into, err)
	}
}

func mustToolResult(t *testing.T, r rpcResponse) callToolResult {
	t.Helper()
	var res callToolResult
	mustResult(t, r, &res)
	if len(res.Content) == 0 {
		t.Fatalf("tool result has no content: %+v", r)
	}
	if res.Content[0].Type != "text" {
		t.Fatalf("tool content type = %q, want text", res.Content[0].Type)
	}
	return res
}
