/**
 * POST /functions/v1/weekly-report — the staff weekly report (ADR 0001; the plan's "weekly batch").
 * Callers: a staff member (JWT with app_metadata.role = 'staff' — the dashboard's Regenerate, current week only) or
 * the secret key (scripts/seed-synthetic.mjs backfilling earlier weeks). Body: { week_end?: YYYY-MM-DD, prose?: boolean }.
 * Reads the check-ins the hysteresis needs (six weeks) and two weeks of meal estimates with the service role, runs
 * cohortReport — the phone's own balanceFor on every participant — and keeps only counts; a week under 10
 * participants stores only that fact. Then at most one prose call (PROSE_MODEL) on the formatted, already-suppressed
 * table; prose that fails checkProse is replaced by templateProse. Upserts public.weekly_reports and returns the row.
 * verify_jwt is off (supabase/config.toml) because the secret key is not a JWT; withSupabase checks every caller.
 */
import { withSupabase } from '@supabase/server';
import { z } from 'zod';

import { cohortReport, type CohortCheckin, type CohortMeal } from '../../../src/domain/cohort.ts';
import { addDays } from '../../../src/domain/time.ts';
import type { Meal, Rating, Skipped, Training } from '../../../src/domain/types.ts';
import { writeProse } from '../_shared/claude.ts';
import { costUsd } from '../_shared/meal-router.ts';
import { PROSE_MAX_TOKENS, PROSE_WORST_INPUT_TOKENS, checkProse, displayTable, templateProse, type Prose } from '../_shared/weekly-prose.ts';

const Body = z.object({ week_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), prose: z.boolean().optional() });

/** A staff Regenerate within this window returns the stored model prose instead of paying for another call. */
const COOLDOWN_MS = 15 * 60_000;
const PAGE = 1000;

const json = (body: unknown, status = 200) => Response.json(body, { status });
const schoolToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

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
  fetch: withSupabase({ auth: ['user', 'secret'] }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const service = ctx.authMode === 'secret';
    if (!service && (ctx.userClaims?.appMetadata?.role !== 'staff' || ctx.jwtClaims?.is_anonymous === true)) return json({ error: 'staff_only' }, 403);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const weekEnd = service ? (parsed.data.week_end ?? schoolToday()) : schoolToday();
    const wantProse = service ? (parsed.data.prose ?? true) : true;
    const weekStart = addDays(weekEnd, -6);
    const admin = ctx.supabaseAdmin;

    const { data: existing } = await admin.from('weekly_reports').select('*').eq('week_start', weekStart).maybeSingle();
    if (!service && existing?.prose_source === 'model' && Date.now() - Date.parse(existing.generated_at) < COOLDOWN_MS) return json({ report: existing, cached: true });

    // This week and the previous one, each with the 30-day history their hysteresis reads plus a 7-day window.
    const checkinRows = await every<CheckinRow>((a, b) =>
      admin.from('checkins').select('user_id, day, fullness, energy, focus, training, skipped, cohort').gte('day', addDays(weekEnd, -43)).lte('day', weekEnd).order('user_id').order('day').range(a, b),
    );
    const mealRows = await every<MealRow>((a, b) =>
      admin.from('meal_analyses').select('user_id, day, meal, protein_g, carbs_g').gte('day', addDays(weekEnd, -13)).lte('day', weekEnd).order('id').range(a, b),
    );
    if (!checkinRows || !mealRows) return json({ error: 'unavailable' }, 503);
    const checkins: CohortCheckin[] = checkinRows.map((r) => ({ userId: r.user_id, date: r.day, fullness: r.fullness, energy: r.energy, focus: r.focus, training: r.training, skipped: r.skipped, synthetic: r.cohort === 'synthetic' }));
    // numeric columns arrive as strings from PostgREST
    const meals: CohortMeal[] = mealRows.map((r) => ({ userId: r.user_id, date: r.day, meal: r.meal, protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g) }));

    const week = cohortReport(checkins, meals, weekEnd);
    const previous = cohortReport(checkins, meals, addDays(weekEnd, -7));
    const table = displayTable(week, previous);

    let prose: Prose = templateProse(week, previous);
    let source: 'model' | 'template' = 'template';
    let model: string | null = null;
    if (wantProse && !week.suppressed) {
      const { data: budget } = await admin.rpc('ai_budget_status');
      const proseModel = Deno.env.get('PROSE_MODEL') ?? 'claude-opus-5-5';
      const worst = costUsd(proseModel, { input_tokens: PROSE_WORST_INPUT_TOKENS, output_tokens: PROSE_MAX_TOKENS });
      if (budget && Number(budget.spent_usd) + worst < Number(budget.cap_usd)) {
        const call = await writeProse(table, 90_000);
        const problems = call.output ? checkProse(call.output, table) : [call.error ?? 'no output'];
        await admin.from('ai_usage').insert({
          user_id: null,
          fn: 'weekly-report',
          stage: 'prose',
          model: call.model,
          input_tokens: call.usage.input_tokens,
          output_tokens: call.usage.output_tokens,
          cache_read_tokens: call.usage.cache_read_input_tokens ?? 0,
          cache_write_tokens: call.usage.cache_creation_input_tokens ?? 0,
          cost_usd: costUsd(call.model, call.usage),
          latency_ms: call.latencyMs,
          ok: problems.length === 0,
        });
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
