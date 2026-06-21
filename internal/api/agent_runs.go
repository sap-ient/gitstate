package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5"
)

// RegisterAgentRunRoutes wires the /api/agent-runs endpoints onto mux.
// Called by the orchestrator from router.go — this package does NOT edit router.go.
//
// Wave 3 of the AI/agent flywheel: the write path that lets agents record what they
// did. Both routes accept EITHER a human JWT (X-Org-ID) or a machine API token
// (RequireAuthOrToken). Writes additionally require the "write:agent_runs" scope;
// the list read is fine on "read:issues". Every DB op runs via db.WithOrg so RLS
// scopes rows to the principal's org.
func RegisterAgentRunRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {
	h := &agentRunHandlers{db: database, cfg: cfg}
	authOrToken := middleware.RequireAuthOrToken(cfg, database)
	writeRuns := middleware.RequireScope("write:agent_runs")
	readRuns := middleware.RequireScope("read:issues")

	mux.Handle("POST /api/agent-runs",
		authOrToken(writeRuns(http.HandlerFunc(h.createRun))))
	mux.Handle("GET /api/agent-runs",
		authOrToken(readRuns(http.HandlerFunc(h.listRuns))))
}

type agentRunHandlers struct {
	db  *db.DB
	cfg *config.Config
}

// createRunRequest is the POST /api/agent-runs body. Optional fields are pointers
// so an omitted value is distinguishable from a zero value where it matters.
type createRunRequest struct {
	RepoID      *string `json:"repoId"`
	PRID        *string `json:"prId"`
	IssueID     *string `json:"issueId"`
	Goal        string  `json:"goal"`
	AgentName   string  `json:"agentName"`
	Branch      string  `json:"branch"`
	DiffSummary *struct {
		Additions    int `json:"additions"`
		Deletions    int `json:"deletions"`
		ChangedFiles int `json:"changedFiles"`
	} `json:"diffSummary"`
	TestsPassed *bool    `json:"testsPassed"`
	HumanAction string   `json:"humanAction"`
	Iterations  *int     `json:"iterations"`
	CostUSD     *float64 `json:"costUsd"`
}

// POST /api/agent-runs — log a new agent run. supervisor_id defaults to the
// authenticated principal. Returns the created run (201).
func (h *agentRunHandlers) createRun(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())
	user := middleware.UserFromContext(r.Context())
	if orgID == "" {
		writeError(w, http.StatusUnauthorized, "org context required")
		return
	}

	var req createRunRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Goal = strings.TrimSpace(req.Goal)
	if req.Goal == "" {
		writeError(w, http.StatusBadRequest, "goal is required")
		return
	}

	in := store.AgentRunInput{
		RepoID:      req.RepoID,
		PRID:        req.PRID,
		IssueID:     req.IssueID,
		Goal:        req.Goal,
		AgentName:   strings.TrimSpace(req.AgentName),
		Branch:      strings.TrimSpace(req.Branch),
		TestsPassed: req.TestsPassed,
		HumanAction: strings.TrimSpace(req.HumanAction),
		Iterations:  req.Iterations,
		CostUSD:     req.CostUSD,
	}
	if req.DiffSummary != nil {
		in.DiffSummary = store.DiffSummary{
			Additions:    req.DiffSummary.Additions,
			Deletions:    req.DiffSummary.Deletions,
			ChangedFiles: req.DiffSummary.ChangedFiles,
		}
	}
	// supervisor_id defaults to the authenticated principal (human OR token's user).
	if user != nil && user.ID != "" {
		uid := user.ID
		in.SupervisorID = &uid
	}

	var run *store.AgentRun
	var createErr error
	if err := h.db.WithOrg(r.Context(), orgID, func(tx pgx.Tx) error {
		run, createErr = store.CreateAgentRun(r.Context(), tx, orgID, in)
		return createErr
	}); err != nil {
		if errors.Is(createErr, store.ErrInvalidHumanAction) {
			writeError(w, http.StatusBadRequest, "humanAction must be one of: accepted, edited, reverted")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not log agent run")
		return
	}

	writeJSON(w, http.StatusCreated, run)
}

// GET /api/agent-runs — list runs newest-first with optional repo/pr/issue/agent
// filters and a capped limit.
func (h *agentRunHandlers) listRuns(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())
	if orgID == "" {
		writeError(w, http.StatusUnauthorized, "org context required")
		return
	}

	q := r.URL.Query()
	filter := store.AgentRunFilter{
		RepoID:  strings.TrimSpace(q.Get("repo")),
		PRID:    strings.TrimSpace(q.Get("pr")),
		IssueID: strings.TrimSpace(q.Get("issue")),
		Agent:   strings.TrimSpace(q.Get("agent")),
	}
	if ls := q.Get("limit"); ls != "" {
		if n, err := strconv.Atoi(ls); err == nil {
			filter.Limit = n
		}
	}

	var runs []*store.AgentRun
	if err := h.db.WithOrg(r.Context(), orgID, func(tx pgx.Tx) error {
		var e error
		runs, e = store.ListAgentRuns(r.Context(), tx, orgID, filter)
		return e
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "could not list agent runs")
		return
	}

	writeJSON(w, http.StatusOK, runs)
}
