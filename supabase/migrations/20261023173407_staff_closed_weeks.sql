-- Security review, 2026-10-24 (docs/security-and-privacy.md).
-- 1. Staff totals were live and overlapping (any window length, ending today), and hidden days still reported their
--    exact student count, so two totals could be subtracted to recover one check-in. Staff now see only closed,
--    calendar-aligned weeks (Monday to Sunday) whose data is final, built only from days that themselves have at
--    least 10 students, and never an exact count under 10.
-- 2. Check-ins could be written for any date, which let throwaway accounts pad or poison past days. Students may now
--    write only the last upload_days() days (school time), so a day is final three days after it ends.
-- 3. A sync or analysis still in flight when a student deleted their account was stored anyway. Real rows now need
--    a live account.
-- 4. Concurrent meal photos all passed the budget check before any cost was written. Each Claude call now reserves
--    its worst-case cost first, under a lock, and is settled to the real cost afterwards.

-- ---------------------------------------------------------------------------------------------
-- 2. The upload window and when a day is final.
create or replace function private.upload_days()
returns integer
language sql
immutable
set search_path = ''
as $$ select 2 $$;

-- No student can write a day on or before final_day(), so its rows change only if a student deletes their account.
create or replace function private.final_day()
returns date
language sql
stable
set search_path = ''
as $$ select private.school_today() - private.upload_days() - 1 $$;

-- The week staff see: the latest Monday-to-Sunday week whose Sunday is final.
create or replace function private.report_week_end()
returns date
language sql
stable
set search_path = ''
as $$ select (date_trunc('week', private.final_day() + 1))::date - 1 $$;

revoke all on function private.upload_days() from public;
revoke all on function private.final_day() from public;
revoke all on function private.report_week_end() from public;
-- The check-in policies call these as the student.
grant execute on function private.school_today() to authenticated;
grant execute on function private.upload_days() to authenticated;

alter policy "checkins: students add their own rows" on public.checkins
  with check (
    (select auth.uid()) = user_id and cohort = 'real'
    and day between (select private.school_today()) - (select private.upload_days()) and (select private.school_today()) + 1
  );
alter policy "checkins: students change their own rows" on public.checkins
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and cohort = 'real'
    and day between (select private.school_today()) - (select private.upload_days()) and (select private.school_today()) + 1
  );

-- ---------------------------------------------------------------------------------------------
-- 1. Staff totals: closed weeks, shown days only, no exact count under min_group().
drop function if exists public.staff_overview(integer);
drop function if exists private.staff_overview(integer);
drop function if exists public.staff_meals(integer);
drop function if exists private.staff_meals(integer);

create or replace function private.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to     date := private.report_week_end();
  v_from   date := v_to - 6;
  v_result jsonb;
begin
  perform private.require_staff();
  -- A day counts only if it has min_group() students of its own; a quiet day is left out, never subtracted.
  with shown as (
    select day from public.checkins
     where day between v_from and v_to
     group by day having count(distinct user_id) >= private.min_group()
  ), r as (
    select c.* from public.checkins c join shown s on s.day = c.day
  )
  select case when count(distinct r.user_id) < private.min_group()
           then jsonb_build_object('from', v_from, 'to', v_to, 'days', 7, 'students', null, 'suppressed', true)
           else jsonb_build_object(
             'from', v_from, 'to', v_to, 'days', 7,
             'days_shown', count(distinct r.day),
             'students', count(distinct r.user_id),
             'suppressed', false,
             'checkins', count(*),
             'checkins_per_student', round(count(*)::numeric / count(distinct r.user_id), 1),
             'avg_fullness', round(avg(r.fullness), 2),
             'avg_energy', round(avg(r.energy), 2),
             'avg_focus', round(avg(r.focus), 2),
             'skipped_share', round(avg((r.skipped <> 'none')::int), 3),
             'heavy_share', round(avg((r.training = 'heavy')::int), 3),
             'synthetic_share', round(avg((r.cohort = 'synthetic')::int), 3))
         end
    into v_result
    from r;
  return v_result;
end;
$$;

