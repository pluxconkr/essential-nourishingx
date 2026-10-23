-- Advisor lint 0003 (auth_rls_initplan, 2026-10-24) flagged the staff policies: the permanent-user check was written
-- `(select (auth.jwt() ->> 'is_anonymous')::boolean)`, which the linter does not recognise as read once per query.
-- `((select auth.jwt()) ->> 'is_anonymous')` is the same check with the JWT read once, the form the Supabase RLS
-- performance guide recommends. The check stays in the policy text so lint 0012 keeps seeing staff policies as
-- closed to anonymous users (see 20261023144049_harden_policies.sql).

alter policy "menu: staff add days" on public.menu_days
  with check ((select private.is_staff()) and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

alter policy "menu: staff edit days" on public.menu_days
  using ((select private.is_staff()) and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false)
  with check ((select private.is_staff()) and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

alter policy "menu: staff remove days" on public.menu_days
  using ((select private.is_staff()) and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);

alter policy "weekly reports: staff read" on public.weekly_reports
  using ((select private.is_staff()) and ((select auth.jwt()) ->> 'is_anonymous')::boolean is false);
