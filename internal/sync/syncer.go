package sync

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/embed"
	"github.com/exo/gitstate/internal/git"
	"github.com/exo/gitstate/internal/gitanalysis"
	"github.com/exo/gitstate/internal/metrics"
	"github.com/exo/gitstate/internal/store"
	"github.com/jackc/pgx/v5"
)

// issueRefRe matches issue references in PR titles/bodies:
//   - #123
//   - Closes #123 / Fixes #123 / Resolves #123 (GitHub closing keywords)
//
// Capture group 1 is the issue number string.
var issueRefRe = regexp.MustCompile(`(?i)(?:closes?|fixes?|resolves?)?\s*#(\d+)`)

// cloneAndIngest does ONE full clone of the repo and populates BOTH the commits
// table (so Analytics, Cycle Time, and Contribution have data) AND the deep
// git-analysis tables (commit_files / blame-survival / SZZ). A full clone (no
// --depth) is required because blame-survival needs real history. Best-effort:
// every step logs and continues, so a private repo the token can't read, or a
// blame hiccup, never fails the overall sync.
func cloneAndIngest(ctx context.Context, database *db.DB, orgID string, repo store.Repo, token string, log *slog.Logger) {
	tmp, err := os.MkdirTemp("", "gitstate-sync-*")
	if err != nil {
		log.Error("sync: temp dir", "err", err)
		return
	}
	defer func() { _ = os.RemoveAll(tmp) }()

	cloneCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	var stderr bytes.Buffer
	cmd := exec.CommandContext(cloneCtx, "git", "clone", "--no-tags", injectCloneToken(repo.CloneURL, token), tmp)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		log.Error("sync: clone repo", "err", err, "stderr", strings.TrimSpace(stderr.String()))
		return
	}

	// 1. Raw commits → commits table (feeds Analytics, the heatmap, Cycle Time, Contribution).
	if commits, err := git.WalkCommits(ctx, tmp, time.Time{}); err != nil {
		log.Error("sync: walk commits", "err", err)
	} else if len(commits) > 0 {
		if e := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
			for _, c := range commits {
				if err := store.UpsertCommit(ctx, tx, &store.Commit{
					OrgID: orgID, RepoID: repo.ID, SHA: c.SHA,
					AuthorLogin: c.AuthorName, AuthorEmail: c.AuthorEmail, IsAgent: c.IsAgent,
					Message: c.Message, Additions: c.Additions, Deletions: c.Deletions, CommittedAt: c.CommittedAt,
				}); err != nil {
					return err
				}
			}
			return nil
		}); e != nil {
			log.Error("sync: store commits", "err", e)
		} else {
			log.Info("sync: commits stored", "count", len(commits))
		}
	}

	// 2. Deep analysis → commit_files / blame-survival / SZZ (Contribution dashboards).
	if res, err := gitanalysis.AnalyzeRepo(ctx, tmp); err != nil {
		log.Error("sync: analyze git history", "err", err)
	} else if err := store.StoreResult(ctx, database, orgID, repo.ID, res); err != nil {
		log.Error("sync: store git analysis", "err", err)
	}
}

// injectCloneToken adds x-access-token auth to an https clone URL so private repos
// can be cloned with the org's stored token.
func injectCloneToken(url, token string) string {
	if token == "" || !strings.HasPrefix(url, "https://") {
		return url
	}
	rest := url[len("https://"):]
	if i := strings.IndexByte(rest, '/'); i >= 0 && strings.Contains(rest[:i], "@") {
		return url // already has userinfo
	}
	return "https://x-access-token:" + token + "@" + rest
}

