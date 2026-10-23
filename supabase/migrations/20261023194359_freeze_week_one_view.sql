-- Code review of c44b833, 2026-10-24: freeze_week reads the week in several statements, and under READ COMMITTED each
-- statement sees the data as of its own start, so a deletion committing between two of them could still split one
-- publication into two moments. The freeze now holds a SHARE lock on both tables: nobody can write to them for the
-- freeze's few milliseconds (a check-in upload or an account deletion simply waits), so every statement reads the same
-- data. Two freezes can hold SHARE together.
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
  lock table public.checkins, public.meal_analyses in share mode;
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
  -- The rows the report is computed from, read under the same lock (36 days of history its words look back on).
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
