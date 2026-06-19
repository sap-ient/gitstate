package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/importer"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5"
)

// RegisterImportRoutes wires the Jira/Linear import endpoints onto mux.
// All routes require a valid JWT (RequireAuth) and an active org (OrgScope);
// writes run inside db.WithOrg so RLS is enforced.
//
// Credentials are accepted in the request body for the duration of the request
// ONLY — they are never persisted to the database and never written to logs.
//
// Routes:
//
//	POST /api/import/jira/preview     — fetch a sample + counts, no writes
//	POST /api/import/jira             — run the import (idempotent on external_id)
//	POST /api/import/linear/preview   — fetch a sample + counts, no writes
//	POST /api/import/linear           — run the import (idempotent on external_id)
//
// Called by the orchestrator from router.go — this package does NOT edit router.go.
func RegisterImportRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {
	h := &importHandlers{db: database, cfg: cfg}

	requireAuth := middleware.RequireAuth(cfg.Auth.JWTSigningKey)
	orgScope := middleware.OrgScope(database.Pool())
	auth := func(handler http.Handler) http.Handler {
		return requireAuth(orgScope(handler))
	}

	mux.Handle("POST /api/import/jira/preview", auth(http.HandlerFunc(h.jiraPreview)))
	mux.Handle("POST /api/import/jira", auth(http.HandlerFunc(h.jiraImport)))
	mux.Handle("POST /api/import/linear/preview", auth(http.HandlerFunc(h.linearPreview)))
	mux.Handle("POST /api/import/linear", auth(http.HandlerFunc(h.linearImport)))
}

type importHandlers struct {
	db  *db.DB
	cfg *config.Config
}

// ── Shared response shapes ─────────────────────────────────────────────────────

// importPreviewResponse is returned by both /preview endpoints (no writes performed).
type importPreviewResponse struct {
	Source       string                 `json:"source"`
	IssueCount   int                    `json:"issueCount"`   // total matched (or sample count when unknown)
	ProjectCount int                    `json:"projectCount"` // distinct projects in the sample
	Truncated    bool                   `json:"truncated"`    // provider had more than the import cap
	Projects     []importPreviewProject `json:"projects"`
	SampleIssues []importPreviewIssue   `json:"sampleIssues"`
}

type importPreviewProject struct {
	Key  string `json:"key"`
	Name string `json:"name"`
}

type importPreviewIssue struct {
	ExternalID string   `json:"externalId"`
	Title      string   `json:"title"`
	State      string   `json:"state"`
	Project    string   `json:"project"`
	Labels     []string `json:"labels"`
}

// importSummary is returned by both run endpoints.
type importSummary struct {
	Source          string `json:"source"`
	ProjectsCreated int    `json:"projectsCreated"`
	IssuesImported  int    `json:"issuesImported"`
	IssuesUpdated   int    `json:"issuesUpdated"`
	Skipped         int    `json:"skipped"`
	Truncated       bool   `json:"truncated"`
}

// ── Jira ───────────────────────────────────────────────────────────────────────