// SyncRepo pulls all issues and pull requests from the remote platform into the
// gitstate database for the given repo, then computes derived_state from linked
// git activity (the wedge: auto-progress, decisions P1).
//
// The caller is responsible for providing the correct Provider for the repo's
// platform. SyncRepo is designed to be run in a goroutine — it is context-aware
// and logs structured errors rather than returning them from this function.
//
// Auto-progress rule (decisions P1 — derived-not-entered):
//   - issue referenced by an open PR  → derived_state = "in_progress"
//   - issue referenced by a merged PR → derived_state = "done"
//   - merged PR wins over open PR if both reference the same issue.
//
// Issue references are parsed from PR title + body using:
//   - bare "#<N>" references
//   - GitHub/GitLab closing keywords: "Closes #N", "Fixes #N", "Resolves #N"
func SyncRepo(ctx context.Context, database *db.DB, provider Provider, orgID string, repo store.Repo, cloneToken string) error {
	log := slog.With(
		"org_id", orgID,
		"repo_id", repo.ID,
		"platform", repo.Platform,
		"full_name", repo.FullName,
	)
	log.Info("sync: starting repo sync")

	// Cloning a full repo + analyzing its history can take a while on large repos,
	// so this sync gets a longer budget than the API-only steps would need.
	ctx, cancel := context.WithTimeout(ctx, 15*time.Minute)
	defer cancel()

	// ── 1. Fetch remote issues ────────────────────────────────────────────────
	remoteIssues, err := provider.ListIssues(ctx, repo.FullName)
	if err != nil {
		return fmt.Errorf("sync: list issues: %w", err)
	}
	log.Info("sync: fetched remote issues", "count", len(remoteIssues))

	// Upsert all remote issues (source='git') using pool-based upsert.
	// RLS is satisfied by setting app.current_org at session level in UpsertIssue.
	for _, ri := range remoteIssues {
		issue := store.IssueUpsert{
			OrgID:      orgID,
			RepoID:     repo.ID,
			Source:     "git",
			Platform:   repo.Platform,
			ExternalID: ri.ExternalID,
			Number:     ri.Number,
			Title:      ri.Title,
			Body:       ri.Body,
			State:      ri.State,
			Labels:     ri.Labels,
		}
		if err := store.UpsertIssue(ctx, database.Pool(), orgID, issue); err != nil {
			log.Error("sync: upsert issue", "external_id", ri.ExternalID, "err", err)
		}
	}

	// ── 2. Fetch remote PRs ───────────────────────────────────────────────────
	remotePRs, err := provider.ListPullRequests(ctx, repo.FullName)
	if err != nil {
		return fmt.Errorf("sync: list prs: %w", err)
	}
	log.Info("sync: fetched remote prs", "count", len(remotePRs))

	// issueProgress maps issue number → derived state.
	// "done" takes precedence over "in_progress" (merged PR beats open PR).
	issueProgress := map[int]string{}

	// Upsert PRs inside a single db.WithOrg transaction for RLS correctness.
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, rpr := range remotePRs {
			pr := remotePRtoPullRequest(orgID, repo.ID, repo.Platform, rpr)
			if err := store.UpsertPR(ctx, tx, pr); err != nil {
				// Log but don't abort the whole sync on a single PR failure.
				log.Error("sync: upsert pr", "external_id", rpr.ExternalID, "err", err)
			}

			// Parse issue references from title + body for auto-progress.
			refs := parseIssueRefs(rpr.Title + "\n" + rpr.Body)
			for _, num := range refs {
				switch rpr.State {
				case "merged":
					issueProgress[num] = "done" // merged always wins
				case "open":
					if issueProgress[num] != "done" {
						issueProgress[num] = "in_progress"
					}
				}
			}
		}
		return nil
	}); err != nil {
		log.Error("sync: upsert prs tx", "err", err)
	}

	// ── 2.5. Fetch + store PR reviews (Involvement: reviews_done) ─────────────
	// One API call per PR (ListReviews), so this loops over the just-synced PRs.
	// Self-reviews (reviewer == PR author) are skipped — they are not "the
	// invisible senior work" Involvement credits. All best-effort: a fetch/store
	// failure logs and continues; it must never fail the sync.
	syncPRReviews(ctx, database, provider, orgID, repo, remotePRs, log)

	// ── 2.6. Fetch + store deployments (DORA: deploy frequency / CFR) ─────────
	// Idempotent on (org_id, source, external_id) via store.InsertDeployment's
	// ON CONFLICT, so re-syncs do not double-count. Best-effort.
	syncDeployments(ctx, database, provider, orgID, repo, log)

	// ── 2.7. Derive incidents from synced issues (DORA: MTTR) ─────────────────
	// GitHub/GitLab have no native incidents — derive them HONESTLY from issues
	// whose labels mark them as an incident/outage/sevN. Best-effort.
	syncIncidentsFromIssues(ctx, database, orgID, repo, remoteIssues, log)

	// ── 3. Apply derived_state from linked PRs (auto-progress) ───────────────
	if len(issueProgress) > 0 {
		issues, err := store.ListIssuesByRepo(ctx, database.Pool(), orgID, repo.ID)
		if err != nil {
			log.Error("sync: list issues by repo for derived state", "err", err)
		} else {
			for _, iss := range issues {
				derived, linked := issueProgress[iss.Number]
				if !linked {
					continue
				}
				if err := store.SetDerivedState(ctx, database.Pool(), orgID, iss.ID, derived); err != nil {
					log.Error("sync: set derived state",
						"issue_id", iss.ID, "state", derived, "err", err)
				}
			}
		}
	}

	// ── 4. Update last_synced_at on the repo ──────────────────────────────────
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		return store.UpdateRepoSyncedAt(ctx, tx, orgID, repo.ID)
	}); err != nil {
		log.Error("sync: update last_synced_at", "err", err)
	}

	// ── 4.5. Clone + analyze git history (commits, blame-survival, SZZ, coupling) ─
	// The platform API returns issues/PRs but NOT commit-level data — so without
	// this, Contribution, the commit heatmap/analytics, and cycle time (lead time =
	// merged_at − first commit) are all empty. Clone the repo and run the analysis
	// engine, then persist commits/commit_files/attribution. Best-effort: a clone
	// failure (private repo without a token, network) must not fail the sync. Runs
	// BEFORE ComputeCycleTimes so lead times have first-commit timestamps.
	if repo.CloneURL == "" {
		log.Warn("sync: no clone URL — skipping commit/contribution analysis")
	} else {
		cloneAndIngest(ctx, database, orgID, repo, cloneToken, log)
	}

	// ── 5. Post-sync metrics: cycle times + self-calibrating effort curves ─────
	// Fresh merged PRs change the cycle-time series and the difficulty→time
	// calibration. ComputeCycleTimes produces the lead times that
	// RecomputeCalibration then backfills into effort_estimates.actual_secs and
	// folds into the per-cohort curves. Non-fatal: a metrics failure must not fail
	// the sync. The LLM is not needed here (nil-provider service is fine).
	metricsSvc := metrics.New(database, nil)
	if err := metricsSvc.ComputeCycleTimes(ctx, orgID, repo.ID); err != nil {
		log.Error("sync: compute cycle times", "err", err)
	}
	if err := metricsSvc.RecomputeCalibration(ctx, orgID); err != nil {
		log.Error("sync: recompute calibration", "err", err)
	}

	// ── 6. Post-sync embeddings: keep the semantic (pgvector) index current ────
	// Freshly upserted/edited issues need a (re)computed embedding so semantic
	// search can find them by meaning. The local embedder is deterministic and
	// network-free; the pass is idempotent (only NULL/stale rows). Non-fatal: a
	// failure here must never fail the sync.
	if n, err := embed.EmbedPendingIssues(ctx, database, orgID); err != nil {
		log.Error("sync: embed pending issues", "err", err)
	} else if n > 0 {
		log.Info("sync: embedded pending issues", "count", n)
	}

	log.Info("sync: repo sync complete",
		"issues", len(remoteIssues),
		"prs", len(remotePRs),
		"derived_states", len(issueProgress),
	)
	return nil
}

