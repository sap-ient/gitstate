-- 20260621_017_effort_calibration
-- Self-calibrating effort estimation (Wave 1 of the AI/agent flywheel).
--
-- Today effort_estimates stores the model's difficulty (1-10) but never links to
-- the ACTUAL outcome, so difficulty->hours is a fixed guess. This adds the
-- closed loop: store the calibrated prediction at creation, fill the real actual
-- (lead time) at merge, and maintain per-cohort difficulty->time curves so the
-- conversion learns from each org's own history. Forward-only.

-- Predictions + actuals on the estimate row.
ALTER TABLE effort_estimates
    ADD COLUMN IF NOT EXISTS predicted_secs numeric,  -- calibrated estimate at creation (difficulty->secs via curve)
    ADD COLUMN IF NOT EXISTS actual_secs    bigint,   -- observed lead time, filled at merge from cycle_times
    ADD COLUMN IF NOT EXISTS cohort_key     text,     -- cohort used for the conversion (repo / area / change-type)
    ADD COLUMN IF NOT EXISTS size_bucket    text,     -- xs|s|m|l|xl by LOC + files touched
    ADD COLUMN IF NOT EXISTS change_type    text;      -- feature|fix|refactor|chore|docs|test (heuristic)

-- Backfill linkage from observed cycle times for already-merged PRs is done in
-- Go (metrics) so the existing pr_id join stays in one place.

-- Per-org, per-cohort difficulty -> observed-actual-time curve. The richest
-- cohort with enough n wins (repo|area -> repo -> global), with empirical-Bayes
-- shrinkage toward the global prior when n is small (applied in Go at read time).
CREATE TABLE effort_calibration (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cohort_key        text NOT NULL,          -- 'global' | 'repo:<id>' | 'repo:<id>|area:<path>' | 'type:<t>'
    difficulty_bucket int  NOT NULL,          -- 1..10 (rounded model difficulty)
    median_secs       bigint,                 -- recency-weighted median observed actual
    p25_secs          bigint,
    p75_secs          bigint,
    mean_secs         bigint,
    n                 int  NOT NULL DEFAULT 0, -- sample size in the cohort/bucket
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, cohort_key, difficulty_bucket)
);
CREATE INDEX ON effort_calibration (org_id, cohort_key);

-- Per-org running estimation-accuracy summary (MAE / bias), surfaced in the UI so
-- a team can see "estimates run 20% low on the payments service".
CREATE TABLE effort_accuracy (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    cohort_key   text NOT NULL,
    n            int  NOT NULL DEFAULT 0,
    mae_secs     bigint,                       -- mean absolute error
    bias_ratio   numeric,                      -- mean(predicted/actual): <1 = under-estimating
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, cohort_key)
);
CREATE INDEX ON effort_accuracy (org_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['effort_calibration','effort_accuracy'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY org_isolation ON %I
        USING (org_id = current_org()) WITH CHECK (org_id = current_org());$p$, t);
  END LOOP;
END $$;
