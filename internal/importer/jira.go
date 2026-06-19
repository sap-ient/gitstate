// Package importer brings existing issues/projects from external trackers
// (Jira, Linear) into gitstate so teams can migrate.
//
// Credentials are passed per-request only: they are never persisted to the
// database and never written to logs. The HTTP clients here are constructed
// from net/http + encoding/json (stdlib only).
package importer

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// pageCap bounds how many pages any import will fetch, so a misconfigured JQL
// or a huge backlog can never run unbounded.
const (
	jiraPageSize = 100
	jiraMaxPages = 50 // 50 * 100 = up to 5000 issues per import
)

// JiraCredentials is the per-request connection info for a Jira Cloud site.
// None of these fields are stored or logged.
type JiraCredentials struct {
	BaseURL  string `json:"baseUrl"`  // e.g. https://acme.atlassian.net
	Email    string `json:"email"`    // Atlassian account email
	APIToken string `json:"apiToken"` // Atlassian API token
	JQL      string `json:"jql"`      // optional filter; defaults to "order by created"
}

// NormalizedIssue is the provider-agnostic shape the import flow upserts.
// Both Jira and Linear map their issues into this struct.
type NormalizedIssue struct {
	ExternalID  string   // stable provider key/id used for idempotency
	Title       string   // issue summary / title
	Body        string   // description (best-effort plain text)
	State       string   // gitstate state: open | in_progress | done | closed
	Labels      []string // labels (+ issue type as a label where sensible)
	ProjectKey  string   // provider project key/id → groups into a gitstate project
	ProjectName string   // human-readable project name
}

// ImportData is the full result of a fetch: the issues plus the distinct
// projects they belong to (so the import flow can create projects first).
type ImportData struct {
	Issues   []NormalizedIssue
	Projects []ProjectRef
	// Truncated is true when the provider had more pages than pageCap allowed.
	Truncated bool
}

// ProjectRef is a distinct project discovered during a fetch.
type ProjectRef struct {
	Key  string
	Name string
}

// JiraClient is a thin REST v3 client. It holds only the per-request creds.
type JiraClient struct {
	baseURL string
	authHdr string
	http    *http.Client
}

// NewJiraClient validates the credentials shape and returns a client.
// The base URL is trimmed of a trailing slash so path joins are predictable.
func NewJiraClient(creds JiraCredentials) (*JiraClient, error) {
	base := strings.TrimRight(strings.TrimSpace(creds.BaseURL), "/")
	if base == "" {
		return nil, &Error{Code: http.StatusBadRequest, Msg: "jira: baseUrl is required"}
	}
	if !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		return nil, &Error{Code: http.StatusBadRequest, Msg: "jira: baseUrl must start with http(s)://"}
	}
	if strings.TrimSpace(creds.Email) == "" || strings.TrimSpace(creds.APIToken) == "" {
		return nil, &Error{Code: http.StatusBadRequest, Msg: "jira: email and apiToken are required"}
	}

	// Jira Cloud uses Basic auth: email:apiToken (base64).
	raw := creds.Email + ":" + creds.APIToken
	authHdr := "Basic " + base64.StdEncoding.EncodeToString([]byte(raw))

	return &JiraClient{
		baseURL: base,
		authHdr: authHdr,
		http:    &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// ── Jira REST response shapes (only the fields we use) ─────────────────────────

type jiraSearchResponse struct {
	StartAt    int         `json:"startAt"`
	MaxResults int         `json:"maxResults"`
	Total      int         `json:"total"`
	Issues     []jiraIssue `json:"issues"`
}

type jiraIssue struct {
	Key    string         `json:"key"`
	Fields jiraIssueField `json:"fields"`
}

type jiraIssueField struct {
	Summary     string          `json:"summary"`
	Description json.RawMessage `json:"description"` // ADF object or null
	Labels      []string        `json:"labels"`
	Status      *jiraStatus     `json:"status"`
	IssueType   *jiraNamed      `json:"issuetype"`
	Project     *jiraProject    `json:"project"`
}

type jiraStatus struct {
	Name           string           `json:"name"`
	StatusCategory *jiraStatusCateg `json:"statusCategory"`
}

type jiraStatusCateg struct {
	Key  string `json:"key"`  // "new" | "indeterminate" | "done"
	Name string `json:"name"` // "To Do" | "In Progress" | "Done"
}

type jiraNamed struct {
	Name string `json:"name"`
}

type jiraProject struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

// ── Fetch ──────────────────────────────────────────────────────────────────────

// Fetch retrieves issues matching the (optional) JQL, paginating up to the cap,
// and normalizes them. When limit > 0 it stops after collecting that many
// issues (used by preview to fetch only a small sample).
func (c *JiraClient) Fetch(ctx context.Context, jql string, limit int) (*ImportData, error) {
	if strings.TrimSpace(jql) == "" {
		jql = "order by created DESC"
	}

	out := &ImportData{}
	projects := map[string]ProjectRef{}
	startAt := 0

	for page := 0; page < jiraMaxPages; page++ {
		pageSize := jiraPageSize
		if limit > 0 && limit-len(out.Issues) < pageSize {
			pageSize = limit - len(out.Issues)
		}
		if pageSize <= 0 {
			break
		}

		resp, err := c.search(ctx, jql, startAt, pageSize)
		if err != nil {
			return nil, err
		}

		for _, ji := range resp.Issues {
			ni := normalizeJiraIssue(ji)
			out.Issues = append(out.Issues, ni)
			if ni.ProjectKey != "" {
				projects[ni.ProjectKey] = ProjectRef{Key: ni.ProjectKey, Name: ni.ProjectName}
			}
		}

		startAt = resp.StartAt + len(resp.Issues)
		if len(resp.Issues) == 0 || startAt >= resp.Total {
			break
		}
		if limit > 0 && len(out.Issues) >= limit {
			break
		}
		if page == jiraMaxPages-1 && startAt < resp.Total {
			out.Truncated = true
		}
	}

	for _, p := range projects {
		out.Projects = append(out.Projects, p)
	}
	return out, nil
}

// Count returns the total number of issues matching the JQL without fetching
// them all (Jira returns `total` on a maxResults=0 search).
func (c *JiraClient) Count(ctx context.Context, jql string) (int, error) {
	if strings.TrimSpace(jql) == "" {
		jql = "order by created DESC"
	}
	resp, err := c.search(ctx, jql, 0, 0)
	if err != nil {
		return 0, err
	}
	return resp.Total, nil
}

func (c *JiraClient) search(ctx context.Context, jql string, startAt, maxResults int) (*jiraSearchResponse, error) {
	u := c.baseURL + "/rest/api/3/search"
	q := url.Values{}
	q.Set("jql", jql)
	q.Set("startAt", fmt.Sprintf("%d", startAt))
	q.Set("maxResults", fmt.Sprintf("%d", maxResults))
	q.Set("fields", "summary,description,labels,status,issuetype,project")
	fullURL := u + "?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fullURL, nil)
	if err != nil {
		return nil, &Error{Code: http.StatusInternalServerError, Msg: "jira: build request"}
	}
	req.Header.Set("Authorization", c.authHdr)
	req.Header.Set("Accept", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return nil, &Error{Code: http.StatusBadGateway, Msg: "jira: network error reaching site"}
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(res.Body, 8<<20))

	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, &Error{Code: http.StatusUnauthorized, Msg: "jira: authentication failed — check email + API token"}
	}
	if res.StatusCode == http.StatusBadRequest {
		return nil, &Error{Code: http.StatusBadRequest, Msg: "jira: bad request — check your JQL"}
	}
	if res.StatusCode >= 300 {
		return nil, &Error{Code: http.StatusBadGateway, Msg: fmt.Sprintf("jira: site returned HTTP %d", res.StatusCode)}
	}

	var sr jiraSearchResponse
	if err := json.Unmarshal(body, &sr); err != nil {
		return nil, &Error{Code: http.StatusBadGateway, Msg: "jira: could not parse site response"}
	}
	return &sr, nil
}

