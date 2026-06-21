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

// client is a thin gitstate API HTTP client.
//
// It carries the resolved base URL and API token and exposes a single do()
// method that performs an authenticated request and returns the raw response
// body. Callers decode JSON themselves so that --json mode can stream the exact
// server payload without a re-encode round trip.
type client struct {
	baseURL string
	token   string
	http    *http.Client
}

// newClient builds a client from a (already resolved) base URL and token.
// baseURL trailing slashes are trimmed so path joins are predictable.
func newClient(baseURL, token string) *client {
	return &client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 30 * time.Second},
	}
}

// apiError carries a non-2xx HTTP status together with the server's response
// body, which for gitstate is a JSON object like {"error":"..."}.
type apiError struct {
	status int
	path   string
	body   string
}

func (e *apiError) Error() string {
	body := strings.TrimSpace(e.body)
	if body == "" {
		return fmt.Sprintf("%s: HTTP %d", e.path, e.status)
	}
	return fmt.Sprintf("%s: HTTP %d: %s", e.path, e.status, body)
}

// do performs an authenticated request to path (which must begin with "/")
// and returns the raw response body for any 2xx status. Non-2xx responses are
// surfaced as *apiError carrying the server's body so the caller can print the
// gitstate error message verbatim. Transport failures are returned as-is.
func (c *client) do(method, path string) ([]byte, error) {
	u, err := c.resolve(path)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest(method, u, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request to %s failed: %w", u, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response from %s: %w", u, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &apiError{status: resp.StatusCode, path: path, body: string(body)}
	}
	return body, nil
}

// doJSON performs an authenticated request to path with a JSON-encoded body
// (payload is marshalled and sent with Content-Type: application/json) and
// returns the raw response body for any 2xx status. It mirrors do() for non-2xx
// handling: the server's error body is surfaced via *apiError. payload may be nil
// for bodyless methods.
func (c *client) doJSON(method, path string, payload any) ([]byte, error) {
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
		return nil, fmt.Errorf("request to %s failed: %w", u, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response from %s: %w", u, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, &apiError{status: resp.StatusCode, path: path, body: string(respBody)}
	}
	return respBody, nil
}

// resolve joins the client base URL with an API path (and optional query). The
// path is expected to start with "/"; query strings already encoded onto it are
// preserved.
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
