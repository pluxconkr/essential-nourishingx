-- Exact table privileges.
-- This project still has Supabase's legacy default ACL on `public`: every new table, sequence and function was
-- granted ALL (including TRUNCATE, which ignores RLS) to anon and authenticated, so the explicit grants in
-- 20261023143715_core_schema.sql only added to that. Supabase stops exposing new tables by default on all
-- projects from 2026-10-30 (changelog 2026-04-28); this migration applies that model now and then grants only
-- what each policy needs. scripts/rls-test.mjs asserts the resulting privileges.

revoke all on public.checkins, public.meal_analyses, public.menu_days, public.weekly_reports,
              public.ai_usage, public.app_settings
  from anon, authenticated;

grant select, insert, update, delete on public.checkins to authenticated;
grant select, delete on public.meal_analyses to authenticated;
grant select on public.menu_days to anon, authenticated;
grant insert, update, delete on public.menu_days to authenticated;
grant select on public.weekly_reports to authenticated;

revoke all on sequence public.ai_usage_id_seq from anon, authenticated;

-- Future objects in `public` start unexposed; each migration grants what it needs.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;
