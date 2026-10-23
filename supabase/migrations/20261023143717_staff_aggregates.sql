-- Staff aggregates. Staff never read student rows: they call these functions instead.
-- The private.* functions are SECURITY DEFINER because an aggregate must read every student's rows past RLS;
-- each one first checks the staff claim, then drops every group with fewer than 10 students
-- (plan §9 "n >= 10 suppression"; ADR 0001). They live in the unexposed `private` schema and are reached
-- only through SECURITY INVOKER wrappers in `public`, which is what PostgREST exposes.

create or replace function private.min_group()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

-- The school is in New Hampshire (US Eastern time) and every `day` column is the student's local date.
create or replace function private.school_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/New_York')::date $$;

create or replace function private.require_staff()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
create or replace function private.staff_overview(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days     integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_to       date    := private.school_today();
  v_from     date    := v_to - (v_days - 1);
  v_students integer;
  v_result   jsonb;
begin
  perform private.require_staff();
  select count(distinct user_id) into v_students from public.checkins where day between v_from and v_to;
  if v_students < private.min_group() then
    return jsonb_build_object('from', v_from, 'to', v_to, 'days', v_days, 'students', v_students, 'suppressed', true);
  end if;
  select jsonb_build_object(
           'from', v_from, 'to', v_to, 'days', v_days,
           'students', v_students,
           'suppressed', false,
           'checkins', count(*),
           'checkins_per_student', round(count(*)::numeric / v_students, 1),
           'avg_fullness', round(avg(fullness), 2),
           'avg_energy', round(avg(energy), 2),
           'avg_focus', round(avg(focus), 2),
           'skipped_share', round(avg((skipped <> 'none')::int), 3),
           'heavy_share', round(avg((training = 'heavy')::int), 3),
           'synthetic_share', round(avg((cohort = 'synthetic')::int), 3))
    into v_result
    from public.checkins
   where day between v_from and v_to;
  return v_result;
end;
$$;

-- One entry per calendar day; a day with fewer than 10 students keeps only its student count.
create or replace function private.staff_daily(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_to   date    := private.school_today();
  v_from date    := v_to - (v_days - 1);
begin
  perform private.require_staff();
  return coalesce((
    select jsonb_agg(to_jsonb(d) order by d.day)
      from (
        select g.day::date as day,
               count(distinct c.user_id) as students,
               count(distinct c.user_id) < private.min_group() as suppressed,
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

-- Meal analyses: per meal slot, food groups and router tiers. Every slot and every food group must come
-- from at least 10 different students to be shown.
create or replace function private.staff_meals(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days     integer := greatest(1, least(coalesce(p_days, 7), 90));
  v_to       date    := private.school_today();
  v_from     date    := v_to - (v_days - 1);
  v_students integer;
  v_total    integer;
begin
  perform private.require_staff();
  select count(distinct user_id), count(*) into v_students, v_total
    from public.meal_analyses where day between v_from and v_to;
  if v_students < private.min_group() then
    return jsonb_build_object('from', v_from, 'to', v_to, 'days', v_days, 'students', v_students, 'suppressed', true);
  end if;
  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'days', v_days,
    'students', v_students,
    'suppressed', false,
    'analyses', v_total,
    'synthetic_share', (select round(avg((cohort = 'synthetic')::int), 3) from public.meal_analyses where day between v_from and v_to),
    'low_confidence_share', (select round(avg((confidence = 'low')::int), 3) from public.meal_analyses where day between v_from and v_to),
    'by_meal', coalesce((
      select jsonb_agg(jsonb_build_object(
               'meal', t.meal, 'analyses', t.n, 'students', t.s, 'suppressed', t.s < private.min_group(),
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
        from (select tier, count(*) as n from public.meal_analyses where day between v_from and v_to group by tier) t), '{}'::jsonb),
    'difficulty', coalesce((
      select jsonb_object_agg(difficulty, n)
        from (select difficulty, count(*) as n from public.meal_analyses where day between v_from and v_to group by difficulty) t), '{}'::jsonb));
end;
$$;

-- AI spend: model, stage, calls and cost. Holds no student information.
create or replace function private.staff_ai_spend()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return jsonb_build_object(
    'cap_usd', (select (value #>> '{}')::numeric from public.app_settings where key = 'ai_budget_usd'),
    'spent_usd', (select coalesce(round(sum(cost_usd), 4), 0) from public.ai_usage),
    'calls', (select count(*) from public.ai_usage),
    'by_model', coalesce((
      select jsonb_agg(jsonb_build_object('model', model, 'stage', stage, 'calls', n, 'cost_usd', c, 'avg_latency_ms', l) order by c desc)
        from (select model, stage, count(*) as n, round(sum(cost_usd), 4) as c, round(avg(latency_ms)) as l
                from public.ai_usage group by model, stage) t), '[]'::jsonb));
end;
$$;

-- Budget guard for Edge Functions (service role only).
create or replace function public.ai_budget_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'cap_usd', (select (value #>> '{}')::numeric from public.app_settings where key = 'ai_budget_usd'),
    'spent_usd', (select coalesce(sum(cost_usd), 0) from public.ai_usage),
    'per_student_per_day', (select (value #>> '{}')::integer from public.app_settings where key = 'meal_analyses_per_student_per_day'));
$$;

-- ---------------------------------------------------------------------------------------------
-- Public API: thin invoker wrappers (PostgREST only exposes `public`).
create or replace function public.staff_overview(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_overview(p_days) $$;

create or replace function public.staff_daily(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_daily(p_days) $$;

create or replace function public.staff_meals(p_days integer default 7)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_meals(p_days) $$;

create or replace function public.staff_ai_spend()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_ai_spend() $$;

-- Postgres grants EXECUTE to PUBLIC on every new function; take it back everywhere and grant only what is used.
revoke all on function private.min_group() from public;
revoke all on function private.school_today() from public;
revoke all on function private.require_staff() from public;
revoke all on function private.staff_overview(integer) from public;
revoke all on function private.staff_daily(integer) from public;
revoke all on function private.staff_meals(integer) from public;
revoke all on function private.staff_ai_spend() from public;
revoke all on function public.ai_budget_status() from public, anon, authenticated;
revoke all on function public.staff_overview(integer) from public, anon;
revoke all on function public.staff_daily(integer) from public, anon;
revoke all on function public.staff_meals(integer) from public, anon;
revoke all on function public.staff_ai_spend() from public, anon;

grant execute on function private.staff_overview(integer) to authenticated;
grant execute on function private.staff_daily(integer) to authenticated;
grant execute on function private.staff_meals(integer) to authenticated;
grant execute on function private.staff_ai_spend() to authenticated;
grant execute on function public.staff_overview(integer) to authenticated;
grant execute on function public.staff_daily(integer) to authenticated;
grant execute on function public.staff_meals(integer) to authenticated;
grant execute on function public.staff_ai_spend() to authenticated;
grant execute on function public.ai_budget_status() to service_role;