// remotePRtoPullRequest converts a RemotePR to the store.PullRequest type.
func remotePRtoPullRequest(orgID, repoID, platform string, rpr RemotePR) *store.PullRequest {
	pr := &store.PullRequest{
		OrgID:        orgID,
		RepoID:       repoID,
		Platform:     platform,
		ExternalID:   rpr.ExternalID,
		Number:       rpr.Number,
		Title:        rpr.Title,
		AuthorLogin:  rpr.AuthorLogin,
		State:        rpr.State,
		Additions:    rpr.Additions,
		Deletions:    rpr.Deletions,
		ChangedFiles: rpr.ChangedFiles,
		CreatedAt:    rpr.CreatedAt,
	}
	if rpr.MergedAt != nil {
		pr.MergedAt = *rpr.MergedAt
	}
	if !rpr.FirstCommitAt.IsZero() {
		pr.FirstCommitAt = rpr.FirstCommitAt
	}
	return pr
}

// parseIssueRefs returns all unique issue numbers referenced in text.
// Handles both bare "#123" and closing-keyword forms like "Closes #123".
func parseIssueRefs(text string) []int {
	matches := issueRefRe.FindAllStringSubmatch(text, -1)
	seen := map[int]bool{}
	var out []int
	for _, m := range matches {
		n, err := strconv.Atoi(strings.TrimSpace(m[1]))
		if err != nil || n <= 0 {
			continue
		}
		if !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	return out
}

// syncPRReviews fetches reviews for each synced PR and stores them mapped to the
// PR's internal id. Reviews authored by the PR author (self-reviews) are skipped.
// Wholly best-effort: every failure logs and continues.
func syncPRReviews(ctx context.Context, database *db.DB, provider Provider, orgID string, repo store.Repo, remotePRs []RemotePR, log *slog.Logger) {
	stored := 0
	for _, rpr := range remotePRs {
		reviews, err := provider.ListReviews(ctx, repo.FullName, rpr.Number)
		if err != nil {
			log.Error("sync: list reviews", "pr_number", rpr.Number, "err", err)
			continue
		}
		if len(reviews) == 0 {
			continue
		}
		if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
			// Resolve this PR's internal UUID (UpsertPR keys on external_id). Read
			// inside the org-scoped tx so FORCE-RLS permits it (a bare-pool lookup
			// returns no rows here).
			var prID string
			if err := tx.QueryRow(ctx,
				`SELECT id FROM pull_requests WHERE org_id=$1 AND repo_id=$2 AND external_id=$3`,
				orgID, repo.ID, rpr.ExternalID).Scan(&prID); err != nil {
				return fmt.Errorf("resolve pr %s: %w", rpr.ExternalID, err)
			}
			for _, rv := range reviews {
				// Skip self-reviews: a reviewer who is the PR author is not doing the
				// invisible review work Involvement credits.
				if strings.EqualFold(rv.ReviewerLogin, rpr.AuthorLogin) {
					continue
				}
				if rv.ReviewerLogin == "" {
					continue
				}
				if err := store.UpsertPRReview(ctx, tx, store.PRReviewInput{
					OrgID:         orgID,
					RepoID:        repo.ID,
					PRID:          prID,
					ReviewerLogin: rv.ReviewerLogin,
					State:         rv.State,
					ExternalID:    rv.ExternalID,
					SubmittedAt:   rv.SubmittedAt,
				}); err != nil {
					log.Error("sync: upsert review", "pr_id", prID, "reviewer", rv.ReviewerLogin, "err", err)
					continue
				}
				stored++
			}
			return nil
		}); err != nil {
			log.Error("sync: store reviews tx", "pr_number", rpr.Number, "err", err)
		}
	}
	if stored > 0 {
		log.Info("sync: pr reviews stored", "count", stored)
	}
}

