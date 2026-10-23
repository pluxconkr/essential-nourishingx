-- Code review of 74999fd, 2026-10-24 (docs/security-and-privacy.md "Published once"). Storing each kind of staff
-- number the first time it was asked for left them taken at different moments: a day as soon as it was final, its
-- week only after the week closed, the weekly report and its "previous week" block later still. A deletion in between
-- could be subtracted out. A closed week is now published once, everything together:
--   freeze_week   stores the week's overview, meal photos and seven days in one transaction and returns the rows its
--                 weekly report is computed from, read in that same transaction;
--   publish_week  stores that report only if the freeze is still the latest one; the report is what publishes.
-- Staff read published weeks only. Nothing about a week is shown before it is published or changes after; the next
-- report's "previous week" is the published report itself, never recomputed.

-- The previous migration's store-on-first-look goes, with the numbers it stored (they were not taken together).
drop function if exists public.clear_staff_snapshots(date, date);
drop function if exists private.clear_staff_snapshots(date, date);
drop function if exists private.staff_overview_live();
drop function if exists private.staff_meals_live();
drop function if exists private.staff_daily_live(integer);
delete from private.staff_snapshots;

-- ---------------------------------------------------------------------------------------------
-- One closed week's numbers, computed from the rows as they are now. Called only inside freeze_week.
create or replace function private.week_overview(p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from   date := p_to - 6;
  v_result jsonb;
begin
  -- A day counts only if it has min_group() students of its own; a quiet day is left out, never subtracted.
  with shown as (
    select day from public.checkins
     where day between v_from and p_to
     group by day having count(distinct user_id) >= private.min_group()
  ), r as (
    select c.* from public.checkins c join shown s on s.day = c.day
  )
  select case when count(distinct r.user_id) < private.min_group()
           then jsonb_build_object('from', v_from, 'to', p_to, 'days', 7, 'students', null, 'suppressed', true)
           else jsonb_build_object(
             'from', v_from, 'to', p_to, 'days', 7,
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

-- Every number covers the photos of meal slots with min_group() students (20261023185644_staff_meals_shared_rows).
create or replace function private.week_meals(p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from     date := p_to - 6;
  v_slots    text[];
  v_students integer;
  v_total    integer;
begin
  select coalesce(array_agg(meal), '{}') into v_slots
    from (select meal from public.meal_analyses where day between v_from and p_to
           group by meal having count(distinct user_id) >= private.min_group()) s;
  select count(distinct user_id), count(*) into v_students, v_total
    from public.meal_analyses where day between v_from and p_to and meal = any (v_slots);
  if v_students < private.min_group() then
    return jsonb_build_object('from', v_from, 'to', p_to, 'days', 7, 'students', null, 'suppressed', true);
  end if;
  return jsonb_build_object(
    'from', v_from, 'to', p_to, 'days', 7,
    'students', v_students,
    'suppressed', false,
    'analyses', v_total,
    'synthetic_share', (select round(avg((cohort = 'synthetic')::int), 3) from public.meal_analyses
                         where day between v_from and p_to and meal = any (v_slots)),
    'low_confidence_share', (select round(avg((confidence = 'low')::int), 3) from public.meal_analyses
                              where day between v_from and p_to and meal = any (v_slots)),
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
           where day between v_from and p_to
           group by meal
        ) t), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group', g.grp, 'share', round(g.n::numeric / v_total, 3)) order by g.n desc)
        from (
          select x.grp, count(*) as n, count(distinct x.user_id) as s
            from (select unnest(groups) as grp, user_id from public.meal_analyses
                   where day between v_from and p_to and meal = any (v_slots)) x
           group by x.grp
        ) g
       where g.s >= private.min_group()), '[]'::jsonb),
    'tiers', (
      select case when bool_and(t.s >= private.min_group()) then jsonb_object_agg(t.tier, t.n) end
        from (select tier, count(*) as n, count(distinct user_id) as s from public.meal_analyses
               where day between v_from and p_to and meal = any (v_slots) group by tier) t),
    'difficulty', (
      select case when bool_and(t.s >= private.min_group()) then jsonb_object_agg(t.difficulty, t.n) end
        from (select difficulty, count(*) as n, count(distinct user_id) as s from public.meal_analyses
               where day between v_from and p_to and meal = any (v_slots) group by difficulty) t));
end;
$$;

-- A day under min_group() students keeps neither its averages nor its exact count.
create or replace function private.day_rows(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]'::jsonb)
    from (
      select g.day::date as day,
             count(distinct c.user_id) < private.min_group() as suppressed,
             case when count(distinct c.user_id) >= private.min_group() then count(distinct c.user_id) end as students,
             case when count(distinct c.user_id) >= private.min_group() then round(avg(c.energy), 2) end as avg_energy,
             case when count(distinct c.user_id) >= private.min_group() then round(avg(c.fullness), 2) end as avg_fullness,
             case when count(distinct c.user_id) >= private.min_group() then round(avg(c.focus), 2) end as avg_focus,
             case when count(distinct c.user_id) >= private.min_group() then round(avg((c.skipped <> 'none')::int), 3) end as skipped_share,
             case when count(distinct c.user_id) >= private.min_group() then round(avg((c.training = 'heavy')::int), 3) end as heavy_share
        from generate_series(p_from, p_to, interval '1 day') as g(day)
        left join public.checkins c on c.day = g.day::date
       group by g.day
    ) d
$$;

revoke all on function private.week_overview(date) from public;
revoke all on function private.week_meals(date) from public;
revoke all on function private.day_rows(date, date) from public;

