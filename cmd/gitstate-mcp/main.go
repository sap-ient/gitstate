// Command gitstate-mcp is a Model Context Protocol (MCP) server that exposes
// gitstate to any MCP-capable agent host (Claude Code, Cursor, …). It is a thin
// MCP↔HTTP bridge: every tool call proxies to gitstate's existing HTTP API using
// a gitstate API token. It holds no database logic.
//
// Transport is stdio with newline-delimited JSON-RPC 2.0 (one JSON object per
// line). stdout carries protocol ONLY; all diagnostics go to stderr. The token
// is never written to either stream.
//
// Configuration (environment):
//
//	GITSTATE_TOKEN   a gsk_… API token (required). Its scopes gate which tools work.
//	GITSTATE_URL     gitstate base URL (default http://localhost:8080).
package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
)

const defaultURL = "http://localhost:8080"

func main() {
	// All diagnostics go to stderr; stdout is reserved for protocol frames.
	logger := log.New(os.Stderr, "gitstate-mcp ", log.LstdFlags)

	token := os.Getenv("GITSTATE_TOKEN")
	if token == "" {
		logger.Fatal("GITSTATE_TOKEN is required (a gsk_… gitstate API token)")
	}
	baseURL := os.Getenv("GITSTATE_URL")
	if baseURL == "" {
		baseURL = defaultURL
	}
	logger.Printf("starting; upstream=%s (token redacted)", baseURL)

	srv := &server{
		client: newClient(baseURL, token),
		tools:  buildTools(),
		logger: logger,
	}
	if err := srv.serve(os.Stdin, os.Stdout); err != nil {
		logger.Fatalf("serve: %v", err)
	}
}

// server holds the bridge state: the HTTP client, the tool registry indexed for
// dispatch, and a stderr logger.
type server struct {
	client *client
	tools  []tool
	byName map[string]tool
	logger *log.Logger
}

// serve runs the read/dispatch loop over the stdio transport until EOF.
// It reads newline-delimited JSON-RPC messages from in and writes responses to
// out, one JSON object per line. Notifications receive no response.
func (s *server) serve(in io.Reader, out io.Writer) error {
	if s.byName == nil {
		s.byName = make(map[string]tool, len(s.tools))
		for _, t := range s.tools {
			s.byName[t.name] = t
		}
	}

	scanner := bufio.NewScanner(in)
	// Allow large messages (context bundles can be sizeable).
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	writer := bufio.NewWriter(out)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		resp := s.handleLine(line)
		if resp != nil {
			if err := s.writeResponse(writer, resp); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("read stdin: %w", err)
	}
	return nil
}

// writeResponse encodes resp as a single JSON line and flushes it.
func (s *server) writeResponse(w *bufio.Writer, resp *rpcResponse) error {
	b, err := json.Marshal(resp)
	if err != nil {
		// Last-resort internal error; should never happen for our own types.
		s.logger.Printf("marshal response: %v", err)
		b, _ = json.Marshal(newError(resp.ID, codeInternalError, "failed to encode response"))
	}
	if _, err := w.Write(b); err != nil {
		return fmt.Errorf("write response: %w", err)
	}
	if err := w.WriteByte('\n'); err != nil {
		return fmt.Errorf("write newline: %w", err)
	}
	return w.Flush()
}

// handleLine parses and dispatches one JSON-RPC line. It returns the response to
// emit, or nil when the message is a notification (no response is sent).
func (s *server) handleLine(line []byte) *rpcResponse {
	var req rpcRequest
	if err := json.Unmarshal(line, &req); err != nil {
		s.logger.Printf("parse error: %v", err)
		return newError(nil, codeParseError, "parse error: invalid JSON")
	}
	if req.JSONRPC != "2.0" || req.Method == "" {
		// A notification with a bad envelope still gets no reply.
		if req.isNotification() {
			return nil
		}
		return newError(req.ID, codeInvalidRequest, "invalid request: expected jsonrpc 2.0 with a method")
	}

	// Notifications (no id) are processed but never answered.
	if req.isNotification() {
		s.handleNotification(req)
		return nil
	}

	switch req.Method {
	case "initialize":
		return newResult(req.ID, s.handleInitialize())
	case "tools/list":
		return newResult(req.ID, s.handleListTools())
	case "tools/call":
		return s.handleCallTool(req)
	case "ping":
		// MCP keepalive: respond with an empty result object.
		return newResult(req.ID, map[string]any{})
	default:
		s.logger.Printf("unknown method: %s", req.Method)
		return newError(req.ID, codeMethodNotFound, "method not found: "+req.Method)
	}
}

// handleNotification processes a notification. The only one we care about is
// notifications/initialized; everything else is logged and ignored.
func (s *server) handleNotification(req rpcRequest) {
	s.logger.Printf("notification: %s", req.Method)
}

func (s *server) handleInitialize() initializeResult {
	return initializeResult{
		ProtocolVersion: mcpProtocolVersion,
		Capabilities:    map[string]any{"tools": map[string]any{}},
		ServerInfo:      serverInfo{Name: serverName, Version: serverVersion},
	}
}

func (s *server) handleListTools() listToolsResult {
	out := make([]toolSchema, 0, len(s.tools))
	for _, t := range s.tools {
		out = append(out, toolSchema{
			Name:        t.name,
			Description: t.description,
			InputSchema: t.inputSchema,
		})
	}
	return listToolsResult{Tools: out}
}

// handleCallTool dispatches a tools/call. Tool-level failures (bad args, HTTP
// errors) are returned in-band as a result with isError:true — NOT as JSON-RPC
// errors. Only a malformed params envelope or an unknown tool that can't be
// expressed in-band is a protocol concern, and even those are surfaced in-band
// per the MCP convention so the host can show them to the model.
func (s *server) handleCallTool(req rpcRequest) *rpcResponse {
	var params callToolParams
	if err := json.Unmarshal(req.Params, &params); err != nil {
		return newResult(req.ID, textResult("invalid tools/call params: "+err.Error(), true))
	}

	t, ok := s.byName[params.Name]
	if !ok {
		return newResult(req.ID, textResult("unknown tool: "+params.Name, true))
	}

	// Arguments may be absent; treat as empty object.
	args := map[string]any{}
	if len(params.Arguments) > 0 && string(params.Arguments) != "null" {
		if err := json.Unmarshal(params.Arguments, &args); err != nil {
			return newResult(req.ID, textResult("invalid arguments for "+params.Name+": "+err.Error(), true))
		}
	}

	body, err := t.handler(s.client, args)
	if err != nil {
		s.logger.Printf("tool %s failed: %v", params.Name, err)
		return newResult(req.ID, textResult(err.Error(), true))
	}

	text := string(body)
	if text == "" {
		text = "{}"
	}
	return newResult(req.ID, textResult(text, false))
}