// syncDeployments fetches CI/CD deployments for the repo and stores them
// idempotently (ON CONFLICT on (org_id, source, external_id)). Best-effort.
func syncDeployments(ctx context.Context, database *db.DB, provider Provider, orgID string, repo store.Repo, log *slog.Logger) {
	deps, err := provider.ListDeployments(ctx, repo.FullName)
	if err != nil {
		log.Error("sync: list deployments", "err", err)
		return
	}
	if len(deps) == 0 {
		return
	}
	source := "manual"
	switch provider.Platform() {
	case "github":
		source = "github_actions"
	case "gitlab":
		source = "gitlab_ci"
	}
	stored := 0
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, d := range deps {
			if _, err := store.InsertDeployment(ctx, tx, store.DeploymentInput{
				OrgID:       orgID,
				RepoID:      repo.ID,
				Environment: d.Environment,
				Status:      d.Status,
				SHA:         d.SHA,
				Source:      source,
				ExternalID:  d.ExternalID,
				DeployedAt:  d.DeployedAt,
			}); err != nil {
				log.Error("sync: insert deployment", "external_id", d.ExternalID, "err", err)
				continue
			}
			stored++
		}
		return nil
	}); err != nil {
		log.Error("sync: store deployments tx", "err", err)
	}
	if stored > 0 {
		log.Info("sync: deployments stored", "count", stored)
	}
}

// incidentLabelRe / incidentSeverity classify an issue's labels as an incident.
var (
	incidentLabelRe = regexp.MustCompile(`(?i)^(incident|outage|sev[-_ ]?[12]|severity[:\-_/].+)$`)
	severityLabelRe = regexp.MustCompile(`(?i)^(?:sev[-_ ]?([12])|severity[:\-_/](.+))$`)
)

