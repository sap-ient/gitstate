package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/exo/gitstate/internal/config"
	"github.com/exo/gitstate/internal/db"
	"github.com/exo/gitstate/internal/jobs"
	"github.com/exo/gitstate/internal/store"
	gitSync "github.com/exo/gitstate/internal/sync"
)

// Job kinds processed by the durable queue. These replace the detached goroutines
// that used to run repo syncs (which died on a server restart, stranding imports).
const (
	// JobSyncRepo: fast sync of one repo (issues/PRs/commits). Payload: {repoId}.
	// On success it enqueues a JobDeepAnalyze for the same repo.
	JobSyncRepo = "sync_repo"
	// JobDeepAnalyze: deep contribution analysis (blame-survival / SZZ / coupling)
	// for one repo. Payload: {repoId}. Skips when HEAD is unchanged.
	JobDeepAnalyze = "deep_analyze"
)

// repoJobPayload is the JSON payload shape for both repo job kinds.
type repoJobPayload struct {
	RepoID string `json:"repoId"`
}

// SyncJobDedupeKey returns the dedupe key for a sync_repo job so re-enqueuing a
// repo while a sync is still live coalesces into the existing job.
func SyncJobDedupeKey(repoID string) string { return "sync:" + repoID }

// DeepAnalyzeJobDedupeKey returns the dedupe key for a deep_analyze job.
func DeepAnalyzeJobDedupeKey(repoID string) string { return "deep:" + repoID }

// RegisterSyncJobHandlers registers the sync_repo and deep_analyze handlers on the
// queue. Call this from main.go after creating the queue and BEFORE q.Start(ctx).
// The handlers live in package api so they can reuse the owner-aware token
// resolution (resolveStoredTokenForOwner) and the store; they run their org-scoped
// work under database.WithOrg(orgID, …).
func RegisterSyncJobHandlers(q *jobs.Queue, database *db.DB, cfg *config.Config) {
	q.Register(JobSyncRepo, makeSyncRepoHandler(q, cfg))
	q.Register(JobDeepAnalyze, makeDeepAnalyzeHandler(cfg))
}

// makeSyncRepoHandler builds the sync_repo handler. It loads the repo under RLS,
// resolves the owner's token, builds the provider, runs the fast sync, then
// enqueues a deep_analyze follow-up.
func makeSyncRepoHandler(q *jobs.Queue, cfg *config.Config) jobs.Handler {
	return func(ctx context.Context, database *db.DB, orgID string, payload json.RawMessage) error {
		repoID, err := decodeRepoID(payload)
		if err != nil {
			return err
		}

		repo, err := loadRepo(ctx, database, orgID, repoID)
		if err != nil {
			return err
		}

		owner, _, _ := splitOwnerName(repo.FullName)
		token, baseURL, err := resolveStoredTokenForOwner(ctx, database, cfg, orgID, repo.Platform, owner)
		if err != nil {
			return fmt.Errorf("sync_repo: resolve token for %s: %w", repo.FullName, err)
		}

		provider, err := gitSync.NewProvider(ctx, repo.Platform, token, baseURL)
		if err != nil {
			return fmt.Errorf("sync_repo: build provider for %s: %w", repo.FullName, err)
		}

		if err := gitSync.SyncRepo(ctx, database, provider, orgID, *repo, token); err != nil {
			return fmt.Errorf("sync_repo: sync %s: %w", repo.FullName, err)
		}

		// Deep analysis runs AFTER the fast sync (dashboards populate first). Enqueue
		// it as its own durable job so it too survives a restart. Best-effort: a
		// failed enqueue is logged, not fatal (the fast sync already succeeded).
		if err := q.Enqueue(ctx, orgID, JobDeepAnalyze, repoJobPayload{RepoID: repoID}, jobs.EnqueueOpts{
			DedupeKey: DeepAnalyzeJobDedupeKey(repoID),
			Priority:  -1, // lower than fast syncs so they drain first
		}); err != nil {
			slog.Warn("sync_repo: enqueue deep_analyze failed", "repo_id", repoID, "org_id", orgID, "err", err)
		}
		return nil
	}
}

// makeDeepAnalyzeHandler builds the deep_analyze handler. It loads the repo under
// RLS, resolves the owner's token, and runs the deep analysis (which itself skips
// when HEAD is unchanged since the last deep run).
func makeDeepAnalyzeHandler(cfg *config.Config) jobs.Handler {
	return func(ctx context.Context, database *db.DB, orgID string, payload json.RawMessage) error {
		repoID, err := decodeRepoID(payload)
		if err != nil {
			return err
		}

		repo, err := loadRepo(ctx, database, orgID, repoID)
		if err != nil {
			return err
		}

		owner, _, _ := splitOwnerName(repo.FullName)
		token, _, err := resolveStoredTokenForOwner(ctx, database, cfg, orgID, repo.Platform, owner)
		if err != nil {
			return fmt.Errorf("deep_analyze: resolve token for %s: %w", repo.FullName, err)
		}

		if err := gitSync.AnalyzeRepoDeep(ctx, database, orgID, *repo, token, slog.Default()); err != nil {
			return fmt.Errorf("deep_analyze: analyze %s: %w", repo.FullName, err)
		}
		return nil
	}
}

// decodeRepoID extracts and validates the repoId from a repo job payload.
func decodeRepoID(payload json.RawMessage) (string, error) {
	var p repoJobPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return "", fmt.Errorf("decode repo job payload: %w", err)
	}
	if p.RepoID == "" {
		return "", fmt.Errorf("repo job payload missing repoId")
	}
	return p.RepoID, nil
}

// loadRepo fetches a repo by id inside the org's RLS context.
func loadRepo(ctx context.Context, database *db.DB, orgID, repoID string) (*store.Repo, error) {
	var repo *store.Repo
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		r, e := store.GetRepo(ctx, tx, orgID, repoID)
		repo = r
		return e
	}); err != nil {
		return nil, fmt.Errorf("load repo %s: %w", repoID, err)
	}
	return repo, nil
}
