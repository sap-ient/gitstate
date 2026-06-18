package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/llm"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/report"
)

// RegisterReportRoutes wires the /api/reports/* endpoints onto mux.
// Called by the orchestrator from router.go — this file does NOT edit router.go.
//
// All routes require authentication (RequireAuth) and an org context (OrgScope)
// so that report.Service calls are always scoped to the authenticated org.
//
// Routes:
//   - GET  /api/reports/dashboard         → state rollup, throughput, activity, optional synthesis
//   - GET  /api/reports/burndown?project= → burndown series for a project or whole org
//   - POST /api/reports/query             → NL→report: {question} → {answer, sql, rows}
func RegisterReportRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {
	llmSvc := llm.New(cfg)
	svc := report.New(database, llmSvc)

	h := &reportHandlers{svc: svc, cfg: cfg}

	requireAuth := middleware.RequireAuth(cfg.Auth.JWTSigningKey)
	orgScope := middleware.OrgScope(database.Pool())

	// All reporting routes require auth + org membership.
	chain := func(handler http.Handler) http.Handler {
		return requireAuth(orgScope(handler))
	}

	mux.Handle("GET /api/reports/dashboard", chain(http.HandlerFunc(h.dashboard)))
	mux.Handle("GET /api/reports/burndown", chain(http.HandlerFunc(h.burndown)))
	mux.Handle("POST /api/reports/query", chain(http.HandlerFunc(h.query)))
}

// reportHandlers holds shared state for reporting HTTP handlers.
type reportHandlers struct {
	svc *report.Service
	cfg *config.Config
}

// GET /api/reports/dashboard
//
// Query params:
//   - synthesize=true   — include LLM-written prose status (optional; default false)
func (h *reportHandlers) dashboard(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())
	if orgID == "" {
		writeError(w, http.StatusBadRequest, "org context required")
		return
	}

	synthesize := r.URL.Query().Get("synthesize") == "true"

	result, err := h.svc.Dashboard(r.Context(), orgID, synthesize)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build dashboard: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// GET /api/reports/burndown
//
// Query params:
//   - project=<uuid>   — scope to a specific project (optional; default = whole org)
//   - days=<int>       — window in days (optional; default 30)
func (h *reportHandlers) burndown(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())
	if orgID == "" {
		writeError(w, http.StatusBadRequest, "org context required")
		return
	}

	projectID := r.URL.Query().Get("project")

	days := 30
	if d := r.URL.Query().Get("days"); d != "" {
		n, err := strconv.Atoi(d)
		if err != nil || n <= 0 || n > 365 {
			writeError(w, http.StatusBadRequest, "days must be a positive integer ≤ 365")
			return
		}
		days = n
	}

	result, err := h.svc.Burndown(r.Context(), orgID, projectID, days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build burndown: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}

// queryRequest is the JSON body for POST /api/reports/query.
type queryRequest struct {
	Question string `json:"question"`
}

// POST /api/reports/query
//
// Body: {"question": "<natural language question>"}
// Response: {"answer": "...", "sql": "...", "rows": [...]}
//
// Security: the question is translated to a read-only SELECT by the LLM and
// executed inside a db.WithOrg RLS-scoped read-only transaction. See
// report.Service.AnswerQuery for the full safety model.
func (h *reportHandlers) query(w http.ResponseWriter, r *http.Request) {
	orgID := middleware.OrgFromContext(r.Context())
	if orgID == "" {
		writeError(w, http.StatusBadRequest, "org context required")
		return
	}

	var req queryRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Question == "" {
		writeError(w, http.StatusBadRequest, "question is required")
		return
	}

	result, err := h.svc.AnswerQuery(r.Context(), orgID, req.Question)
	if err != nil {
		if errors.Is(err, llm.ErrLLMNotConfigured) {
			writeError(w, http.StatusServiceUnavailable, "LLM is not configured; set AnthropicAPIKey to enable NL→report")
			return
		}
		if errors.Is(err, report.ErrQueryRejected) {
			writeError(w, http.StatusBadRequest, "generated query failed safety validation: "+err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "query failed: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, result)
}