// incidentFromLabels reports whether the labels mark an issue as an incident and,
// if so, the derived severity (e.g. "sev1", "sev2", or the severity:* value).
func incidentFromLabels(labels []string) (bool, string) {
	isIncident := false
	severity := ""
	for _, l := range labels {
		t := strings.TrimSpace(l)
		if !incidentLabelRe.MatchString(t) {
			continue
		}
		isIncident = true
		if m := severityLabelRe.FindStringSubmatch(t); m != nil {
			switch {
			case m[1] != "":
				severity = "sev" + m[1]
			case m[2] != "":
				severity = strings.ToLower(strings.TrimSpace(m[2]))
			}
		} else if severity == "" {
			// bare "incident"/"outage" with no severity → "major"
			severity = "major"
		}
	}
	return isIncident, severity
}

// syncIncidentsFromIssues derives incidents from synced issues whose labels mark
// them as an incident/outage/sevN. opened_at = issue created_at; resolved_at =
// the close time when the issue is closed. Best-effort and idempotent by title
// dedupe (one open incident per repo+title at a time via HasOpenIncidentForRepo
// is too coarse, so we dedupe on existing rows with the same title+opened_at).
func syncIncidentsFromIssues(ctx context.Context, database *db.DB, orgID string, repo store.Repo, issues []RemoteIssue, log *slog.Logger) {
	created := 0
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, iss := range issues {
			ok, sev := incidentFromLabels(iss.Labels)
			if !ok {
				continue
			}
			opened := iss.CreatedAt
			if opened.IsZero() {
				opened = time.Now().UTC()
			}
			// Idempotency: skip if an incident with the same repo+title+opened_at
			// already exists (re-sync of the same issue must not duplicate).
			var exists bool
			if err := tx.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM incidents
					WHERE org_id = $1 AND repo_id = $2 AND title = $3 AND opened_at = $4
				)`, orgID, repo.ID, iss.Title, opened.UTC()).Scan(&exists); err != nil {
				log.Error("sync: incident exists check", "issue_number", iss.Number, "err", err)
				continue
			}
			if exists {
				// Already recorded; if the issue has since closed, stamp resolved_at.
				if iss.State == "closed" && !iss.UpdatedAt.IsZero() {
					if _, err := tx.Exec(ctx, `
						UPDATE incidents SET resolved_at = $5
						WHERE org_id = $1 AND repo_id = $2 AND title = $3 AND opened_at = $4
						  AND resolved_at IS NULL`,
						orgID, repo.ID, iss.Title, opened.UTC(), iss.UpdatedAt.UTC()); err != nil {
						log.Error("sync: incident resolve", "issue_number", iss.Number, "err", err)
					}
				}
				continue
			}
			inc, err := store.InsertIncident(ctx, tx, store.IncidentInput{
				OrgID:    orgID,
				RepoID:   repo.ID,
				Title:    iss.Title,
				Severity: sev,
				OpenedAt: opened,
			})
			if err != nil {
				log.Error("sync: insert incident", "issue_number", iss.Number, "err", err)
				continue
			}
			created++
			// A closed incident-issue is a resolved incident → resolved_at = close time.
			if iss.State == "closed" && !iss.UpdatedAt.IsZero() {
				if _, err := store.ResolveIncident(ctx, tx, orgID, inc.ID, iss.UpdatedAt); err != nil {
					log.Error("sync: resolve incident", "issue_number", iss.Number, "err", err)
				}
			}
		}
		return nil
	}); err != nil {
		log.Error("sync: store incidents tx", "err", err)
	}
	if created > 0 {
		log.Info("sync: incidents derived from issues", "count", created)
	}
}

// NewProvider constructs the correct Provider for the given platform.
// baseURL is used only for GitLab self-hosted instances; pass "" for gitlab.com.
// ctx is only used for GitHub (oauth2 transport setup).
func NewProvider(ctx context.Context, platform, token, baseURL string) (Provider, error) {
	switch platform {
	case "github":
		return NewGitHubProvider(ctx, token), nil
	case "gitlab":
		return NewGitLabProvider(token, baseURL)
	default:
		return nil, fmt.Errorf("sync: unknown platform %q (supported: github, gitlab)", platform)
	}
}
