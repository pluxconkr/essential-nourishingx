/**
 * POST /functions/v1/weekly-report — the staff weekly report (ADR 0001; the plan's "weekly batch").
 * Callers: a staff member (JWT with app_metadata.role = 'staff' — the dashboard's Regenerate, the latest closed week
 * only) or the secret key (scripts/seed-synthetic.mjs backfilling earlier weeks). Body: { week_end?: a Sunday no later
 * than the latest closed week's, prose?: boolean }. Weeks are Monday to Sunday and closed (public.report_week()): no
 * check-in or meal photo can still arrive for them.
 * Writing a week's first report is what publishes the week, all at once (security review 2026-10-24): freeze_week
 * stores the week's staff numbers and returns, from the same transaction, the check-ins and meal estimates the report
 * needs; cohortReport — the phone's own balanceFor on every participant — turns them into counts (a week under 10
 * participants keeps only that fact); the previous week's numbers are its published report, never recomputed; then at
 * most one prose call (PROSE_MODEL, reserved in the ai_usage ledger) on the formatted, already-suppressed table, with
 * templateProse when checkProse fails; publish_week stores the report only if that freeze is still the latest. A
 * published week never changes: a template report may ask the model again, about the same numbers. verify_jwt is off
 * (supabase/config.toml) because the secret key is not a JWT; withSupabase checks every caller.
 */
import { withSupabase } from '@supabase/server';
import { z } from 'zod';

import { cohortReport, type CohortCheckin, type CohortMeal, type CohortReport } from '../../../src/domain/cohort.ts';
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

/** A published week's model prose is final. A template report (the model refused, failed the checks or was over
 * budget) may ask the model again from the dashboard, at most once in this window, about the same numbers. */
const COOLDOWN_MS = 15 * 60_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** What freeze_week returns: the moment of the freeze and the rows read in that transaction. */
interface Frozen {
  made_at: string;
  checkins: { user_id: string; day: string; fullness: Rating; energy: Rating; focus: Rating; training: Training; skipped: Skipped; cohort: 'real' | 'synthetic' }[];
  meals: { user_id: string; day: string; meal: Meal; protein_g: number; carbs_g: number }[];
}
type Stored = CohortReport & { previous?: CohortReport | null };

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
    if (existing && (service || existing.prose_source === 'model' || Date.now() - Date.parse(existing.generated_at) < COOLDOWN_MS)) {
      return json({ report: existing, cached: true });
    }

    let week: CohortReport;
    let previous: CohortReport | null | undefined;
    let madeAt: string | null = null;
    if (existing) {
      // Published: a template retry rewrites the prose about the numbers it published, which never change.
      ({ previous, ...week } = existing.aggregates as Stored);
    } else {
      const { data: frozen, error: freezeError } = await admin.rpc('freeze_week', { p_week_end: weekEnd });
      if (freezeError) return json({ error: 'unavailable' }, 503);
      if (!frozen) {
        // Another call published the week in the meantime.
        const { data: now } = await admin.from('weekly_reports').select('*').eq('week_start', weekStart).maybeSingle();
        return now ? json({ report: now, cached: true }) : json({ error: 'unavailable' }, 503);
      }
      const f = frozen as Frozen;
      madeAt = f.made_at;
      const checkins: CohortCheckin[] = f.checkins.map((r) => ({ userId: r.user_id, date: r.day, fullness: r.fullness, energy: r.energy, focus: r.focus, training: r.training, skipped: r.skipped, synthetic: r.cohort === 'synthetic' }));
      const meals: CohortMeal[] = f.meals.map((r) => ({ userId: r.user_id, date: r.day, meal: r.meal, protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g) }));
      week = cohortReport(checkins, meals, weekEnd);
      // The previous week as it was published, so two reports never disagree about it (none: not published).
      const { data: prev } = await admin.from('weekly_reports').select('aggregates').eq('week_start', addDays(weekStart, -7)).maybeSingle();
      previous = prev ? ({ ...(prev.aggregates as Stored), previous: undefined } as CohortReport) : null;
    }

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

    const report = {
      aggregates: { ...week, previous, proseConfidence: prose.confidence, proseWhy: prose.why },
      prose: prose.paragraphs.join('\n\n'),
      prose_source: source,
      model,
    };
    if (existing) {
      const { data: saved, error } = await admin
        .from('weekly_reports')
        .update({ ...report, generated_at: new Date().toISOString() })
        .eq('week_start', weekStart)
        .select('*')
        .single();
      if (error || !saved) return json({ error: 'save_failed' }, 500);
      return json({ report: saved, cached: false });
    }
    const { data: saved, error } = await admin.rpc('publish_week', { p_week_end: weekEnd, p_made_at: madeAt, p_report: report });
    // null: a later freeze of this week replaced this one, and that call publishes.
    if (error || !saved) return json({ error: 'save_failed' }, error ? 500 : 409);
    return json({ report: saved, cached: false });
  }),
};
