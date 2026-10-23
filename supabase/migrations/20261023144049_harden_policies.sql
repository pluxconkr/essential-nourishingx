-- Hardening after `supabase db advisors` (2026-10-23):
-- * lint 0028/0029: the project's pre-existing `public.rls_auto_enable()` (the event-trigger function behind
--   `ensure_rls`) was callable over /rest/v1/rpc by anon and authenticated. Event triggers fire without the
--   caller's EXECUTE privilege, so revoking it keeps the auto-RLS behaviour and closes the RPC.
-- * lint 0012: staff policies applied to the `authenticated` role, which anonymous users share. Staff must now
--   be permanent (non-anonymous) users in both the helper and the policy text.
-- Student tables keep anonymous access on purpose: every student is an anonymous user, and each policy pins
-- rows to `(select auth.uid()) = user_id`.

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create or replace function private.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff', false)
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false;
$$;

drop policy "menu: staff add days" on public.menu_days;
drop policy "menu: staff edit days" on public.menu_days;
drop policy "menu: staff remove days" on public.menu_days;
drop policy "weekly reports: staff read" on public.weekly_reports;

create policy "menu: staff add days" on public.menu_days
  for insert to authenticated
  with check ((select private.is_staff()) and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false);
create policy "menu: staff edit days" on public.menu_days
  for update to authenticated
  using ((select private.is_staff()) and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false)
  with check ((select private.is_staff()) and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false);
create policy "menu: staff remove days" on public.menu_days
  for delete to authenticated
  using ((select private.is_staff()) and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false);
create policy "weekly reports: staff read" on public.weekly_reports
  for select to authenticated
  using ((select private.is_staff()) and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false);
