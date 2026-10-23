-- Code review of eae460f, 2026-10-24, reproduced in a local PostgreSQL 17 with every migration applied: the SHARE lock
-- taken by 20261023194359 can close a three-way deadlock, so "an account deletion simply waits" was wrong there.
-- An account deletion (private.forget_deleted_user) deletes check-ins, then meal estimates. A meal estimate being stored
-- for the same student holds its lock on meal_analyses while private.require_live_user waits for that deletion. A freeze
-- that already holds checkins then waits for meal_analyses, and the deletion waits for the freeze. After
-- deadlock_timeout (1 s, the hosted value too) Postgres fails one of the three, and that can be the deletion. Also,
-- while the freeze waits for its lock, every later upload and deletion queues behind it.
-- The freeze now never waits for the table lock. It asks with NOWAIT; if anyone is writing (or VACUUM or ANALYZE holds
-- a table), it lets go of both tables and asks again 50 ms later, for about a second. Between tries it keeps only its
-- own week's advisory lock and the ACCESS SHARE lock its published-already check took on weekly_reports; no upload or
-- deletion takes either. Another freeze or publish of the same week waits on the advisory lock: up to that second,
-- plus the freeze's reads if it then gets the tables. Holding no lock on checkins or meal_analyses while it waits, it
-- can never be part of a deadlock, does not depend on the order other transactions lock those tables in, and no upload
-- or deletion queues behind it. A writer waits only while the freeze holds the lock and reads: 74 ms for 60 students
-- and 675 ms for 600, measured locally, not "a few milliseconds". If the tables stay busy for that second, the freeze
-- gives up (SQLSTATE 55P03): weekly-report answers 503 and staff press Regenerate again. (A lock_timeout instead would
-- still let the meal estimate die in the deadlock, and it times each of the two tables separately.)
-- Also:
-- - The published-already check runs before the table lock. It needs only the advisory lock, which publish_week takes
--   too, so a call for a published week no longer blocks any upload or deletion.
-- - The rows returned cover the 36 days the report reads (src/domain/cohort.ts: 30 days of hysteresis, each looking
--   6 days back), not 44. Seven of the extra 8 days were for recomputing the previous week, which 20261023192805
--   removed; the eighth was never read.
-- - Meal estimates come back in id order again, as before 20261023192805, so the photos of one meal always add up in
--   the same order.
-- - private.weeks_showing_real tells the synthetic seed which of its weeks showed staff a number of their own built
--   from real students, so that it never replaces one. A suppressed report alone cannot tell: the week's meal-photo
--   page can still show numbers.
create or replace function private.freeze_week(p_week_end date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tries int := 0;
begin
  if extract(isodow from p_week_end) <> 7 or p_week_end > private.report_week_end() then
    raise exception 'week_not_closed';
  end if;
  perform pg_advisory_xact_lock(hashtext('nourishingx.week'), p_week_end - date '2000-01-02');
  -- Published already: the freeze never changes it.
  if exists (select 1 from public.weekly_reports where week_start = p_week_end - 6) then
    return null;
  end if;
  loop
    begin
      lock table public.checkins, public.meal_analyses in share mode nowait;
      exit;
    exception when lock_not_available then
      -- The failed attempt let go of both tables. Try again in 50 ms, 20 times in all.
      v_tries := v_tries + 1;
      if v_tries = 20 then
        raise;
      end if;
      perform pg_sleep(0.05);
    end;
  end loop;
  -- No report, so staff see nothing of this week and replacing an earlier freeze reveals nothing (the seed unpublishes
  -- only weeks that showed no number of their own built from real students).
  delete from private.staff_snapshots
   where (kind in ('overview', 'meals') and day = p_week_end) or (kind = 'day' and day between p_week_end - 6 and p_week_end);
  insert into private.staff_snapshots (kind, day, result) values
    ('overview', p_week_end, private.week_overview(p_week_end)),
    ('meals', p_week_end, private.week_meals(p_week_end));
  insert into private.staff_snapshots (kind, day, result)
  select 'day', (e ->> 'day')::date, e from jsonb_array_elements(private.day_rows(p_week_end - 6, p_week_end)) e;
  -- The rows the report is computed from, read under the same lock: the 36 days its words look back on.
  return jsonb_build_object(
    'made_at', now(),
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', c.user_id, 'day', c.day, 'fullness', c.fullness, 'energy', c.energy,
                                          'focus', c.focus, 'training', c.training, 'skipped', c.skipped, 'cohort', c.cohort)
                       order by c.user_id, c.day)
        from public.checkins c where c.day between p_week_end - 35 and p_week_end), '[]'::jsonb),
    'meals', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'day', m.day, 'meal', m.meal,
                                          'protein_g', m.protein_g, 'carbs_g', m.carbs_g)
                       order by m.id)
        from public.meal_analyses m where m.day between p_week_end - 35 and p_week_end), '[]'::jsonb));
end;
$$;

-- The weeks among p_week_ends (Sundays) that are published and showed staff a number of their own built from real
-- students: in their report, their overview or their meal-photo page (the days are shown only with the overview). A
-- report's "last week" figures are not its own: they are copied from the previous week's published report, which never
-- changes. A missing share counts as real.
create or replace function private.weeks_showing_real(p_week_ends date[])
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.week_start + 6 order by r.week_start), '{}')
    from public.weekly_reports r
   where r.week_start + 6 = any (p_week_ends)
     and ((not coalesce((r.aggregates ->> 'suppressed')::boolean, false)
           and coalesce((r.aggregates ->> 'syntheticShare')::numeric, 0) < 1)
          or exists (select 1 from private.staff_snapshots s
                      where s.kind in ('overview', 'meals') and s.day = r.week_start + 6
                        and not coalesce((s.result ->> 'suppressed')::boolean, false)
                        and coalesce((s.result ->> 'synthetic_share')::numeric, 0) < 1))
$$;
create or replace function public.weeks_showing_real(p_week_ends date[])
returns date[] language sql stable security invoker set search_path = ''
as $$ select private.weeks_showing_real(p_week_ends) $$;

revoke all on function private.weeks_showing_real(date[]) from public;
revoke all on function public.weeks_showing_real(date[]) from public, anon, authenticated;
grant execute on function private.weeks_showing_real(date[]) to service_role;
grant execute on function public.weeks_showing_real(date[]) to service_role;
