#!/usr/bin/env bash
# Provision a fresh gitstate Postgres database with the RLS role grants, then migrate.
#
# gitstate's tenancy boundary is Postgres RLS enforced via a NON-superuser app role
# (gitstate_app, FORCE RLS) plus a BYPASSRLS admin role (gitstate_admin). This script
# creates those roles if missing, creates the database, sets ALTER DEFAULT PRIVILEGES
# so every migrated table auto-grants to the app role, then runs migrations. It does
# NOT seed demo data — it leaves you an empty, real, signup-ready instance.
#
# Usage:
#   scripts/provision-db.sh [dbname]          # default: gitstate_local
# Env:
#   SUPERUSER  superuser/owner role to run as (default: current $USER)
#   PGHOST     default localhost
#   APP_PASSWORD / ADMIN_PASSWORD  passwords for the roles if created (default devpass)
set -euo pipefail

DB="${1:-gitstate_local}"
SUPER="${SUPERUSER:-$USER}"
HOST="${PGHOST:-localhost}"
APP_PW="${APP_PASSWORD:-devpass}"
ADMIN_PW="${ADMIN_PASSWORD:-devpass}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ roles (cluster-wide; created only if missing)"
psql -h "$HOST" -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='gitstate_app') THEN
    CREATE ROLE gitstate_app LOGIN PASSWORD '${APP_PW}';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='gitstate_admin') THEN
    CREATE ROLE gitstate_admin LOGIN PASSWORD '${ADMIN_PW}' BYPASSRLS;
  END IF;
END \$\$;
SQL

echo "→ database ${DB}"
psql -h "$HOST" -U "$SUPER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE ${DB} OWNER ${SUPER};" 2>/dev/null \
  && echo "  created" || echo "  already exists — continuing"

echo "→ grants + default privileges (new tables auto-grant to gitstate_app)"
psql -h "$HOST" -U "$SUPER" -d "$DB" -v ON_ERROR_STOP=1 <<SQL
GRANT CONNECT ON DATABASE ${DB} TO gitstate_app, gitstate_admin;
GRANT USAGE ON SCHEMA public TO gitstate_app, gitstate_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE ${SUPER} IN SCHEMA public
  GRANT INSERT, SELECT, UPDATE, DELETE ON TABLES TO gitstate_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ${SUPER} IN SCHEMA public
  GRANT SELECT ON TABLES TO gitstate_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE ${SUPER} IN SCHEMA public
  GRANT SELECT, USAGE ON SEQUENCES TO gitstate_app;
-- Grant any pre-existing tables too (idempotent re-runs).
GRANT INSERT, SELECT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gitstate_app;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO gitstate_app;
SQL

echo "→ migrate (as ${SUPER})"
DATABASE_URL="postgres://${SUPER}@${HOST}:5432/${DB}?sslmode=disable" \
  go run "${ROOT}/cmd/migrate" up

echo ""
echo "✓ provisioned '${DB}' — empty, real, signup-ready. Point your .env at it:"
echo "    DATABASE_URL=postgres://gitstate_app:${APP_PW}@${HOST}:5432/${DB}?sslmode=disable"
echo "    ADMIN_DATABASE_URL=postgres://gitstate_admin:${ADMIN_PW}@${HOST}:5432/${DB}?sslmode=disable"
