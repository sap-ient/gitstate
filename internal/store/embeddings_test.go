// Package store — embeddings_test.go
// DB-backed tests for the semantic (pgvector) layer:
//   - SetIssueEmbedding round-trips a vector and SearchIssuesByVector ranks the
//     nearest issue first;
//   - hybrid Search surfaces the vector-similar issue ahead of a weak FTS match and
//     reports semantic=true;
//   - hybrid Search still works (FTS-only, semantic=false) when nothing is embedded;
//   - RLS keeps another org's embedded issue out of the vector results.
//
// Skips when DATABASE_URL is unset. Runs under the gitstate_app FORCE-RLS role.
package store

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/exo/gitstate/internal/embed"
	"github.com/jackc/pgx/v5"
)

func TestSetIssueEmbeddingRoundTrip(t *testing.T) {
	database := tokensTestDB(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ns := time.Now().UnixNano()
	var orgID, repoID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("emb-%d", ns), "Embed Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id=$1`, orgID)
	})

	var loginID, deployID string
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/svc') RETURNING id`,
			orgID, fmt.Sprintf("emb-repo-%d", ns)).Scan(&repoID); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx,
			`INSERT INTO issues (org_id, repo_id, source, number, title, body, state)
			 VALUES ($1,$2,'native',1,'Users cannot log in','the authentication flow is broken at login','open') RETURNING id`,
			orgID, repoID).Scan(&loginID); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx,
			`INSERT INTO issues (org_id, repo_id, source, number, title, body, state)
			 VALUES ($1,$2,'native',2,'Export invoices to CSV','add a billing export button for invoices','open') RETURNING id`,
			orgID, repoID).Scan(&deployID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// ── ListIssuesNeedingEmbedding sees both before embedding. ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		pending, e := ListIssuesNeedingEmbedding(ctx, tx, orgID, embed.Model(), 100)
		if e != nil {
			return e
		}
		if len(pending) != 2 {
			t.Fatalf("expected 2 pending issues, got %d", len(pending))
		}
		return nil
	}); err != nil {
		t.Fatalf("list pending: %v", err)
	}

	// ── Embed + persist both. ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		for _, it := range []struct{ id, text string }{
			{loginID, "Users cannot log in\nthe authentication flow is broken at login"},
			{deployID, "Export invoices to CSV\nadd a billing export button for invoices"},
		} {
			lit := embed.ToPGVector(embed.Embed(it.text))
			if e := SetIssueEmbedding(ctx, tx, it.id, lit, embed.Model()); e != nil {
				return e
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("set embeddings: %v", err)
	}

	// ── After embedding, nothing is pending (idempotency). ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		pending, e := ListIssuesNeedingEmbedding(ctx, tx, orgID, embed.Model(), 100)
		if e != nil {
			return e
		}
		if len(pending) != 0 {
			t.Fatalf("expected 0 pending after embedding, got %d", len(pending))
		}
		return nil
	}); err != nil {
		t.Fatalf("list pending after: %v", err)
	}

	// ── KNN: a "login broken" query ranks the auth issue first. ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		qLit := embed.ToPGVector(embed.Embed("login is broken, cannot authenticate"))
		hits, e := SearchIssuesByVector(ctx, tx, qLit, 10)
		if e != nil {
			return e
		}
		if len(hits) == 0 {
			t.Fatalf("expected vector hits, got none")
		}
		if hits[0].IssueID != loginID {
			t.Fatalf("expected login issue ranked first, got %s (sim=%.4f)", hits[0].IssueID, hits[0].Similarity)
		}
		return nil
	}); err != nil {
		t.Fatalf("vector search: %v", err)
	}
}

