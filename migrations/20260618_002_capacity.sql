-- 20260618_002_capacity
-- forward-only; a rollback is a new migration.
--
-- Adds org-scoped capacity/availability/PTO/time-tracking tables (Wave 4 D4).
-- Decisions:
--   A2/S1 — RLS via current_org() on every org-scoped table.
--   P1    — time_entries.source = 'git' | 'manual' (two truth-modes).
--   A4    — forward-only; rollback = new migration.

-- ── Leave entries (PTO / sick / holidays) ────────────────────────────────
CREATE TABLE leave_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        text NOT NULL DEFAULT 'pto',       -- pto | sick | holiday
    start_date  date NOT NULL,
    end_date    date NOT NULL,
    status      text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT leave_entries_kind_check   CHECK (kind   IN ('pto','sick','holiday')),
    CONSTRAINT leave_entries_status_check CHECK (status IN ('pending','approved','rejected')),
    CONSTRAINT leave_entries_dates_check  CHECK (end_date >= start_date)
);
CREATE INDEX ON leave_entries (org_id);
CREATE INDEX ON leave_entries (org_id, user_id);
CREATE INDEX ON leave_entries (org_id, start_date, end_date);

-- ── Availability (per-member working hours / days per week) ──────────────
-- A row is effective from effective_from until superseded by a later row for
-- the same (org_id, user_id).  The most-recent row wins.
CREATE TABLE availability (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekly_hours    numeric NOT NULL DEFAULT 40,   -- hours per week the member is available
    working_days    int[]   NOT NULL DEFAULT '{1,2,3,4,5}', -- ISO weekdays: 1=Mon…7=Sun
    effective_from  date    NOT NULL DEFAULT CURRENT_DATE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT availability_weekly_hours_check CHECK (weekly_hours > 0 AND weekly_hours <= 168),
    CONSTRAINT availability_working_days_check CHECK (array_length(working_days, 1) BETWEEN 1 AND 7)
);
CREATE INDEX ON availability (org_id);
CREATE INDEX ON availability (org_id, user_id, effective_from DESC);

-- ── Time entries (git-derived or manually entered) ───────────────────────
-- source = 'git'    → derived from git activity (commits/PRs); stub hook, primary path is manual.
-- source = 'manual' → entered by the user; the explicit "truth gap" required by decisions P1/P4.
CREATE TABLE time_entries (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issue_id    uuid REFERENCES issues(id) ON DELETE SET NULL,  -- optional link
    source      text NOT NULL DEFAULT 'manual',    -- git | manual (decisions P1)
    minutes     int  NOT NULL,                     -- duration logged
    occurred_on date NOT NULL DEFAULT CURRENT_DATE,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT time_entries_source_check  CHECK (source  IN ('git','manual')),
    CONSTRAINT time_entries_minutes_check CHECK (minutes > 0)
);
CREATE INDEX ON time_entries (org_id);
CREATE INDEX ON time_entries (org_id, user_id);
CREATE INDEX ON time_entries (org_id, occurred_on);

-- ── Row-Level Security (decisions A2/S1) ─────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leave_entries',
    'availability',
    'time_entries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY org_isolation ON %I
        USING (org_id = current_org())
        WITH CHECK (org_id = current_org());$p$, t);
  END LOOP;
END $$;
