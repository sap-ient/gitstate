// Package admin — routes.go
// Server-rendered super-admin console: Analytics, Users, Organizations, SSE.
// Architecture per decisions A9: Go html/template + htmx + SSE for realtime.
// All routes wrap RequireAuth → RequireSuperAdmin (decisions S2).
package admin

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/middleware"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed templates/*.html
var templateFS embed.FS

// ── Template function map ─────────────────────────────────────────────────────

var funcMap = template.FuncMap{
	// formatDate formats a time.Time as "2 Jan 2006".
	"formatDate": func(t time.Time) string { return t.Format("2 Jan 2006") },

	// mrrDollars converts USD cents to a formatted dollar string e.g. "1,234".
	"mrrDollars": func(cents int) string {
		dollars := cents / 100
		s := fmt.Sprintf("%d", dollars)
		var out strings.Builder
		for i, ch := range s {
			if i > 0 && (len(s)-i)%3 == 0 {
				out.WriteByte(',')
			}
			out.WriteRune(ch)
		}
		return out.String()
	},

	// planBadge returns a safe HTML badge span for a plan key.
	"planBadge": func(key string) template.HTML {
		class := "badge-muted"
		switch key {
		case "pro", "team":
			class = "badge-indigo"
		case "scale", "ent":
			class = "badge-teal"
		case "hobby":
			class = "badge-warn"
		}
		return template.HTML(fmt.Sprintf(
			`<span class="badge %s">%s</span>`, class, template.HTMLEscapeString(key),
		))
	},

	// planPct returns an integer percentage for plan distribution bars (0–100).
	"planPct": func(count, maxCount int) int {
		if maxCount == 0 {
			return 0
		}
		p := int(math.Round(float64(count) / float64(maxCount) * 100))
		if p > 100 {
			return 100
		}
		return p
	},

	// sparklinePath emits SVG polygon + polyline markup for the signup sparkline.
	"sparklinePath": func(days []store.SignupDay) template.HTML {
		if len(days) == 0 {
			return ""
		}
		maxC := 1
		for _, d := range days {
			if d.Count > maxC {
				maxC = d.Count
			}
		}
		const w, h = 300.0, 60.0
		n := len(days)
		pts := make([]string, n)
		for i, d := range days {
			x := w * float64(i) / float64(intMax(n-1, 1))
			y := h - (h * float64(d.Count) / float64(maxC))
			pts[i] = fmt.Sprintf("%.1f,%.1f", x, y)
		}
		joined := strings.Join(pts, " ")
		fill := fmt.Sprintf("0,%.1f %s %.1f,%.1f", h, joined, w, h)
		return template.HTML(fmt.Sprintf(
			`<polygon points="%s" fill="url(#sg)"/>
<polyline points="%s" fill="none" stroke="var(--gs-teal)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
			fill, joined,
		))
	},

	"prev": func(p int) int { return p - 1 },
	"next": func(p int) int { return p + 1 },
}

// ── Template loader (singleton) ───────────────────────────────────────────────

var (
	tmplOnce sync.Once
	tmpl     *template.Template
	tmplErr  error
)

func getTemplates() (*template.Template, error) {
	tmplOnce.Do(func() {
		tmpl, tmplErr = template.New("").Funcs(funcMap).ParseFS(templateFS, "templates/*.html")
	})
	return tmpl, tmplErr
}

// ── Handlers struct ───────────────────────────────────────────────────────────

type adminHandlers struct {
	db     *db.DB
	cfg    *config.Config
	pool   *pgxpool.Pool
	broker *sseBroker // nil when Realtime=false
}

// ── RegisterAdminRoutes ───────────────────────────────────────────────────────

// RegisterAdminRoutes wires the super-admin HTML console onto mux.
// Routes registered:
//
//	GET /admin           — Analytics page
//	GET /admin/users     — Users list with search
//	GET /admin/orgs      — Organizations list
//	GET /admin/events    — SSE realtime stream (noop 204 when Realtime=false)
//
// POST mutations (htmx targets):
//
//	POST /admin/users/{id}/promote
//	POST /admin/users/{id}/demote
//
// All routes are behind RequireAuth + RequireSuperAdmin.
// Called by the orchestrator from router.go; this package does NOT edit router.go.
func RegisterAdminRoutes(mux *http.ServeMux, database *db.DB, cfg *config.Config) {
	var pool *pgxpool.Pool
	if database != nil {
		pool = database.Pool()
	}

	h := &adminHandlers{db: database, cfg: cfg, pool: pool}

	if cfg.Admin.Realtime {
		h.broker = newSSEBroker()
		go h.realtimePusher()
	}

	requireAuth := middleware.RequireAuth(cfg.Auth.JWTSigningKey)
	requireSuper := RequireSuperAdmin(cfg, database)
	guard := func(next http.Handler) http.Handler { return requireAuth(requireSuper(next)) }

	mux.Handle("GET /admin",                      guard(http.HandlerFunc(h.analytics)))
	mux.Handle("GET /admin/users",                guard(http.HandlerFunc(h.users)))
	mux.Handle("GET /admin/orgs",                 guard(http.HandlerFunc(h.orgs)))
	mux.Handle("GET /admin/events",               guard(http.HandlerFunc(h.sseEvents)))
	mux.Handle("POST /admin/users/{id}/promote",  guard(http.HandlerFunc(h.promoteUser)))
	mux.Handle("POST /admin/users/{id}/demote",   guard(http.HandlerFunc(h.demoteUser)))
}

// ── Base page data ─────────────────────────────────────────────────────────────

type baseData struct {
	ActivePage  string
	CurrentUser *middleware.AuthUser
	Realtime    bool
}

func (h *adminHandlers) base(r *http.Request, page string) baseData {
	return baseData{
		ActivePage:  page,
		CurrentUser: middleware.UserFromContext(r.Context()),
		Realtime:    h.cfg.Admin.Realtime,
	}
}

func renderErr(w http.ResponseWriter, msg string, status int) {
	http.Error(w, msg, status)
}

// ── Analytics page ────────────────────────────────────────────────────────────

type analyticsData struct {
	baseData
	Stats        *store.AdminStats
	Signups      []store.SignupDay
	Plans        []store.PlanDist
	MaxPlanCount int
}

func (h *adminHandlers) analytics(w http.ResponseWriter, r *http.Request) {
	t, err := getTemplates()
	if err != nil {
		renderErr(w, "template error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	data := analyticsData{baseData: h.base(r, "analytics")}

	if h.pool != nil {
		ctx := r.Context()
		data.Stats, _ = store.GetAdminStats(ctx, h.pool)
		data.Signups, _ = store.GetSignupsByDay(ctx, h.pool, 30)
		data.Plans, _ = store.GetPlanDistribution(ctx, h.pool)
		for _, p := range data.Plans {
			if p.Count > data.MaxPlanCount {
				data.MaxPlanCount = p.Count
			}
		}
	}
	if data.Stats == nil {
		data.Stats = &store.AdminStats{}
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, "layout.html", data); err != nil {
		fmt.Fprintf(w, "\n<!-- template error: %s -->", err)
	}
}

// ── Users page ────────────────────────────────────────────────────────────────

const usersPageSize = 30

type usersData struct {
	baseData
	Users      []store.AdminUser
	Search     string
	Total      int
	Page       int
	TotalPages int
}

func (h *adminHandlers) users(w http.ResponseWriter, r *http.Request) {
	t, err := getTemplates()
	if err != nil {
		renderErr(w, "template error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	q := r.URL.Query()
	search := q.Get("q")
	page, _ := strconv.Atoi(q.Get("page"))
	if page < 1 {
		page = 1
	}

	data := usersData{
		baseData: h.base(r, "users"),
		Search:   search,
		Page:     page,
	}

	if h.pool != nil {
		ctx := r.Context()
		data.Total, _ = store.CountAdminUsers(ctx, h.pool, search)
		data.Users, _ = store.ListAdminUsers(ctx, h.pool, search, usersPageSize, (page-1)*usersPageSize)
	}
	data.TotalPages = intMax(1, int(math.Ceil(float64(data.Total)/float64(usersPageSize))))

	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	// htmx partial: if HX-Request header present, render only the table fragment.
	if r.Header.Get("HX-Request") == "true" {
		if err := t.ExecuteTemplate(w, "users-table", data); err != nil {
			fmt.Fprintf(w, "<!-- template error: %s -->", err)
		}
		return
	}
	if err := t.ExecuteTemplate(w, "layout.html", data); err != nil {
		fmt.Fprintf(w, "\n<!-- template error: %s -->", err)
	}
}

// ── Orgs page ─────────────────────────────────────────────────────────────────

const orgsPageSize = 30

type orgsData struct {
	baseData
	Orgs       []store.AdminOrg
	Total      int
	Page       int
	TotalPages int
}

func (h *adminHandlers) orgs(w http.ResponseWriter, r *http.Request) {
	t, err := getTemplates()
	if err != nil {
		renderErr(w, "template error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}

	data := orgsData{
		baseData: h.base(r, "orgs"),
		Page:     page,
	}

	if h.pool != nil {
		ctx := r.Context()
		data.Total, _ = store.CountAdminOrgs(ctx, h.pool)
		data.Orgs, _ = store.ListAdminOrgs(ctx, h.pool, orgsPageSize, (page-1)*orgsPageSize)
	}
	data.TotalPages = intMax(1, int(math.Ceil(float64(data.Total)/float64(orgsPageSize))))

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := t.ExecuteTemplate(w, "layout.html", data); err != nil {
		fmt.Fprintf(w, "\n<!-- template error: %s -->", err)
	}
}

// ── User mutations (htmx hx-post targets) ─────────────────────────────────────

func (h *adminHandlers) promoteUser(w http.ResponseWriter, r *http.Request) {
	h.setSuper(w, r, true)
}

func (h *adminHandlers) demoteUser(w http.ResponseWriter, r *http.Request) {
	h.setSuper(w, r, false)
}

func (h *adminHandlers) setSuper(w http.ResponseWriter, r *http.Request, value bool) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	if h.pool == nil {
		http.Error(w, "database unavailable", http.StatusServiceUnavailable)
		return
	}
	if err := store.SetUserSuperAdmin(r.Context(), h.pool, id, value); err != nil {
		http.Error(w, "db: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Re-fetch and render the updated <tr> fragment for htmx swap.
	u, err := store.GetUserByID(r.Context(), h.pool, id)
	if err != nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	row := store.AdminUser{
		ID:           u.ID,
		Email:        u.Email,
		Name:         u.Name,
		IsSuperAdmin: u.IsSuperAdmin,
		CreatedAt:    u.CreatedAt,
	}

	// Inline micro-template for a single <tr> — avoids re-parsing the full template
	// and producing a complete HTML document when only the row is needed.
	const rowTmpl = `{{range .Users}}<tr id="user-{{.ID}}">
  <td>{{.Email}}{{if .IsSuperAdmin}} <span class="badge badge-teal">super</span>{{end}}</td>
  <td>{{.Name}}</td>
  <td>{{if .IsSuperAdmin}}<span class="badge badge-teal">Super Admin</span>{{else}}<span class="badge badge-muted">User</span>{{end}}</td>
  <td style="color:var(--text-muted)">{{formatDate .CreatedAt}}</td>
  <td style="text-align:right">
    {{if .IsSuperAdmin}}
    <button class="btn btn-ghost btn-danger" style="font-size:12px"
      hx-post="/admin/users/{{.ID}}/demote"
      hx-confirm="Remove super-admin from {{.Email}}?"
      hx-target="#user-{{.ID}}" hx-swap="outerHTML">Demote</button>
    {{else}}
    <button class="btn btn-ghost" style="font-size:12px"
      hx-post="/admin/users/{{.ID}}/promote"
      hx-confirm="Make {{.Email}} a super-admin?"
      hx-target="#user-{{.ID}}" hx-swap="outerHTML">Promote</button>
    {{end}}
  </td>
</tr>{{end}}`

	rt := template.Must(template.New("row").Funcs(funcMap).Parse(rowTmpl))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	type rowCtx struct{ Users []store.AdminUser }
	_ = rt.Execute(w, rowCtx{Users: []store.AdminUser{row}})
}

// ── SSE broker ────────────────────────────────────────────────────────────────

// sseBroker fans events to every connected SSE client with a non-blocking send.
type sseBroker struct {
	mu      sync.Mutex
	clients map[chan string]struct{}
}

func newSSEBroker() *sseBroker {
	return &sseBroker{clients: make(map[chan string]struct{})}
}

func (b *sseBroker) subscribe() chan string {
	ch := make(chan string, 8)
	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()
	return ch
}

func (b *sseBroker) unsubscribe(ch chan string) {
	b.mu.Lock()
	delete(b.clients, ch)
	b.mu.Unlock()
}

func (b *sseBroker) publish(event, data string) {
	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", event, data)
	b.mu.Lock()
	for ch := range b.clients {
		select {
		case ch <- msg:
		default: // drop if slow client
		}
	}
	b.mu.Unlock()
}

// ── GET /admin/events — SSE stream ────────────────────────────────────────────

func (h *adminHandlers) sseEvents(w http.ResponseWriter, r *http.Request) {
	if h.broker == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := h.broker.subscribe()
	defer h.broker.unsubscribe(ch)

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	for {
		select {
		case msg := <-ch:
			fmt.Fprint(w, msg)
			fl.Flush()
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			fl.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// ── Realtime pusher ───────────────────────────────────────────────────────────

// realtimePusher runs as a goroutine; pushes fresh stat-tiles HTML via SSE every 15 s.
func (h *adminHandlers) realtimePusher() {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if h.pool == nil || h.broker == nil {
			continue
		}
		stats, err := store.GetAdminStats(context.Background(), h.pool)
		if err != nil {
			continue
		}

		t, err := getTemplates()
		if err != nil {
			continue
		}

		var buf strings.Builder
		if err := t.ExecuteTemplate(&buf, "stat-tiles", stats); err != nil {
			continue
		}

		// SSE data lines must not contain bare newlines; JSON-encode the HTML blob.
		payload, _ := json.Marshal(buf.String())
		h.broker.publish("stats", string(payload))
	}
}

// ── Utility ───────────────────────────────────────────────────────────────────

func intMax(a, b int) int {
	if a > b {
		return a
	}
	return b
}