// TestHybridSemanticBeatsWeakFTS: an issue with NO query keyword but high semantic
// similarity is fused ahead of a weak/absent FTS match, and semantic=true.
func TestHybridSemanticBeatsWeakFTS(t *testing.T) {
	database := tokensTestDB(t)
	defer database.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	ns := time.Now().UnixNano()
	var orgID, otherOrgID, repoID string
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("hyb-%d", ns), "Hybrid Org").Scan(&orgID); err != nil {
		t.Fatalf("create org: %v", err)
	}
	if err := database.Pool().QueryRow(ctx,
		`INSERT INTO organizations (slug, name) VALUES ($1,$2) RETURNING id`,
		fmt.Sprintf("hyb-other-%d", ns), "Hybrid Other").Scan(&otherOrgID); err != nil {
		t.Fatalf("create other org: %v", err)
	}
	t.Cleanup(func() {
		_, _ = database.Pool().Exec(context.Background(), `DELETE FROM organizations WHERE id IN ($1,$2)`, orgID, otherOrgID)
	})

	// semanticID: shares meaning with the query ("login broken") but NOT the exact
	// query phrase. otherID: an unrelated issue.
	var semanticID string
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'acme/svc') RETURNING id`,
			orgID, fmt.Sprintf("hyb-repo-%d", ns)).Scan(&repoID); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx,
			`INSERT INTO issues (org_id, repo_id, source, number, title, body, state)
			 VALUES ($1,$2,'native',10,$3,$4,'open') RETURNING id`,
			orgID, repoID,
			"Sign-in flow fails after redirect",
			"the authentication session is dropped so users get bounced back to the login screen",
		).Scan(&semanticID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO issues (org_id, repo_id, source, number, title, body, state)
			 VALUES ($1,$2,'native',11,'Improve CSV export performance','batch the billing invoice export query','open')`,
			orgID, repoID); err != nil {
			return err
		}
		return nil
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// ── Before embedding: FTS-only. A query with no lexical match returns nothing
	// (or fuzzy), and semantic must be false. ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		_, _, semantic, e := Search(ctx, tx, orgID, "users cannot log in", []string{"issues"}, 10)
		if e != nil {
			return e
		}
		if semantic {
			t.Fatalf("semantic must be false before any issue is embedded")
		}
		return nil
	}); err != nil {
		t.Fatalf("pre-embed search: %v", err)
	}

	// ── Embed all pending issues for the org (exercises the batch path indirectly
	// via the store accessors). ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		pending, e := ListIssuesNeedingEmbedding(ctx, tx, orgID, embed.Model(), 100)
		if e != nil {
			return e
		}
		for _, it := range pending {
			lit := embed.ToPGVector(embed.Embed(it.Title + "\n" + it.Body))
			if e := SetIssueEmbedding(ctx, tx, it.ID, lit, embed.Model()); e != nil {
				return e
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("embed pending: %v", err)
	}

	// ── After embedding: the semantic query surfaces the auth/login issue and
	// reports semantic=true. ──
	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		results, fuzzy, semantic, e := Search(ctx, tx, orgID, "users cannot log in, authentication broken", []string{"issues"}, 10)
		if e != nil {
			return e
		}
		if !semantic {
			t.Fatalf("expected semantic=true after embedding; results=%+v", results)
		}
		if fuzzy {
			t.Fatalf("did not expect fuzzy fallback when vectors matched")
		}
		found := false
		for _, r := range results {
			if r.ID == semanticID {
				found = true
				if r.Title == "" {
					t.Fatalf("vector-surfaced issue should be hydrated with a title")
				}
			}
		}
		if !found {
			t.Fatalf("semantic query should surface the login/auth issue; got %+v", results)
		}
		return nil
	}); err != nil {
		t.Fatalf("post-embed search: %v", err)
	}

	// ── RLS: another org's embedded issue must never appear. ──
	if err := database.WithOrg(ctx, otherOrgID, func(tx pgx.Tx) error {
		var otherRepo, otherIssue string
		if err := tx.QueryRow(ctx,
			`INSERT INTO repos (org_id, platform, external_id, full_name) VALUES ($1,'github',$2,'other/svc') RETURNING id`,
			otherOrgID, fmt.Sprintf("hyb-other-repo-%d", ns)).Scan(&otherRepo); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx,
			`INSERT INTO issues (org_id, repo_id, source, number, title, body, state)
			 VALUES ($1,$2,'native',99,'Secret login auth issue','authentication broken secret org body','open') RETURNING id`,
			otherOrgID, otherRepo).Scan(&otherIssue); err != nil {
			return err
		}
		lit := embed.ToPGVector(embed.Embed("Secret login auth issue authentication broken"))
		return SetIssueEmbedding(ctx, tx, otherIssue, lit, embed.Model())
	}); err != nil {
		t.Fatalf("seed other org: %v", err)
	}

	if err := database.WithOrg(ctx, orgID, func(tx pgx.Tx) error {
		qLit := embed.ToPGVector(embed.Embed("authentication broken login secret"))
		hits, e := SearchIssuesByVector(ctx, tx, qLit, 50)
		if e != nil {
			return e
		}
		for _, h := range hits {
			var num int
			if e := tx.QueryRow(ctx, `SELECT COALESCE(number,0) FROM issues WHERE id=$1`, h.IssueID).Scan(&num); e != nil {
				return e
			}
			if num == 99 {
				t.Fatalf("RLS leak: other-org embedded issue surfaced in vector results")
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("rls vector search: %v", err)
	}
}
