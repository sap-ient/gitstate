// Package api — contribution_window_test.go
// DB-backed HTTP test proving Contribution attributes review + ownership to GIT
// IDENTITIES (commit author_email / reviewer_login), NOT gitstate user accounts.
//
// Regression guard for the "own/rev don't fill on synced data" bug: when you import
// someone else's org the contributors aren't gitstate users (100+ git authors, one
// org member), so the old involvement→users join attributed to almost nobody. The
// fix computes review (pr_reviews by reviewer_login) and ownership (commit_files
// top-level dirs by author_email) straight from the git identities, like durability.
//
// Seeds a contributor + a reviewer that have NO users rows, drives the real
// GET /api/contribution all-time, and asserts both dimensions fill. Skips without DATABASE_URL.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/config"
	"github.com/jackc/pgx/v5"
)

func TestContributionAttributesGitIdentitiesWithoutUsers(t *testing.T) {
	database := apiTestDB(t)
	defer database.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	const signingKey = "test-signing-key-for-contrib-gitident"
	cfg := &config.Config{}
	cfg.Auth.JWTSigningKey = signingKey

	ns := time.Now().UnixNano()
	var orgID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("contrib-gi-%d", ns), "Contrib GitIdent Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	defer func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id = $1`, orgID)
	}()

	// Owner calls the endpoint. The CONTRIBUTOR + REVIEWER below have NO users rows.
	_, ownerTok := seedMember(t, ctx, database, signingKey, orgID, "owner")

	devLogin := fmt.Sprintf("dev%d", ns)
	devEmail := fmt.Sprintf("%s@example.test", devLogin)
	reviewerLogin := fmt.Sprintf("rev%d", ns)
	reviewerEmail := fmt.Sprintf("%s@example.test", reviewerLogin)

	old := time.Date(2021, 3, 11, 0, 0, 0, 0, time.UTC) // old month; all-time window covers it

	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		var repoID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name, default_branch)
			 VALUES ($1,'github',$2,$3,'main') RETURNING id`,
			orgID, fmt.Sprintf("ext-%d", ns), "acme/old").Scan(&repoID); err != nil {
			return err
		}
		sha := fmt.Sprintf("sha-%d", ns)
		if _, err := tx.Exec(ctx,
			`INSERT INTO commits (org_id, repo_id, sha, author_login, author_email, additions, deletions, is_agent, committed_at)
			 VALUES ($1,$2,$3,$4,$5,120,8,false,$6)`,
			orgID, repoID, sha, devLogin, devEmail, old); err != nil {
			return err
		}
		// commit_files in TWO top-level dirs → areas_owned = 2 (ownership).
		for _, path := range []string{"src/app/main.go", "lib/util/x.go"} {
			if _, err := tx.Exec(ctx,
				`INSERT INTO commit_files (org_id, repo_id, commit_sha, author_email, path, additions, deletions, is_test, committed_at)
				 VALUES ($1,$2,$3,$4,$5,10,1,false,$6)`,
				orgID, repoID, sha, devEmail, path, old); err != nil {
				return err
			}
		}
		var prID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO pull_requests (org_id, repo_id, platform, external_id, number, title, author_login, state, created_at, merged_at)
			 VALUES ($1,$2,'github',$3,7,'Old feature',$4,'merged',$5,$6) RETURNING id`,
			orgID, repoID, fmt.Sprintf("pr-%d", ns), devLogin, old, old.AddDate(0, 0, 1)).Scan(&prID); err != nil {
			return err
		}
		// Reviewer is also a committer (realistic) so review merges onto their identity.
		if _, err := tx.Exec(ctx,
			`INSERT INTO commits (org_id, repo_id, sha, author_login, author_email, additions, deletions, is_agent, committed_at)
			 VALUES ($1,$2,$3,$4,$5,30,2,false,$6)`,
			orgID, repoID, fmt.Sprintf("sha-rev-%d", ns), reviewerLogin, reviewerEmail, old); err != nil {
			return err
		}
		// A review BY the reviewer (not the PR author) → reviews_done for the reviewer.
		if _, err := tx.Exec(ctx,
			`INSERT INTO pr_reviews (org_id, repo_id, pr_id, reviewer_login, state, submitted_at)
			 VALUES ($1,$2,$3,$4,'approved',$5)`,
			orgID, repoID, prID, reviewerLogin, old); err != nil {
			return err
		}
		return nil
	}); err != nil {
		t.Fatalf("seed under WithOrg: %v", err)
	}

	mux := http.NewServeMux()
	RegisterContributionRoutes(mux, database, cfg)
	req := httptest.NewRequest(http.MethodGet, "/api/contribution?from=2000-01-01&to=2026-12-31", nil)
	req.Header.Set("Authorization", "Bearer "+ownerTok)
	req.Header.Set("X-Org-ID", orgID)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /api/contribution: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Members []struct {
			Login      string `json:"login"`
			Email      string `json:"email"`
			Dimensions struct {
				Ownership struct {
					Raw struct {
						AreasOwned int `json:"areasOwned"`
					} `json:"raw"`
				} `json:"ownership"`
				Review struct {
					Raw struct {
						ReviewsDone int `json:"reviewsDone"`
					} `json:"raw"`
				} `json:"review"`
			} `json:"dimensions"`
		} `json:"members"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode report: %v", err)
	}

	// Ownership must fill for the dev (git identity, no users row); review must fill
	// for SOME member (the reviewer) — both proving git-identity attribution works.
	var ownershipOK, reviewOK bool
	for _, m := range resp.Members {
		if (m.Email == devEmail || m.Login == devLogin) && m.Dimensions.Ownership.Raw.AreasOwned >= 2 {
			ownershipOK = true
		}
		if m.Dimensions.Review.Raw.ReviewsDone >= 1 {
			reviewOK = true
		}
	}
	if !ownershipOK {
		t.Errorf("ownership did not fill for the git-identity contributor %q (no users row)", devEmail)
	}
	if !reviewOK {
		t.Errorf("review did not fill for any git-identity reviewer (no users row)")
	}
}
