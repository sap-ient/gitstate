package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

// tool is one MCP tool: its advertised schema plus a handler that maps the
// decoded arguments onto a gitstate HTTP call. The handler returns the raw
// upstream body on success, or an error (transport or *apiError) that the
// dispatcher converts into an in-band tool error (isError:true).
type tool struct {
	name        string
	description string
	// inputSchema is the JSON-Schema object advertised in tools/list. It always
	// has type:"object" with properties and an optional required list.
	inputSchema map[string]any
	handler     func(c *client, args map[string]any) ([]byte, error)
}

// schema builds a JSON-Schema object for inputSchema.
func schema(props map[string]any, required ...string) map[string]any {
	s := map[string]any{
		"type":       "object",
		"properties": props,
	}
	if required == nil {
		required = []string{}
	}
	s["required"] = required
	return s
}

func strProp(desc string) map[string]any {
	return map[string]any{"type": "string", "description": desc}
}
func intProp(desc string) map[string]any {
	return map[string]any{"type": "integer", "description": desc}
}
func numProp(desc string) map[string]any {
	return map[string]any{"type": "number", "description": desc}
}
func boolProp(desc string) map[string]any {
	return map[string]any{"type": "boolean", "description": desc}
}

func enumStrProp(desc string, values ...string) map[string]any {
	p := strProp(desc)
	p["enum"] = values
	return p
}

// buildTools returns the ordered tool registry. Order is preserved in
// tools/list so a host renders them predictably.
func buildTools() []tool {
	return []tool{
		{
			name: "search_issues",
			description: "Full-text search across gitstate issues, pull requests, and commits. " +
				"Returns matching records as JSON. Use this to find work items by keyword before " +
				"starting a task. Requires a read-scoped token.",
			inputSchema: schema(map[string]any{
				"query": strProp("Search query string (keywords)."),
				"type":  enumStrProp("Restrict results to one record kind.", "issues", "prs", "commits"),
				"limit": intProp("Max results to return (server-capped)."),
			}, "query"),
			handler: func(c *client, args map[string]any) ([]byte, error) {
				q, err := requireString(args, "query")
				if err != nil {
					return nil, err
				}
				v := url.Values{}
				v.Set("q", q)
				if t, ok := optString(args, "type"); ok {
					v.Set("type", t)
				}
				if n, ok, err := optInt(args, "limit"); err != nil {
					return nil, err
				} else if ok {
					v.Set("limit", strconv.Itoa(n))
				}
				return c.get("/api/search?" + v.Encode())
			},
		},
		{
			name: "get_issue",
			description: "Fetch the agent start-work context bundle for an issue by id: the " +
				"issue header, related code/PRs, and a token-efficient summary an agent can begin " +
				"from. Requires a read-scoped token.",
			inputSchema: schema(map[string]any{
				"id": strProp("The gitstate issue id."),
			}, "id"),
			handler: func(c *client, args map[string]any) ([]byte, error) {
				id, err := requireString(args, "id")
				if err != nil {
					return nil, err
				}
				return c.get("/api/context/issue/" + url.PathEscape(id))
			},
		},
		{
			name: "get_pr_context",
			description: "Fetch the context bundle for a pull request by id: header, diff summary, " +
				"cycle time, and a calibrated estimate. Requires a read-scoped token.",
			inputSchema: schema(map[string]any{
				"id": strProp("The gitstate pull-request id."),
			}, "id"),
			handler: func(c *client, args map[string]any) ([]byte, error) {
				id, err := requireString(args, "id")
				if err != nil {
					return nil, err
				}
				return c.get("/api/context/pr/" + url.PathEscape(id))
			},
		},
		{
			name: "list_issues",
			description: "List issues for the token's org, optionally filtered by state. Returns a " +
				"JSON array of issues. Requires a read-scoped token.",
			inputSchema: schema(map[string]any{
				"state": strProp("Filter by issue state (e.g. open, in_progress, done)."),
				"limit": intProp("Max issues to return (client-side cap applied to the result)."),
			}),
			handler: func(c *client, args map[string]any) ([]byte, error) {
				v := url.Values{}
				if s, ok := optString(args, "state"); ok {
					v.Set("state", s)
				}
				path := "/api/issues"
				if enc := v.Encode(); enc != "" {
					path += "?" + enc
				}
				body, err := c.get(path)
				if err != nil {
					return nil, err
				}
				// list_issues has no server-side limit param; honour a requested
				// limit client-side so the agent gets a bounded slice.
				if n, ok, err := optInt(args, "limit"); err != nil {
					return nil, err
				} else if ok && n >= 0 {
					body = truncateJSONArray(body, n)
				}
				return body, nil
			},
		},
		{
			name: "log_agent_run",
			description: "Record an agent run in gitstate: what the agent attempted and the outcome. " +
				"Feeds the agent-effectiveness flywheel. Requires a token with the write:agent_runs scope.",
			inputSchema: schema(map[string]any{
				"goal":         strProp("What the agent was asked to do (required)."),
				"repoId":       strProp("Associated repo id."),
				"prId":         strProp("Associated pull-request id."),
				"issueId":      strProp("Associated issue id."),
				"agentName":    strProp("Name/model of the agent (e.g. claude-opus)."),
				"branch":       strProp("Branch the agent worked on."),
				"testsPassed":  boolProp("Whether the agent's tests passed."),
				"humanAction":  enumStrProp("What the human did with the result.", "accepted", "edited", "reverted"),
				"iterations":   intProp("Number of iterations/turns the agent took."),
				"costUsd":      numProp("Total cost of the run in USD."),
				"additions":    intProp("Lines added in the run's diff."),
				"deletions":    intProp("Lines deleted in the run's diff."),
				"changedFiles": intProp("Number of files changed in the run's diff."),
			}, "goal"),
			handler: func(c *client, args map[string]any) ([]byte, error) {
				goal, err := requireString(args, "goal")
				if err != nil {
					return nil, err
				}
				body := map[string]any{"goal": goal}
				for _, k := range []string{"repoId", "prId", "issueId", "agentName", "branch", "humanAction"} {
					if s, ok := optString(args, k); ok {
						body[k] = s
					}
				}
				if b, ok, err := optBool(args, "testsPassed"); err != nil {
					return nil, err
				} else if ok {
					body["testsPassed"] = b
				}
				if n, ok, err := optInt(args, "iterations"); err != nil {
					return nil, err
				} else if ok {
					body["iterations"] = n
				}
				if f, ok, err := optNumber(args, "costUsd"); err != nil {
					return nil, err
				} else if ok {
					body["costUsd"] = f
				}
				// Fold the diff fields into the nested diffSummary the API expects.
				diff := map[string]any{}
				for _, k := range []string{"additions", "deletions", "changedFiles"} {
					if n, ok, err := optInt(args, k); err != nil {
						return nil, err
					} else if ok {
						diff[k] = n
					}
				}
				if len(diff) > 0 {
					body["diffSummary"] = diff
				}
				return c.post("/api/agent-runs", body)
			},
		},
		{
			name: "update_issue_state",
			description: "Update an issue's state in gitstate (e.g. mark it in_progress or done). " +
				"For git-sourced issues this also writes back to the platform. Requires a token with " +
				"the write:issues scope.",
			inputSchema: schema(map[string]any{
				"id":    strProp("The gitstate issue id."),
				"state": strProp("The new state (e.g. open, in_progress, done, closed)."),
			}, "id", "state"),
			handler: func(c *client, args map[string]any) ([]byte, error) {
				id, err := requireString(args, "id")
				if err != nil {
					return nil, err
				}
				state, err := requireString(args, "state")
				if err != nil {
					return nil, err
				}
				return c.patch("/api/issues/"+url.PathEscape(id), map[string]any{"state": state})
			},
		},
	}
}

