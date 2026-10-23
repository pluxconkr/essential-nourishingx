-- NourishingX core schema (docs/adr/0001-supabase-ai-pivot.md).
-- Every table enables RLS and grants explicitly: new tables are no longer exposed to the Data API
-- automatically (Supabase changelog, 2026-04-28 "Tables not exposed to Data and GraphQL API automatically").
-- Anonymous students hold the `authenticated` role, so every student policy also checks ownership.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Staff are marked in app_metadata, which only the Admin API can write. user_metadata is user-editable
-- and must never authorise anything (Supabase security checklist).
create or replace function private.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'staff', false);
$$;
revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- Check-ins: five values and a local date per student. No names, device ids or timing leave the phone.
create table public.checkins (
  user_id    uuid        not null default auth.uid(),
  day        date        not null,
  fullness   smallint    not null check (fullness between 1 and 5),
  energy     smallint    not null check (energy between 1 and 5),
  focus      smallint    not null check (focus between 1 and 5),
  training   text        not null check (training in ('none', 'light', 'moderate', 'heavy')),
  skipped    text        not null check (skipped in ('none', 'breakfast', 'lunch', 'dinner')),
  cohort     text        not null default 'real' check (cohort in ('real', 'synthetic')),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
comment on table public.checkins is 'One check-in per student per local day. Synthetic rows (cohort) fill the staff dashboard until a pilot.';
alter table public.checkins enable row level security;
grant select, insert, update, delete on public.checkins to authenticated;
grant all on public.checkins to service_role;

create policy "checkins: students read their own rows" on public.checkins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "checkins: students add their own rows" on public.checkins
  for insert to authenticated with check ((select auth.uid()) = user_id and cohort = 'real');
create policy "checkins: students change their own rows" on public.checkins
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and cohort = 'real');
create policy "checkins: students delete their own rows" on public.checkins
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- Meal analyses: the router's validated result. The photo itself is never stored anywhere.
-- Only the analyze-meal Edge Function (service role) inserts, so students cannot fabricate analyses
-- that would feed the staff aggregates; students may read and delete their own.
create table public.meal_analyses (
  id         uuid         primary key default gen_random_uuid(),
  user_id    uuid         not null,
  day        date         not null,
  meal       text         not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  items      jsonb        not null check (jsonb_typeof(items) = 'array'),
  kcal       integer      not null check (kcal between 0 and 6000),
  kcal_low   integer      not null check (kcal_low >= 0),
  kcal_high  integer      not null,
  protein_g  numeric(6,1) not null check (protein_g >= 0),
  carbs_g    numeric(6,1) not null check (carbs_g >= 0),
  fat_g      numeric(6,1) not null check (fat_g >= 0),
  fiber_g    numeric(6,1) not null check (fiber_g >= 0),
  groups     text[]       not null default '{}',
  uncertain  text[]       not null default '{}',
  difficulty text         not null check (difficulty in ('easy', 'medium', 'hard')),
  tier       text         not null check (tier in ('haiku', 'opus', 'fable')),
  confidence text         not null check (confidence in ('low', 'medium', 'high')),
  cohort     text         not null default 'real' check (cohort in ('real', 'synthetic')),
  created_at timestamptz  not null default now(),
  check (kcal_high >= kcal_low)
);
create index meal_analyses_user_day on public.meal_analyses (user_id, day);
create index meal_analyses_day on public.meal_analyses (day);
alter table public.meal_analyses enable row level security;
grant select, delete on public.meal_analyses to authenticated;
grant all on public.meal_analyses to service_role;

create policy "meals: students read their own analyses" on public.meal_analyses
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "meals: students delete their own analyses" on public.meal_analyses
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------------------------
-- AI usage ledger and settings: Edge Functions only (service role). RLS on, no client grants, no policies.
create table public.ai_usage (
  id                 bigint generated always as identity primary key,
  user_id            uuid,
  fn                 text          not null,
  stage              text          not null check (stage in ('triage', 'deep', 'retry', 'prose')),
  model              text          not null,
  input_tokens       integer       not null default 0,
  output_tokens      integer       not null default 0,
  cache_read_tokens  integer       not null default 0,
  cache_write_tokens integer       not null default 0,
  cost_usd           numeric(10,6) not null,
  latency_ms         integer,
  ok                 boolean       not null default true,
  created_at         timestamptz   not null default now()
);
create index ai_usage_created on public.ai_usage (created_at);
create index ai_usage_user_created on public.ai_usage (user_id, created_at);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
grant all on public.ai_usage to service_role;

create table public.app_settings (
  key   text  primary key,
  value jsonb not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant all on public.app_settings to service_role;
-- USD 20 hard cap for all Claude calls (owner's decision, ADR 0001). Daily per-student analysis limit keeps
-- anonymous sign-ins from draining it.
insert into public.app_settings (key, value) values
  ('ai_budget_usd', '20'::jsonb),
  ('meal_analyses_per_student_per_day', '12'::jsonb);

-- ---------------------------------------------------------------------------------------------
-- Dining-hall menu: public information, edited by staff. Keys: 'weekday', 'weekend' or a YYYY-MM-DD override,
-- the same shape as assets/data/menu.json (which stays as the offline fallback).
create table public.menu_days (
  key        text        primary key check (key in ('weekday', 'weekend') or key ~ '^\d{4}-\d{2}-\d{2}$'),
  meals      jsonb       not null check (jsonb_typeof(meals) = 'object'),
  entered_by text        not null default 'Dining Services',
  updated_by uuid        default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.menu_days enable row level security;
grant select on public.menu_days to anon, authenticated;
grant insert, update, delete on public.menu_days to authenticated;
grant all on public.menu_days to service_role;

create policy "menu: everyone reads the menu" on public.menu_days
  for select to anon, authenticated using (true);
create policy "menu: staff add days" on public.menu_days
  for insert to authenticated with check ((select private.is_staff()));
create policy "menu: staff edit days" on public.menu_days
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "menu: staff remove days" on public.menu_days
  for delete to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------------------------
-- Weekly reports: written by the weekly-report Edge Function with the shared rules; staff read them.
create table public.weekly_reports (
  week_start   date        primary key,
  aggregates   jsonb       not null,
  prose        text        not null,
  prose_source text        not null check (prose_source in ('model', 'template')),
  model        text,
  generated_at timestamptz not null default now()
);
alter table public.weekly_reports enable row level security;
grant select on public.weekly_reports to authenticated;
grant all on public.weekly_reports to service_role;

create policy "weekly reports: staff read" on public.weekly_reports
  for select to authenticated using ((select private.is_staff()));

-- ---------------------------------------------------------------------------------------------
-- Deleting an auth user (the delete-me Edge Function) removes that student's rows; spend stays, unlinked.
create or replace function private.forget_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.checkins where user_id = old.id;
  delete from public.meal_analyses where user_id = old.id;
  update public.ai_usage set user_id = null where user_id = old.id;
  return old;
end;
$$;
revoke all on function private.forget_deleted_user() from public;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function private.forget_deleted_user();
