-- 20260623_005_jobs
-- Durable background job queue in Postgres (no Redis needed): in-process workers
-- dequeue with SELECT … FOR UPDATE SKIP LOCKED, so a server restart never strands
-- work — jobs are rows; stale 'running' jobs are requeued on startup. Forward-only.

CREATE TABLE jobs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    kind        text NOT NULL,                       -- 'sync_repo' | 'deep_analyze' | …
    payload     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- job args (e.g. {repoId, owner})
    status      text NOT NULL DEFAULT 'pending',      -- pending | running | done | failed
    priority    int  NOT NULL DEFAULT 0,              -- higher runs first
    attempts    int  NOT NULL DEFAULT 0,
    max_attempts int NOT NULL DEFAULT 5,
    run_after   timestamptz NOT NULL DEFAULT now(),   -- earliest eligible time (backoff)
    locked_at   timestamptz,                          -- when a worker claimed it
    locked_by   text,                                 -- worker id (for stale-lock recovery)
    last_error  text,
    dedupe_key  text,                                 -- optional: skip enqueue if a live job shares it
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The hot dequeue path: pending+eligible, by priority then age.
CREATE INDEX jobs_dequeue_idx ON jobs (status, run_after, priority DESC, created_at)
    WHERE status = 'pending';
CREATE INDEX jobs_org_idx ON jobs (org_id);
CREATE INDEX jobs_running_idx ON jobs (status, locked_at) WHERE status = 'running';
-- At most one LIVE (pending|running) job per dedupe_key, so re-enqueues coalesce.
CREATE UNIQUE INDEX jobs_dedupe_live_idx ON jobs (org_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL AND status IN ('pending', 'running');

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON jobs
    USING (org_id = current_org()) WITH CHECK (org_id = current_org());

-- The background worker dequeues across ALL orgs, so it runs on the BYPASSRLS admin
-- role (gitstate_admin) which skips the org_isolation policy. It needs full DML on
-- the queue (the API/app role enqueues under RLS as usual).
GRANT SELECT, INSERT, UPDATE, DELETE ON jobs TO gitstate_admin;
