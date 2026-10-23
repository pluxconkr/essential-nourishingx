-- Known gap closed, 2026-10-24 (docs/security-and-privacy.md): a closed week's staff totals were computed live, so a
-- student deleting a meal estimate, a check-in or the account changed them, and the same week seen before and after
-- gave that student's rows away. Each closed week (overview and meal photos) and each final day of the daily chart is
-- now kept as first computed for staff: later deletions remove the rows but not totals already published. The
-- snapshots hold only what staff were shown (groups of min_group() or more), never a row.

create table private.staff_snapshots (
  kind    text        not null check (kind in ('overview', 'meals', 'day')),
  -- the week's Sunday for overview and meals; the day itself for the daily chart
  day     date        not null,
  result  jsonb       not null,
  made_at timestamptz not null default now(),
  primary key (kind, day)
);
alter table private.staff_snapshots enable row level security;
revoke all on private.staff_snapshots from public, anon, authenticated;

-- The live computations keep their bodies under a new name and are no longer callable by staff directly.
alter function private.staff_overview() rename to staff_overview_live;
alter function private.staff_meals() rename to staff_meals_live;
alter function private.staff_daily(integer) rename to staff_daily_live;
revoke all on function private.staff_overview_live() from public, authenticated;
revoke all on function private.staff_meals_live() from public, authenticated;
revoke all on function private.staff_daily_live(integer) from public, authenticated;

-- The first answer for a closed week is stored and every later answer is that one (on conflict keeps the first).
create or replace function private.staff_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_to date := private.report_week_end();
begin
  perform private.require_staff();
  insert into private.staff_snapshots (kind, day, result) values ('overview', v_to, private.staff_overview_live())
  on conflict do nothing;
  return (select result from private.staff_snapshots where kind = 'overview' and day = v_to);
end;
$$;

create or replace function private.staff_meals()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_to date := private.report_week_end();
begin
  perform private.require_staff();
  insert into private.staff_snapshots (kind, day, result) values ('meals', v_to, private.staff_meals_live())
  on conflict do nothing;
  return (select result from private.staff_snapshots where kind = 'meals' and day = v_to);
end;
$$;

-- Every final day in the window is stored the first time it is shown; the chart is read back from the stored days.
create or replace function private.staff_daily(p_days integer default 30)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_to   date    := private.final_day();
begin
  perform private.require_staff();
  insert into private.staff_snapshots (kind, day, result)
  select 'day', (e ->> 'day')::date, e from jsonb_array_elements(private.staff_daily_live(v_days)) e
  on conflict do nothing;
  return coalesce((select jsonb_agg(result order by day) from private.staff_snapshots
                    where kind = 'day' and day between v_to - (v_days - 1) and v_to), '[]'::jsonb);
end;
$$;

revoke all on function private.staff_overview() from public;
revoke all on function private.staff_meals() from public;
revoke all on function private.staff_daily(integer) from public;
grant execute on function private.staff_overview() to authenticated;
grant execute on function private.staff_meals() to authenticated;
grant execute on function private.staff_daily(integer) to authenticated;

-- PostgREST runs STABLE functions in a read-only transaction, so the wrappers become VOLATILE to let the store happen.
create or replace function public.staff_overview()
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.staff_overview() $$;
create or replace function public.staff_meals()
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.staff_meals() $$;
create or replace function public.staff_daily(p_days integer default 30)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.staff_daily(p_days) $$;

-- Re-seeding the synthetic cohort replaces its rows, so the snapshots that cover its days go too (service role only).
create or replace function private.clear_staff_snapshots(p_from date, p_to date)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from private.staff_snapshots
   where (kind = 'day' and day between p_from and p_to)
      or (kind in ('overview', 'meals') and day between p_from and p_to + 6);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
create or replace function public.clear_staff_snapshots(p_from date, p_to date)
returns integer language sql volatile security invoker set search_path = ''
as $$ select private.clear_staff_snapshots(p_from, p_to) $$;

revoke all on function private.clear_staff_snapshots(date, date) from public;
revoke all on function public.clear_staff_snapshots(date, date) from public, anon, authenticated;
grant execute on function private.clear_staff_snapshots(date, date) to service_role;
grant execute on function public.clear_staff_snapshots(date, date) to service_role;
