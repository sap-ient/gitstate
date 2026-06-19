package importer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	linearPageSize = 100
	linearMaxPages = 50 // up to 5000 issues per import
	linearAPIURL   = "https://api.linear.app/graphql"
)

// LinearCredentials is the per-request connection info for a Linear workspace.
// Not stored, not logged.
type LinearCredentials struct {
	APIKey string `json:"apiKey"`           // personal API key
	TeamID string `json:"teamId,omitempty"` // optional team filter
}

// LinearClient is a thin GraphQL client holding only the per-request key.
type LinearClient struct {
	apiKey string
	teamID string
	http   *http.Client
}

// NewLinearClient validates the credentials and returns a client.
func NewLinearClient(creds LinearCredentials) (*LinearClient, error) {
	key := strings.TrimSpace(creds.APIKey)
	if key == "" {
		return nil, &Error{Code: http.StatusBadRequest, Msg: "linear: apiKey is required"}
	}
	return &LinearClient{
		apiKey: key,
		teamID: strings.TrimSpace(creds.TeamID),
		http:   &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// ── GraphQL request/response plumbing ──────────────────────────────────────────

type linearGQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables"`
}

type linearGQLResponse struct {
	Data   *linearData    `json:"data"`
	Errors []linearGQLErr `json:"errors"`
}

type linearGQLErr struct {
	Message string `json:"message"`
}

type linearData struct {
	Issues *linearIssueConn `json:"issues"`
}

type linearIssueConn struct {
	PageInfo struct {
		HasNextPage bool   `json:"hasNextPage"`
		EndCursor   string `json:"endCursor"`
	} `json:"pageInfo"`
	Nodes []linearIssue `json:"nodes"`
}

type linearIssue struct {
	ID          string `json:"id"`
	Identifier  string `json:"identifier"`
	Title       string `json:"title"`
	Description string `json:"description"`
	State       *struct {
		Name string `json:"name"`
		Type string `json:"type"` // backlog|unstarted|started|completed|canceled
	} `json:"state"`
	Project *struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"project"`
	Labels *struct {
		Nodes []struct {
			Name string `json:"name"`
		} `json:"nodes"`
	} `json:"labels"`
}

const linearIssuesQuery = `
query Issues($first: Int!, $after: String, $filter: IssueFilter) {
  issues(first: $first, after: $after, filter: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      identifier
      title
      description
      state { name type }
      project { id name }
      labels { nodes { name } }
    }
  }
}`

// ── Fetch ──────────────────────────────────────────────────────────────────────

// Fetch retrieves issues, paginating via GraphQL cursors up to the cap.
// When limit > 0 it stops after collecting that many issues (preview sample).
func (c *LinearClient) Fetch(ctx context.Context, limit int) (*ImportData, error) {
	out := &ImportData{}
	projects := map[string]ProjectRef{}
	var after string

	for page := 0; page < linearMaxPages; page++ {
		pageSize := linearPageSize
		if limit > 0 && limit-len(out.Issues) < pageSize {
			pageSize = limit - len(out.Issues)
		}
		if pageSize <= 0 {
			break
		}

		conn, err := c.query(ctx, pageSize, after)
		if err != nil {
			return nil, err
		}

		for _, li := range conn.Nodes {
			ni := normalizeLinearIssue(li)
			out.Issues = append(out.Issues, ni)
			if ni.ProjectKey != "" {
				projects[ni.ProjectKey] = ProjectRef{Key: ni.ProjectKey, Name: ni.ProjectName}
			}
		}

		if !conn.PageInfo.HasNextPage || conn.PageInfo.EndCursor == "" {
			break
		}
		after = conn.PageInfo.EndCursor
		if limit > 0 && len(out.Issues) >= limit {
			break
		}
		if page == linearMaxPages-1 && conn.PageInfo.HasNextPage {
			out.Truncated = true
		}
	}

	for _, p := range projects {
		out.Projects = append(out.Projects, p)
	}
	return out, nil
}

// query runs one page of the issues GraphQL query. Linear has no cheap
// total-count endpoint, so preview reports the count of a bounded fetch and
// flags truncation rather than issuing a separate count query.
func (c *LinearClient) query(ctx context.Context, first int, after string) (*linearIssueConn, error) {
	vars := map[string]any{"first": first}
	if after != "" {
		vars["after"] = after
	}
	if c.teamID != "" {
		vars["filter"] = map[string]any{
			"team": map[string]any{"id": map[string]any{"eq": c.teamID}},
		}
	}

	reqBody, _ := json.Marshal(linearGQLRequest{Query: linearIssuesQuery, Variables: vars})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, linearAPIURL, bytes.NewReader(reqBody))
	if err != nil {
		return nil, &Error{Code: http.StatusInternalServerError, Msg: "linear: build request"}
	}
	req.Header.Set("Authorization", c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, &Error{Code: http.StatusBadGateway, Msg: "linear: network error reaching API"}
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))

	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, &Error{Code: http.StatusUnauthorized, Msg: "linear: authentication failed — check your API key"}
	}
	if res.StatusCode >= 300 {
		return nil, &Error{Code: http.StatusBadGateway, Msg: fmt.Sprintf("linear: API returned HTTP %d", res.StatusCode)}
	}

	var gr linearGQLResponse
	if err := json.Unmarshal(body, &gr); err != nil {
		return nil, &Error{Code: http.StatusBadGateway, Msg: "linear: could not parse API response"}
	}
	if len(gr.Errors) > 0 {
		msg := gr.Errors[0].Message
		// A bad teamId or filter surfaces here as a 200 with errors.
		return nil, &Error{Code: http.StatusBadRequest, Msg: "linear: " + msg}
	}
	if gr.Data == nil || gr.Data.Issues == nil {
		return nil, &Error{Code: http.StatusBadGateway, Msg: "linear: empty API response"}
	}
	return gr.Data.Issues, nil
}

// ── Mapping ────────────────────────────────────────────────────────────────────

func normalizeLinearIssue(li linearIssue) NormalizedIssue {
	ni := NormalizedIssue{
		ExternalID: li.Identifier, // e.g. ENG-123 — stable, human-readable
		Title:      li.Title,
		Body:       li.Description,
		State:      mapLinearState(li.State),
	}
	if ni.ExternalID == "" {
		ni.ExternalID = li.ID
	}
	if ni.Title == "" {
		ni.Title = ni.ExternalID
	}
	if li.Project != nil {
		ni.ProjectKey = li.Project.ID
		ni.ProjectName = li.Project.Name
	}
	if li.Labels != nil {
		for _, l := range li.Labels.Nodes {
			if l.Name != "" {
				ni.Labels = append(ni.Labels, strings.ToLower(l.Name))
			}
		}
	}
	return ni
}

// mapLinearState maps Linear's state type → gitstate state.
//
//	backlog, unstarted → open
//	started            → in_progress
//	completed          → done
//	canceled           → closed
func mapLinearState(s *struct {
	Name string `json:"name"`
	Type string `json:"type"`
}) string {
	if s == nil {
		return "open"
	}
	switch s.Type {
	case "backlog", "unstarted":
		return "open"
	case "started":
		return "in_progress"
	case "completed":
		return "done"
	case "canceled", "cancelled":
		return "closed"
	}
	return "open"
}