// ── argument helpers ──────────────────────────────────────────────────────────

// requireString returns a non-empty string argument or an error suitable for an
// in-band tool error.
func requireString(args map[string]any, key string) (string, error) {
	s, ok := optString(args, key)
	if !ok || strings.TrimSpace(s) == "" {
		return "", fmt.Errorf("missing required argument %q", key)
	}
	return s, nil
}

// optString returns (value, true) only when the key holds a JSON string.
func optString(args map[string]any, key string) (string, bool) {
	v, ok := args[key]
	if !ok || v == nil {
		return "", false
	}
	s, ok := v.(string)
	if !ok {
		return "", false
	}
	return s, true
}

// optInt returns (value, present, error). JSON numbers decode as float64; a
// non-integral value is an error so the agent gets a clear message.
func optInt(args map[string]any, key string) (int, bool, error) {
	v, ok := args[key]
	if !ok || v == nil {
		return 0, false, nil
	}
	switch n := v.(type) {
	case float64:
		if n != float64(int(n)) {
			return 0, false, fmt.Errorf("argument %q must be an integer", key)
		}
		return int(n), true, nil
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0, false, fmt.Errorf("argument %q must be an integer", key)
		}
		return int(i), true, nil
	default:
		return 0, false, fmt.Errorf("argument %q must be a number", key)
	}
}

// optNumber returns (value, present, error) for a float argument.
func optNumber(args map[string]any, key string) (float64, bool, error) {
	v, ok := args[key]
	if !ok || v == nil {
		return 0, false, nil
	}
	switch n := v.(type) {
	case float64:
		return n, true, nil
	case json.Number:
		f, err := n.Float64()
		if err != nil {
			return 0, false, fmt.Errorf("argument %q must be a number", key)
		}
		return f, true, nil
	default:
		return 0, false, fmt.Errorf("argument %q must be a number", key)
	}
}

// optBool returns (value, present, error) for a boolean argument.
func optBool(args map[string]any, key string) (bool, bool, error) {
	v, ok := args[key]
	if !ok || v == nil {
		return false, false, nil
	}
	b, ok := v.(bool)
	if !ok {
		return false, false, fmt.Errorf("argument %q must be a boolean", key)
	}
	return b, true, nil
}

// truncateJSONArray decodes body as a JSON array and re-encodes at most n
// elements. If body is not a JSON array it is returned unchanged.
func truncateJSONArray(body []byte, n int) []byte {
	var arr []json.RawMessage
	if err := json.Unmarshal(body, &arr); err != nil {
		return body
	}
	if len(arr) > n {
		arr = arr[:n]
	}
	out, err := json.Marshal(arr)
	if err != nil {
		return body
	}
	return out
}
