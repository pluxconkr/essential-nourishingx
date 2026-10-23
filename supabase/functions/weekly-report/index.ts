/**
 * POST /functions/v1/weekly-report — the staff weekly report (ADR 0001; the plan's "weekly batch").
 * Callers: a staff member (JWT with app_metadata.role = 'staff' — the dashboard's Regenerate, the latest closed week
 * only) or the secret key (scripts/seed-synthetic.mjs backfilling earlier weeks). Body: { week_end?: a Sunday no later
 * than the latest closed week's, prose?: boolean }. Weeks are Monday to Sunday and closed (public.report_week()): no
 * check-in or meal photo can still arrive for them, so a report never changes under a re-run and two reports cannot be
 * subtracted to isolate a day (security review 2026-10-24).
 * Reads the check-ins and meal estimates the hysteresis needs (six weeks) with the service role, runs cohortReport —
 * the phone's own balanceFor on every participant — and keeps only counts; a week under 10 participants stores only
 * that fact. Then at most one prose call (PROSE_MODEL, reserved in the ai_usage ledger) on the formatted,
 * already-suppressed table; prose that fails checkProse is replaced by templateProse. Upserts public.weekly_reports and
 * returns the row. verify_jwt is off (supabase/config.toml) because the secret key is not a JWT; withSupabase checks
 * every caller.
 */
import { withSupabase } from '@supabase/server';
import { z } from 'zod';

import { cohortReport, type CohortCheckin, type CohortMeal } from '../../../src/domain/cohort.ts';
import { addDays, weekday } from '../../../src/domain/time.ts';
import type { Meal, Rating, Skipped, Training } from '../../../src/domain/types.ts';
import { PROSE_MODEL, writeProse } from '../_shared/claude.ts';
import { reserve, settle } from '../_shared/ledger.ts';
import { costUsd } from '../_shared/meal-router.ts';
import { PROSE_MAX_TOKENS, PROSE_WORST_INPUT_TOKENS, checkProse, displayTable, templateProse, type Prose } from '../_shared/weekly-prose.ts';

const Body = z.object({
  week_end: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((k) => addDays(k, 0) === k)
    .optional(),
  prose: z.boolean().optional(),
});

/** A closed week's model prose is final. A template report (the model refused, failed the checks or was over budget)
 * may ask the model again from the dashboard, at most once in this window. */
const COOLDOWN_MS = 15 * 60_000;
const PAGE = 1000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

interface CheckinRow {
  user_id: string;
  day: string;
  fullness: Rating;
  energy: Rating;
  focus: Rating;
  training: Training;
  skipped: Skipped;
  cohort: 'real' | 'synthetic';
}
interface MealRow {
  user_id: string;
  day: string;
  meal: Meal;
  protein_g: number | string;
  carbs_g: number | string;
}

/** PostgREST returns at most 1000 rows per request, so read in pages. */
async function every<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return null;
    out.push(...data);
    if (data.length < PAGE) return out;
  }
}

export default {
  fetch: withSupabase({ auth: ['user', 'secret'], errors: { detailed: false } }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const service = ctx.authMode === 'secret';
    if (!service && (ctx.userClaims?.appMetadata?.role !== 'staff' || ctx.jwtClaims?.is_anonymous === true)) return json({ error: 'staff_only' }, 403);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const admin = ctx.supabaseAdmin;

    const { data: latest, error: weekError } = await admin.rpc('report_week');
    if (weekError || !latest) return json({ error: 'unavailable' }, 503);
    const latestEnd: string = latest.to;
    const weekEnd = service ? (parsed.data.week_end ?? latestEnd) : latestEnd;
    if (weekday(weekEnd) !== 0 || weekEnd > latestEnd) return json({ error: 'week_not_closed' }, 400);
    const wantProse = service ? (parsed.data.prose ?? true) : true;
    const weekStart = addDays(weekEnd, -6);

    const { data: existing } = await admin.from('weekly_reports').select('*').eq('week_start', weekStart).maybeSingle();
    if (!service && existing && (existing.prose_source === 'model' || Date.now() - Date.parse(existing.generated_at) < COOLDOWN_MS)) {
      return json({ report: existing, cached: true });
    }

    // This week and the previous one, each with the 30-day history their hysteresis reads plus a 7-day window.
    const since = addDays(weekEnd, -43);
    const checkinRows = await every<CheckinRow>((a, b) =>
      admin.from('checkins').select('user_id, day, fullness, energy, focus, training, skipped, cohort').gte('day', since).lte('day', weekEnd).order('user_id').order('day').range(a, b),
    );
    const mealRows = await every<MealRow>((a, b) => admin.from('meal_analyses').select('user_id, day, meal, protein_g, carbs_g').gte('day', since).lte('day', weekEnd).order('id').range(a, b));
    if (!checkinRows || !mealRows) return json({ error: 'unavailable' }, 503);
    const checkins: CohortCheckin[] = checkinRows.map((r) => ({ userId: r.user_id, date: r.day, fullness: r.fullness, energy: r.energy, focus: r.focus, training: r.training, skipped: r.skipped, synthetic: r.cohort === 'synthetic' }));
    // numeric columns arrive as strings from PostgREST
    const meals: CohortMeal[] = mealRows.map((r) => ({ userId: r.user_id, date: r.day, meal: r.meal, protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g) }));

    const week = cohortReport(checkins, meals, weekEnd);
    const previous = cohortReport(checkins, meals, addDays(weekEnd, -7));

    let prose: Prose = templateProse(week, previous);
    let source: 'model' | 'template' = 'template';
    let model: string | null = null;
    if (wantProse && !week.suppressed) {
      const worstUsd = costUsd(PROSE_MODEL, { input_tokens: PROSE_WORST_INPUT_TOKENS, output_tokens: PROSE_MAX_TOKENS });
      const held = await reserve(admin, { user: null, fn: 'weekly-report', stage: 'prose', model: PROSE_MODEL, worstUsd });
      if ('id' in held) {
        const call = await writeProse(displayTable(week, previous), 90_000);
        const problems = call.output ? checkProse(call.output, week, previous) : [call.error ?? 'no output'];
        await settle(admin, held.id, call, problems.length === 0, worstUsd);
        if (call.output && problems.length === 0) {
          prose = call.output;
          source = 'model';
          model = call.model;
        } else console.warn('weekly-report prose rejected, template used:', problems.join('; '));
      }
    }

    const row = {
      week_start: weekStart,
      aggregates: { ...week, previous, proseConfidence: prose.confidence, proseWhy: prose.why },
      prose: prose.paragraphs.join('\n\n'),
      prose_source: source,
      model,
      generated_at: new Date().toISOString(),
    };
    const { data: saved, error } = await admin.from('weekly_reports').upsert(row).select('*').single();
    if (error || !saved) return json({ error: 'save_failed' }, 500);
    return json({ report: saved, cached: false });
  }),
};
