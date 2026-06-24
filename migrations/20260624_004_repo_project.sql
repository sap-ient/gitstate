-- 20260624_004_repo_project
-- Link repos to user-created projects so repositories can be grouped into and
-- moved between projects on the Projects page. project_id is nullable — an
-- unassigned repo falls back to its owner-org grouping in the UI. Forward-only.

ALTER TABLE repos ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS repos_project_idx ON repos (org_id, project_id);
