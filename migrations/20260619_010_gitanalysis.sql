-- 20260619_010_gitanalysis
-- Deep git analysis that powers the gaming-resistant contribution dimensions:
--   * commit_files     — per-commit file-level churn + test detection (test-coupling)
--   * author_survival  — git-blame line survival per author (durability: does your code persist?)
--   * bug_introductions— SZZ: blame bug-fix commits back to the change that introduced them (quality)
-- Populated by internal/gitanalysis (clones the repo, runs git log/blame/SZZ). Aggregates only;
-- no source code is stored. forward-only.

CREATE TABLE commit_files (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    repo_id     uuid NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    commit_sha  text NOT NULL,
    author_email citext,
    path        text NOT NULL,
    additions   integer NOT NULL DEFAULT 0,
    deletions   integer NOT NULL DEFAULT 0,
    is_test     boolean NOT NULL DEFAULT false,
    committed_at timestamptz,
    UNIQUE (org_id, repo_id, commit_sha, path)
);
CREATE INDEX ON commit_files (org_id, repo_id);
CREATE INDEX ON commit_files (org_id, author_email);

CREATE TABLE author_survival (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    repo_id         uuid NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    author_email    citext NOT NULL,
    surviving_lines integer NOT NULL DEFAULT 0, -- lines authored that still exist at HEAD
    authored_lines  integer NOT NULL DEFAULT 0, -- total lines this author ever introduced
    computed_at     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, repo_id, author_email)
);
CREATE INDEX ON author_survival (org_id);

CREATE TABLE bug_introductions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    repo_id        uuid NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    author_email   citext NOT NULL,        -- who introduced the buggy line (SZZ blame)
    introduced_sha text NOT NULL,
    fix_sha        text NOT NULL,          -- the bug-fix commit that touched it
    lines          integer NOT NULL DEFAULT 1,
    detected_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, repo_id, introduced_sha, fix_sha)
);
CREATE INDEX ON bug_introductions (org_id);
CREATE INDEX ON bug_introductions (org_id, author_email);

-- New contribution dimension: durability (blame-survival). Default weight.
ALTER TABLE contribution_weights
    ADD COLUMN IF NOT EXISTS durability numeric NOT NULL DEFAULT 15;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['commit_files','author_survival','bug_introductions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY org_isolation ON %I
        USING (org_id = current_org()) WITH CHECK (org_id = current_org());$p$, t);
  END LOOP;
END $$;
