-- 20260623_026_pr_reviews
-- PR review events fetched from GitHub/GitLab, so Involvement can show real
-- "reviews done" (the invisible senior work) instead of an empty column.
-- Org-scoped, FORCE-RLS. Forward-only.

CREATE TABLE pr_reviews (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    repo_id        uuid NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    pr_id          uuid NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    reviewer_login text NOT NULL,
    state          text NOT NULL,            -- approved | changes_requested | commented | dismissed
    external_id    text,                      -- platform review id (idempotency)
    submitted_at   timestamptz NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, pr_id, reviewer_login, submitted_at)
);
CREATE INDEX ON pr_reviews (org_id, repo_id);
CREATE INDEX ON pr_reviews (org_id, reviewer_login);
CREATE INDEX ON pr_reviews (org_id, pr_id);

ALTER TABLE pr_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON pr_reviews
    USING (org_id = current_org()) WITH CHECK (org_id = current_org());
