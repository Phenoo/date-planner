#!/usr/bin/env bash
set -euo pipefail
# This script creates and removes only its own isolated, temporary PostgreSQL cluster.
for program in initdb pg_ctl psql; do command -v "$program" >/dev/null || { echo "Install PostgreSQL to run database checks."; exit 1; }; done
atlas_test_dir=$(mktemp -d /tmp/date-atlas-db.XXXXXX)
atlas_script_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cleanup() { pg_ctl -D "$atlas_test_dir/data" -m immediate -w stop >/dev/null 2>&1 || true; rm -rf "$atlas_test_dir"; }
trap cleanup EXIT
initdb -D "$atlas_test_dir/data" -A trust --no-locale >/dev/null
pg_ctl -D "$atlas_test_dir/data" -l "$atlas_test_dir/log" -o "-F -c listen_addresses='' -k $atlas_test_dir -p 55439" -w start >/dev/null
atlas_psql=(psql -h "$atlas_test_dir" -p 55439 -d postgres -v ON_ERROR_STOP=1 -q)
"${atlas_psql[@]}" <<'SQL'
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to anon,authenticated,service_role;
SQL
"${atlas_psql[@]}" -f "$atlas_script_root/supabase/migrations/202610250001_date_atlas.sql"
"${atlas_psql[@]}" -f "$atlas_script_root/tests/rls.sql"
echo "Database migration, atomic catalog updates, and access policies passed."
