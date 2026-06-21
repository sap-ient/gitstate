package main

import "encoding/json"

// This file defines the minimal JSON-RPC 2.0 / MCP wire types used by the
// stdio transport. Framing is newline-delimited: exactly one JSON object per
// line on stdin and stdout. stdout carries protocol ONLY; all diagnostics go to
// stderr.

// JSON-RPC error codes used by the bridge.
const (
	codeParseError     = -32700 // malformed JSON
	codeInvalidRequest = -32600 // not a valid Request object
	codeMethodNotFound = -32601 // unknown method
	codeInternalError  = -32603 // internal error
)

// mcpProtocolVersion is the protocol revision this server speaks.
const mcpProtocolVersion = "2024-11-05"

const (
	serverName    = "gitstate-mcp"
	serverVersion = "0.1.0"
)

// rpcRequest is an incoming JSON-RPC request or notification. A request has an
// id; a notification omits it (RawID is nil) and receives no response.
type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

// isNotification reports whether the message is a notification (no id) and must
// therefore receive no response per JSON-RPC 2.0.
func (r *rpcRequest) isNotification() bool {
	return len(r.ID) == 0
}

// rpcResponse is an outgoing JSON-RPC response. Exactly one of Result/Error is
// set. ID echoes the request id (null for errors on unparseable input).
type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// rpcError is a JSON-RPC error object.
type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// newResult builds a success response for the given id.
func newResult(id json.RawMessage, result any) *rpcResponse {
	return &rpcResponse{JSONRPC: "2.0", ID: id, Result: result}
}

// newError builds an error response for the given id. A nil id is rendered as
// JSON null, which is correct for errors raised before an id could be read.
func newError(id json.RawMessage, code int, message string) *rpcResponse {
	if len(id) == 0 {
		id = json.RawMessage("null")
	}
	return &rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: message}}
}

// ── MCP payload types ─────────────────────────────────────────────────────────

// initializeResult is the response to the MCP "initialize" request.
type initializeResult struct {
	ProtocolVersion string         `json:"protocolVersion"`
	Capabilities    map[string]any `json:"capabilities"`
	ServerInfo      serverInfo     `json:"serverInfo"`
}

type serverInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

// toolSchema is one entry in tools/list.
type toolSchema struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

// listToolsResult is the response to "tools/list".
type listToolsResult struct {
	Tools []toolSchema `json:"tools"`
}

// callToolParams is the params of a "tools/call" request.
type callToolParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

// contentItem is one item of a tool result's content array. Only text content
// is produced by this bridge.
type contentItem struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// callToolResult is the response to "tools/call". Tool failures are reported
// in-band with IsError=true rather than as JSON-RPC errors.
type callToolResult struct {
	Content []contentItem `json:"content"`
	IsError bool          `json:"isError"`
}

// textResult builds a tool result carrying a single text block.
func textResult(text string, isErr bool) *callToolResult {
	return &callToolResult{
		Content: []contentItem{{Type: "text", Text: text}},
		IsError: isErr,
	}
}
