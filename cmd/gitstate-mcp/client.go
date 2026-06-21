package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// client is a thin gitstate HTTP API client used by the MCP bridge.
//
// It carries the resolved base URL and a gsk_… API token and performs
// authenticated requests, returning the raw response body. Every tool handler
// proxies through here; the bridge itself holds no DB logic. The token is sent
// as a Bearer credential on every request and is NEVER logged or echoed.
type client struct {
	baseURL string
	token   string
	http    *http.Client
}

// newClient builds a client from a base URL and token. Trailing slashes on the
// base URL are trimmed so path joins are predictable.
func newClient(baseURL, token string) *client {
	return &client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// apiError carries a non-2xx HTTP status together with the server's response
// body, which for gitstate is a JSON object like {"error":"..."}. Tool handlers
// surface this as an in-band MCP tool error (isError:true), not a JSON-RPC error.
type apiError struct {
	status int
	path   string
	body   string
}

func (e *apiError) Error() string {
	body := strings.TrimSpace(e.body)
	if body == "" {
		return fmt.Sprintf("gitstate %s returned HTTP %d", e.path, e.status)
	}
	return fmt.Sprintf("gitstate %s returned HTTP %d: %s", e.path, e.status, body)
}

// get performs an authenticated GET against path (which must begin with "/" and
// may carry a query string) and returns the raw 2xx response body.
func (c *client) get(path string) ([]byte, error) {
	return c.do(http.MethodGet, path, nil)
}

// post performs an authenticated POST with a JSON-encoded body.
func (c *client) post(path string, payload any) ([]byte, error) {
	return c.do(http.MethodPost, path, payload)
}

// patch performs an authenticated PATCH with a JSON-encoded body.
func (c *client) patch(path string, payload any) ([]byte, error) {
	return c.do(http.MethodPatch, path, payload)
}

// do performs an authenticated request to path with an optional JSON payload and
// returns the raw response body for any 2xx status. Non-2xx responses are
// surfaced as *apiError carrying the server body verbatim. Transport failures
// are returned as plain errors.
func (c *client) do(method, path string, payload any) ([]byte, error) {
	u, err := c.resolve(path)
	if err != nil {
		return nil, err
	}

	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("encode request body: %w", err)
		}
		body = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, u, body)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request to %s failed: %w", path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response from %s: %w", path, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &apiError{status: resp.StatusCode, path: path, body: string(respBody)}
	}
	return respBody, nil
}

// resolve joins the base URL with an API path. The path is expected to start
// with "/"; an already-encoded query string is preserved.
func (c *client) resolve(path string) (string, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	full := c.baseURL + path
	if _, err := url.Parse(full); err != nil {
		return "", fmt.Errorf("invalid URL %q: %w", full, err)
	}
	return full, nil
}
