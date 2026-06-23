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

// analyzeBlame runs the deep git analysis (commit_files / blame-survival / SZZ /
// test-coupling) that needs real git objects. Commits themselves are NOT ingested
// here — they come from the platform commits API (see provider.ListCommits) — so
// this is the ONLY clone left in a sync, and it is deliberately minimal:
//
//   - --filter=blob:none → a BLOBLESS partial clone: it fetches commits + trees
//     for the full history but pulls file blobs lazily, on demand, only when blame
//     actually touches a file. That is far less data than a full working-tree clone.
//   - --no-tags --single-branch → only the default branch's ref, no tag refs.
//   - NO --depth: blame-survival needs the FULL history, so the graph stays intact.
//
// The clone lands in a temp dir and is deleted on return — the repo is NEVER
// cached or persisted. Best-effort: a clone or blame failure logs and returns, so
// it never fails the overall sync.
func analyzeBlame(ctx context.Context, database *db.DB, orgID string, repo store.Repo, token string, log *slog.Logger) {
	tmp, err := os.MkdirTemp("", "gitstate-sync-*")
	if err != nil {
		log.Error("sync: temp dir", "err", err)
		return
	}
	defer func() { _ = os.RemoveAll(tmp) }()

	cloneCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	var stderr bytes.Buffer
	cmd := exec.CommandContext(cloneCtx, "git", "clone",
		"--filter=blob:none", "--no-tags", "--single-branch",
		injectCloneToken(repo.CloneURL, token), tmp)
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		log.Error("sync: clone repo (blobless)", "err", err, "stderr", strings.TrimSpace(stderr.String()))
		return
	}

	// Deep analysis → commit_files / blame-survival / SZZ (Contribution dashboards).
	// AnalyzeRepo runs `git log` + `git blame`; the blobless clone fetches the blobs
	// blame touches on demand, so this works without a full checkout.
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

	// fetchComplete tracks whether EVERY remote FETCH (issues/PRs above, plus
	// reviews/deployments/commits below) succeeded after retries. last_synced_at
	// is advanced ONLY when this stays true — otherwise the next sync re-pulls
	// from the last good point (commits `since` stays put) so a rate-limit-
	// truncated run can never leave a permanent gap. Issues+PRs already returned
	// early on error above, so reaching here they succeeded.
	fetchComplete := true

	// ── 2.5. Fetch + store PR reviews (Involvement: reviews_done) ─────────────
	// Only MERGED PRs are queried for reviews: "reviews done" is the completed-
	// work signal, and gating on merged removes a per-PR API call for every
	// open/closed-unmerged PR (cuts the request multiplier). Self-reviews
	// (reviewer == PR author) are skipped. A reviews FETCH error after retries
	// marks the sync incomplete (so last_synced_at is not advanced); store errors
	// stay best-effort.
	if !syncPRReviews(ctx, database, provider, orgID, repo, remotePRs, log) {
		fetchComplete = false
	}

	// ── 2.6. Fetch + store deployments (DORA: deploy frequency / CFR) ─────────
	// Idempotent on (org_id, source, external_id) via store.InsertDeployment's
	// ON CONFLICT, so re-syncs do not double-count. A deployments FETCH error
	// after retries marks the sync incomplete.
	if !syncDeployments(ctx, database, provider, orgID, repo, log) {
		fetchComplete = false
	}

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

	// ── 4a. Fetch commits via the platform API (NO clone) ─────────────────────
	// Commit-level data now comes from the platform commits API, not a clone. The
	// pull is INCREMENTAL: since = repo.LastSyncedAt, so a re-sync fetches only
	// commits added since the last run (a zero/first-sync pulls full history).
	// UpsertCommit is idempotent on (org_id, repo_id, sha). Best-effort: a fetch
	// failure logs and continues. Runs BEFORE ComputeCycleTimes so the commits feed
	// is current. (The list endpoint omits churn → additions/deletions stay 0; the
	// blame pass below supplies per-file churn via commit_files.)
	if !syncCommitsFromAPI(ctx, database, provider, orgID, repo, log) {
		fetchComplete = false
	}

	// ── 4. Update last_synced_at on the repo — ONLY on a COMPLETE sync ─────────
	// If any remote fetch above failed after retries (e.g. a rate-limit wait was
	// cut short by the ctx budget), advancing last_synced_at would make the next
	// incremental run skip the never-fetched window → a permanent gap. So skip the
	// update and let the next sync re-pull from the last good point.
	if fetchComplete {
		if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
			return store.UpdateRepoSyncedAt(ctx, tx, orgID, repo.ID)
		}); err != nil {
			log.Error("sync: update last_synced_at", "err", err)
		}
	} else {
		log.Warn("sync: incomplete — not advancing last_synced_at; will re-fetch next run")
	}

	// ── 4b. Blobless clone + deep blame analysis (blame-survival, SZZ, coupling) ─
	// The platform API supplies commits (step 4a) but NOT blame/file-level data, so
	// the deep Contribution metrics still need git objects. This is the ONLY clone
	// in a sync, and it is a temp blobless partial clone that is deleted on return
	// (the repo is never stored). Best-effort: a clone failure (private repo without
	// a token, network) must not fail the sync. Runs BEFORE ComputeCycleTimes.
	if repo.CloneURL == "" {
		log.Warn("sync: no clone URL — skipping blame/contribution analysis")
	} else {
		analyzeBlame(ctx, database, orgID, repo, cloneToken, log)
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

// syncPRReviews fetches reviews for each MERGED PR and stores them mapped to the
// PR's internal id. Reviews authored by the PR author (self-reviews) are skipped.
// Returns false if any review FETCH failed after retries (so the caller can hold
// last_synced_at); store failures stay best-effort and do NOT flip the result.
//
// Only merged PRs are queried: "reviews done" is the completed-work signal, so
// skipping open/closed-unmerged PRs here removes a per-PR API call without losing
// any metric, cutting the request multiplier on busy repos.
func syncPRReviews(ctx context.Context, database *db.DB, provider Provider, orgID string, repo store.Repo, remotePRs []RemotePR, log *slog.Logger) bool {
	stored := 0
	complete := true
	for _, rpr := range remotePRs {
		if rpr.State != "merged" {
			continue
		}
		reviews, err := provider.ListReviews(ctx, repo.FullName, rpr.Number)
		if err != nil {
			log.Error("sync: list reviews", "pr_number", rpr.Number, "err", err)
			complete = false
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
	return complete
}

// syncDeployments fetches CI/CD deployments for the repo and stores them
// idempotently (ON CONFLICT on (org_id, source, external_id)). Returns false if
// the deployments FETCH failed after retries; store failures stay best-effort.
func syncDeployments(ctx context.Context, database *db.DB, provider Provider, orgID string, repo store.Repo, log *slog.Logger) bool {
	deps, err := provider.ListDeployments(ctx, repo.FullName)
	if err != nil {
		log.Error("sync: list deployments", "err", err)
		return false
	}
	if len(deps) == 0 {
		return true
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
	return true
}

// syncCommitsFromAPI pulls commits from the platform commits API (no clone) and
// upserts them into the commits table. The pull is INCREMENTAL: since =
// repo.LastSyncedAt, so a re-sync only fetches commits added since the last sync;
// a zero LastSyncedAt (first sync) pulls the full history. UpsertCommit is
// idempotent on (org_id, repo_id, sha). Returns false if the commits FETCH failed
// after retries (so last_synced_at is held and the same `since` window is re-
// pulled next run); store failures stay best-effort.
func syncCommitsFromAPI(ctx context.Context, database *db.DB, provider Provider, orgID string, repo store.Repo, log *slog.Logger) bool {
	var since time.Time
	if repo.LastSyncedAt != nil {
		since = *repo.LastSyncedAt
	}
	commits, err := provider.ListCommits(ctx, repo.FullName, since)
	if err != nil {
		log.Error("sync: list commits (api)", "err", err)
		return false
	}
	if len(commits) == 0 {
		return true
	}
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, c := range commits {
			if err := store.UpsertCommit(ctx, tx, &store.Commit{
				OrgID:       orgID,
				RepoID:      repo.ID,
				SHA:         c.SHA,
				AuthorLogin: c.AuthorLogin,
				AuthorEmail: c.AuthorEmail,
				Message:     c.Message,
				CommittedAt: c.CommittedAt,
			}); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		// Store failure is best-effort and does NOT hold last_synced_at — the FETCH
		// (the thing that can truncate under rate limits) succeeded.
		log.Error("sync: store commits (api) tx", "err", err)
		return true
	}
	log.Info("sync: commits stored (api)", "count", len(commits), "incremental", !since.IsZero())
	return true
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