-- ---------------------------------------------------------------------------------------------
-- Freeze and publish (the weekly-report Edge Function, service role only).
create or replace function private.freeze_week(p_week_end date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if extract(isodow from p_week_end) <> 7 or p_week_end > private.report_week_end() then
    raise exception 'week_not_closed';
  end if;
  perform pg_advisory_xact_lock(hashtext('nourishingx.week'), p_week_end - date '2000-01-02');
  -- Published already: its numbers never change.
  if exists (select 1 from public.weekly_reports where week_start = p_week_end - 6) then
    return null;
  end if;
  -- Never shown yet (no report), so replacing an earlier unfinished freeze reveals nothing.
  delete from private.staff_snapshots
   where (kind in ('overview', 'meals') and day = p_week_end) or (kind = 'day' and day between p_week_end - 6 and p_week_end);
  insert into private.staff_snapshots (kind, day, result) values
    ('overview', p_week_end, private.week_overview(p_week_end)),
    ('meals', p_week_end, private.week_meals(p_week_end));
  insert into private.staff_snapshots (kind, day, result)
  select 'day', (e ->> 'day')::date, e from jsonb_array_elements(private.day_rows(p_week_end - 6, p_week_end)) e;
  -- The rows the report is computed from, read in this same transaction (36 days of history its words look back on).
  return jsonb_build_object(
    'made_at', now(),
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'day', c.day, 'fullness', c.fullness, 'energy', c.energy,
                                          'focus', c.focus, 'training', c.training, 'skipped', c.skipped, 'cohort', c.cohort)
                       order by c.user_id, c.day)
        from public.checkins c where c.day between p_week_end - 43 and p_week_end), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'day', m.day, 'meal', m.meal,
                                          'protein_g', m.protein_g, 'carbs_g', m.carbs_g))
        from public.meal_analyses m where m.day between p_week_end - 43 and p_week_end), '[]'::jsonb));
end;
$$;

create or replace function private.publish_week(p_week_end date, p_made_at timestamptz, p_report jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.weekly_reports;
begin
  perform pg_advisory_xact_lock(hashtext('nourishingx.week'), p_week_end - date '2000-01-02');
  -- A later freeze of the same week replaced these numbers; that call publishes its own report.
  if (select made_at from private.staff_snapshots where kind = 'overview' and day = p_week_end) is distinct from p_made_at then
    return null;
  end if;
  insert into public.weekly_reports (week_start, aggregates, prose, prose_source, model)
  values (p_week_end - 6, p_report -> 'aggregates', p_report ->> 'prose', p_report ->> 'prose_source', p_report ->> 'model')
  on conflict (week_start) do nothing
  returning * into v_row;
  if not found then
    return null;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.freeze_week(p_week_end date)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.freeze_week(p_week_end) $$;
create or replace function public.publish_week(p_week_end date, p_made_at timestamptz, p_report jsonb)
returns jsonb language sql volatile security invoker set search_path = ''
as $$ select private.publish_week(p_week_end, p_made_at, p_report) $$;

revoke all on function private.freeze_week(date) from public;
revoke all on function private.publish_week(date, timestamptz, jsonb) from public;
revoke all on function public.freeze_week(date) from public, anon, authenticated;
revoke all on function public.publish_week(date, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function private.freeze_week(date) to service_role;
grant execute on function private.publish_week(date, timestamptz, jsonb) to service_role;
grant execute on function public.freeze_week(date) to service_role;
grant execute on function public.publish_week(date, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------
-- Staff read published weeks only: frozen and with their report.
create or replace function private.published_week_end()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select max(s.day) from private.staff_snapshots s
   where s.kind = 'overview' and s.day <= private.report_week_end()
     and exists (select 1 from public.weekly_reports r where r.week_start = s.day - 6)
$$;

-- Before any week is published: the latest closed week, marked pending, with no numbers at all.
create or replace function private.pending_week()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('from', private.report_week_end() - 6, 'to', private.report_week_end(), 'days', 7,
                            'students', null, 'suppressed', true, 'pending', true)
$$;

revoke all on function private.published_week_end() from public;
revoke all on function private.pending_week() from public;

create or replace function private.staff_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return coalesce((select result from private.staff_snapshots where kind = 'overview' and day = private.published_week_end()),
                  private.pending_week());
end;
$$;

create or replace function private.staff_meals()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_staff();
  return coalesce((select result from private.staff_snapshots where kind = 'meals' and day = private.published_week_end()),
                  private.pending_week());
end;
$$;

-- The window ends on the latest published Sunday; a day of a week not published shows as not reported.
create or replace function private.staff_daily(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 90));
  v_to   date    := coalesce(private.published_week_end(), private.report_week_end());
begin
  perform private.require_staff();
  return (
    select jsonb_agg(coalesce(s.result, jsonb_build_object(
             'day', g.day::date, 'suppressed', true, 'students', null, 'avg_energy', null, 'avg_fullness', null,
             'avg_focus', null, 'skipped_share', null, 'heavy_share', null)) order by g.day)
      from generate_series(v_to - (v_days - 1), v_to, interval '1 day') as g(day)
      left join private.staff_snapshots s
        on s.kind = 'day' and s.day = g.day::date
       and exists (select 1 from public.weekly_reports r
                    where r.week_start = g.day::date + 1 - extract(isodow from g.day)::integer));
end;
$$;

-- Read-only again, so the wrappers go back to STABLE.
create or replace function public.staff_overview()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_overview() $$;
create or replace function public.staff_meals()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_meals() $$;
create or replace function public.staff_daily(p_days integer default 30)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.staff_daily(p_days) $$;