-- Final days only. A day under min_group() students keeps neither its averages nor its exact count.
create or replace function private.staff_daily(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_to   date    := private.final_day();
  v_from date    := v_to - (v_days - 1);
begin
  perform private.require_staff();
  return coalesce((
    select jsonb_agg(to_jsonb(d) order by d.day)
      from (
        select g.day::date as day,
               count(distinct c.user_id) < private.min_group() as suppressed,
               case when count(distinct c.user_id) >= private.min_group() then count(distinct c.user_id) end as students,
               case when count(distinct c.user_id) >= private.min_group() then round(avg(c.energy), 2) end as avg_energy,
               case when count(distinct c.user_id) >= private.min_group() then round(avg(c.fullness), 2) end as avg_fullness,
               case when count(distinct c.user_id) >= private.min_group() then round(avg(c.focus), 2) end as avg_focus,
               case when count(distinct c.user_id) >= private.min_group() then round(avg((c.skipped <> 'none')::int), 3) end as skipped_share,
               case when count(distinct c.user_id) >= private.min_group() then round(avg((c.training = 'heavy')::int), 3) end as heavy_share
          from generate_series(v_from, v_to, interval '1 day') as g(day)
          left join public.checkins c on c.day = g.day::date
         group by g.day
      ) d), '[]'::jsonb);
end;
$$;

-- Meal photos for the closed week: every slot, food group, model and difficulty needs min_group() students.
create or replace function private.staff_meals()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to       date := private.report_week_end();
  v_from     date := v_to - 6;
  v_students integer;
  v_total    integer;
begin
  perform private.require_staff();
  select count(distinct user_id), count(*) into v_students, v_total
    from public.meal_analyses where day between v_from and v_to;
  if v_students < private.min_group() then
    return jsonb_build_object('from', v_from, 'to', v_to, 'days', 7, 'students', null, 'suppressed', true);
  end if;
  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'days', 7,
    'students', v_students,
    'suppressed', false,
    'analyses', v_total,
    'synthetic_share', (select round(avg((cohort = 'synthetic')::int), 3) from public.meal_analyses where day between v_from and v_to),
    'low_confidence_share', (select round(avg((confidence = 'low')::int), 3) from public.meal_analyses where day between v_from and v_to),
    'by_meal', coalesce((
      select jsonb_agg(jsonb_build_object(
               'meal', t.meal,
               'analyses', case when t.s >= private.min_group() then t.n end,
               'students', case when t.s >= private.min_group() then t.s end,
               'suppressed', t.s < private.min_group(),
               'avg_kcal', case when t.s >= private.min_group() then t.kcal end,
               'avg_protein_g', case when t.s >= private.min_group() then t.protein end,
               'avg_carbs_g', case when t.s >= private.min_group() then t.carbs end,
               'avg_fat_g', case when t.s >= private.min_group() then t.fat end,
               'avg_fiber_g', case when t.s >= private.min_group() then t.fiber end)
             order by t.ord)
        from (
          select meal, count(*) as n, count(distinct user_id) as s,
                 round(avg(kcal)) as kcal, round(avg(protein_g), 1) as protein, round(avg(carbs_g), 1) as carbs,
                 round(avg(fat_g), 1) as fat, round(avg(fiber_g), 1) as fiber,
                 case meal when 'breakfast' then 1 when 'lunch' then 2 when 'dinner' then 3 else 4 end as ord
            from public.meal_analyses
           where day between v_from and v_to
           group by meal
        ) t), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group', g.grp, 'share', round(g.n::numeric / v_total, 3)) order by g.n desc)
        from (
          select x.grp, count(*) as n, count(distinct x.user_id) as s
            from (select unnest(groups) as grp, user_id from public.meal_analyses where day between v_from and v_to) x
           group by x.grp
        ) g
       where g.s >= private.min_group()), '[]'::jsonb),
    'tiers', coalesce((
      select jsonb_object_agg(tier, n)
        from (select tier, count(*) as n from public.meal_analyses where day between v_from and v_to
               group by tier having count(distinct user_id) >= private.min_group()) t), '{}'::jsonb),
    'difficulty', coalesce((
      select jsonb_object_agg(difficulty, n)
        from (select difficulty, count(*) as n from public.meal_analyses where day between v_from and v_to
               group by difficulty having count(distinct user_id) >= private.min_group()) t), '{}'::jsonb));
end;
$$;

-- The closed week, for the weekly-report function.
create or replace function private.report_week()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select jsonb_build_object('from', private.report_week_end() - 6, 'to', private.report_week_end()) $$;

create or replace function public.staff_overview()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_overview() $$;

create or replace function public.staff_meals()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_meals() $$;

create or replace function public.report_week()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.report_week() $$;

revoke all on function private.staff_overview() from public;
revoke all on function private.staff_meals() from public;
revoke all on function private.report_week() from public;
revoke all on function public.staff_overview() from public, anon;
revoke all on function public.staff_meals() from public, anon;
revoke all on function public.report_week() from public, anon, authenticated;
grant execute on function private.staff_overview() to authenticated;
grant execute on function private.staff_meals() to authenticated;
grant execute on function public.staff_overview() to authenticated;
grant execute on function public.staff_meals() to authenticated;
grant execute on function private.report_week() to service_role;
grant execute on function public.report_week() to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Real rows need a live account (an upload in flight during "Delete everything" is refused).
create or replace function private.require_live_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cohort = 'real' and not exists (select 1 from auth.users u where u.id = new.user_id) then
    raise exception 'account deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.require_live_user() from public;

create trigger checkins_require_live_user
  before insert or update on public.checkins
  for each row execute function private.require_live_user();
create trigger meal_analyses_require_live_user
  before insert on public.meal_analyses
  for each row execute function private.require_live_user();

-- ---------------------------------------------------------------------------------------------
-- 4. AI budget: reserve the worst case under a lock before each call; the caller settles the row afterwards.
create or replace function private.reserve_ai(
  p_user uuid, p_fn text, p_stage text, p_model text, p_worst_usd numeric, p_daily_limit integer
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('nourishingx.ai_budget'));
  if (select coalesce(sum(cost_usd), 0) from public.ai_usage) + p_worst_usd
     > (select (value #>> '{}')::numeric from public.app_settings where key = 'ai_budget_usd') then
    raise exception 'budget_reached';
  end if;
  if p_daily_limit is not null and p_user is not null and (
       select count(*) from public.ai_usage
        where user_id = p_user and stage = 'triage' and created_at > now() - interval '24 hours'
     ) >= p_daily_limit then
    raise exception 'daily_limit';
  end if;
  insert into public.ai_usage (user_id, fn, stage, model, cost_usd, ok)
  values (p_user, p_fn, p_stage, p_model, p_worst_usd, false)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.reserve_ai(
  p_user uuid, p_fn text, p_stage text, p_model text, p_worst_usd numeric, p_daily_limit integer
)
returns bigint language sql volatile security invoker set search_path = ''
as $$ select private.reserve_ai(p_user, p_fn, p_stage, p_model, p_worst_usd, p_daily_limit) $$;

revoke all on function private.reserve_ai(uuid, text, text, text, numeric, integer) from public;
revoke all on function public.reserve_ai(uuid, text, text, text, numeric, integer) from public, anon, authenticated;
grant execute on function private.reserve_ai(uuid, text, text, text, numeric, integer) to service_role;
grant execute on function public.reserve_ai(uuid, text, text, text, numeric, integer) to service_role;