func (h *importHandlers) jiraPreview(w http.ResponseWriter, r *http.Request) {
	var creds importer.JiraCredentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	client, err := importer.NewJiraClient(creds)
	if err != nil {
		writeImportError(w, "jira", err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	data, err := client.Fetch(ctx, creds.JQL, importer.PreviewSample)
	if err != nil {
		writeImportError(w, "jira", err)
		return
	}
	total, err := client.Count(ctx, creds.JQL)
	if err != nil {
		// Count is best-effort; fall back to the sample size.
		total = len(data.Issues)
	}

	writeJSON(w, http.StatusOK, buildPreview("jira", data, total))
}

func (h *importHandlers) jiraImport(w http.ResponseWriter, r *http.Request) {
	var creds importer.JiraCredentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	client, err := importer.NewJiraClient(creds)
	if err != nil {
		writeImportError(w, "jira", err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()

	data, err := client.Fetch(ctx, creds.JQL, 0)
	if err != nil {
		writeImportError(w, "jira", err)
		return
	}

	h.runImport(w, r, "jira", data)
}

// ── Linear ─────────────────────────────────────────────────────────────────────

func (h *importHandlers) linearPreview(w http.ResponseWriter, r *http.Request) {
	var creds importer.LinearCredentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	client, err := importer.NewLinearClient(creds)
	if err != nil {
		writeImportError(w, "linear", err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	data, err := client.Fetch(ctx, importer.PreviewSample)
	if err != nil {
		writeImportError(w, "linear", err)
		return
	}

	// Linear has no cheap total-count query; report the sample size and flag
	// truncation when the workspace clearly has more than the sample.
	writeJSON(w, http.StatusOK, buildPreview("linear", data, len(data.Issues)))
}

func (h *importHandlers) linearImport(w http.ResponseWriter, r *http.Request) {
	var creds importer.LinearCredentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	client, err := importer.NewLinearClient(creds)
	if err != nil {
		writeImportError(w, "linear", err)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()

	data, err := client.Fetch(ctx, 0)
	if err != nil {
		writeImportError(w, "linear", err)
		return
	}

	h.runImport(w, r, "linear", data)
}

// ── Shared import runner ───────────────────────────────────────────────────────

// runImport upserts projects + issues idempotently inside a single org-scoped
// transaction and returns a summary. Partial provider failures already surfaced
// during Fetch; here a DB error rolls the whole import back.
func (h *importHandlers) runImport(w http.ResponseWriter, r *http.Request, source string, data *importer.ImportData) {
	orgID := middleware.OrgFromContext(r.Context())

	summary := importSummary{Source: source, Truncated: data.Truncated}

	err := h.db.WithOrg(r.Context(), orgID, func(tx pgx.Tx) error {
		// Resolve provider project keys → gitstate project ids, creating as needed.
		projectIDs := map[string]string{}
		for _, p := range data.Projects {
			proj, created, perr := store.FindOrCreateProjectByKey(r.Context(), tx, orgID, p.Key, p.Name)
			if perr != nil {
				return perr
			}
			projectIDs[p.Key] = proj.ID
			if created {
				summary.ProjectsCreated++
			}
		}

		for _, iss := range data.Issues {
			if iss.ExternalID == "" {
				summary.Skipped++
				continue
			}
			inserted, ierr := store.UpsertImportedIssue(r.Context(), tx, store.ImportedIssue{
				OrgID:      orgID,
				ProjectID:  projectIDs[iss.ProjectKey],
				Source:     source,
				ExternalID: iss.ExternalID,
				Title:      iss.Title,
				Body:       iss.Body,
				State:      iss.State,
				Labels:     iss.Labels,
			})
			if ierr != nil {
				return ierr
			}
			if inserted {
				summary.IssuesImported++
			} else {
				summary.IssuesUpdated++
			}
		}
		return nil
	})
	if err != nil {
		slog.Error("import: run", "source", source, "org_id", orgID, "err", err)
		writeError(w, http.StatusInternalServerError, "import failed while writing to the database")
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func buildPreview(source string, data *importer.ImportData, total int) importPreviewResponse {
	out := importPreviewResponse{
		Source:       source,
		IssueCount:   total,
		ProjectCount: len(data.Projects),
		Truncated:    data.Truncated,
		Projects:     make([]importPreviewProject, 0, len(data.Projects)),
		SampleIssues: make([]importPreviewIssue, 0, len(data.Issues)),
	}
	for _, p := range data.Projects {
		out.Projects = append(out.Projects, importPreviewProject{Key: p.Key, Name: p.Name})
	}

	// Build a lookup so the sample can show the human project name.
	projName := map[string]string{}
	for _, p := range data.Projects {
		projName[p.Key] = p.Name
	}

	for i, iss := range data.Issues {
		if i >= importer.PreviewSample {
			break
		}
		labels := iss.Labels
		if labels == nil {
			labels = []string{}
		}
		out.SampleIssues = append(out.SampleIssues, importPreviewIssue{
			ExternalID: iss.ExternalID,
			Title:      iss.Title,
			State:      iss.State,
			Project:    projName[iss.ProjectKey],
			Labels:     labels,
		})
	}
	return out
}

// writeImportError maps an importer.Error to its carried HTTP status; any other
// error becomes a 502. Credentials are never included in the message or logs.
func writeImportError(w http.ResponseWriter, source string, err error) {
	var ie *importer.Error
	if errors.As(err, &ie) {
		slog.Warn("import provider error", "source", source, "code", ie.HTTPStatus(), "msg", ie.Msg)
		writeError(w, ie.HTTPStatus(), ie.Msg)
		return
	}
	slog.Error("import error", "source", source, "err", err)
	writeError(w, http.StatusBadGateway, "import provider request failed")
}