// ── Mapping ────────────────────────────────────────────────────────────────────

func normalizeJiraIssue(ji jiraIssue) NormalizedIssue {
	ni := NormalizedIssue{
		ExternalID: ji.Key,
		Title:      ji.Fields.Summary,
		Body:       adfToText(ji.Fields.Description),
		State:      mapJiraStatus(ji.Fields.Status),
		Labels:     append([]string{}, ji.Fields.Labels...),
	}
	if ji.Fields.Project != nil {
		ni.ProjectKey = ji.Fields.Project.Key
		ni.ProjectName = ji.Fields.Project.Name
	}
	// Fold the issue type into labels where it carries signal (bug/story/etc.).
	if ji.Fields.IssueType != nil && ji.Fields.IssueType.Name != "" {
		t := strings.ToLower(ji.Fields.IssueType.Name)
		if t != "task" { // "task" is noise; everything else is useful texture
			ni.Labels = append(ni.Labels, t)
		}
	}
	if ni.Title == "" {
		ni.Title = ji.Key
	}
	return ni
}

// mapJiraStatus maps Jira's status category → gitstate state.
//
//	new           (To Do)        → open
//	indeterminate (In Progress)  → in_progress
//	done          (Done)         → done
//
// We additionally detect cancelled-style status names → closed.
func mapJiraStatus(s *jiraStatus) string {
	if s == nil {
		return "open"
	}
	name := strings.ToLower(s.Name)
	if strings.Contains(name, "cancel") || strings.Contains(name, "won't") || strings.Contains(name, "wont") {
		return "closed"
	}
	if s.StatusCategory != nil {
		switch s.StatusCategory.Key {
		case "new":
			return "open"
		case "indeterminate":
			return "in_progress"
		case "done":
			return "done"
		}
	}
	return "open"
}

// adfToText flattens Atlassian Document Format (ADF) into a best-effort plain
// string by recursively concatenating any "text" leaves. Jira v3 returns
// description as an ADF object (or null); a plain string is also tolerated.
func adfToText(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}
	// Tolerate a plain JSON string.
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var node adfNode
	if err := json.Unmarshal(raw, &node); err != nil {
		return ""
	}
	var b strings.Builder
	walkADF(&node, &b)
	return strings.TrimSpace(b.String())
}

type adfNode struct {
	Type    string    `json:"type"`
	Text    string    `json:"text"`
	Content []adfNode `json:"content"`
}

func walkADF(n *adfNode, b *strings.Builder) {
	if n.Text != "" {
		b.WriteString(n.Text)
	}
	if n.Type == "paragraph" || n.Type == "heading" {
		b.WriteString("\n")
	}
	for i := range n.Content {
		walkADF(&n.Content[i], b)
	}
}
