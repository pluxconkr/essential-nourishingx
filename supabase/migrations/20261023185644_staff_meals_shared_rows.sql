-- Code review of the closed-weeks change, 2026-10-24 (docs/security-and-privacy.md).
-- 1. staff_meals published a total over every photo next to per-slot, per-model and per-difficulty counts that hid
--    the small groups, so total minus the shown groups gave a hidden group's exact count back. Every number now
--    covers the same photos: those of meal slots with min_group() students of their own. The model and difficulty
--    tables, a second and third way to split those photos, appear only when none of their groups is small.
-- 2. reserve_ai let every call through when the budget setting was missing (a NULL cap compares as unknown).
--    A missing cap now means no budget.
-- 3. require_live_user checked the account and let the insert go on without holding the account row, so an
--    account deleted at the same moment could miss the new row. The check now takes a key-share lock on the
--    account: the delete waits until the insert commits, and its cascade then removes the row.

-- ---------------------------------------------------------------------------------------------
-- 1. Meal photos: one set of photos behind every number.
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
  v_slots    text[];
  v_students integer;
  v_total    integer;
begin
  perform private.require_staff();
  select coalesce(array_agg(meal), '{}') into v_slots
    from (select meal from public.meal_analyses where day between v_from and v_to
           group by meal having count(distinct user_id) >= private.min_group()) s;
  select count(distinct user_id), count(*) into v_students, v_total
    from public.meal_analyses where day between v_from and v_to and meal = any (v_slots);
  if v_students < private.min_group() then
    return jsonb_build_object('from', v_from, 'to', v_to, 'days', 7, 'students', null, 'suppressed', true);
  end if;
  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'days', 7,
    'students', v_students,
    'suppressed', false,
    'analyses', v_total,
    'synthetic_share', (select round(avg((cohort = 'synthetic')::int), 3) from public.meal_analyses
                         where day between v_from and v_to and meal = any (v_slots)),
    'low_confidence_share', (select round(avg((confidence = 'low')::int), 3) from public.meal_analyses
                              where day between v_from and v_to and meal = any (v_slots)),
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
    -- A photo can show several food groups, so the shares do not add up to anything that could be subtracted.
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('group', g.grp, 'share', round(g.n::numeric / v_total, 3)) order by g.n desc)
        from (
          select x.grp, count(*) as n, count(distinct x.user_id) as s
            from (select unnest(groups) as grp, user_id from public.meal_analyses
                   where day between v_from and v_to and meal = any (v_slots)) x
           group by x.grp
        ) g
       where g.s >= private.min_group()), '[]'::jsonb),
    -- null: at least one model (or difficulty) has fewer than min_group() students, so the whole table is withheld.
    'tiers', (
      select case when bool_and(t.s >= private.min_group()) then jsonb_object_agg(t.tier, t.n) end
        from (select tier, count(*) as n, count(distinct user_id) as s from public.meal_analyses
               where day between v_from and v_to and meal = any (v_slots) group by tier) t),
    'difficulty', (
      select case when bool_and(t.s >= private.min_group()) then jsonb_object_agg(t.difficulty, t.n) end
        from (select difficulty, count(*) as n, count(distinct user_id) as s from public.meal_analyses
               where day between v_from and v_to and meal = any (v_slots) group by difficulty) t));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. AI budget: a missing cap refuses instead of allowing everything.
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
     > coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'ai_budget_usd'), 0) then
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

-- ---------------------------------------------------------------------------------------------
-- 3. Real rows need a live account, held until the row commits.
create or replace function private.require_live_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cohort = 'real' then
    perform 1 from auth.users u where u.id = new.user_id for key share;
    if not found then
      raise exception 'account deleted' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
