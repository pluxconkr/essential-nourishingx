/**
 * POST /functions/v1/analyze-meal — one meal photo in, one validated estimate out (ADR 0001).
 * Body: { image: base64 (resized on the phone), media_type, meal, day: student's local YYYY-MM-DD }.
 * The photo lives only in this request's memory: it is never written to storage, the database or logs.
 * Flow: reserve triage (budget cap + daily limit, _shared/ledger.ts) → Haiku triage → chooseTier → reserve the
 * tier, stepping down when the budget cannot cover it → deep analysis → checkDeep → at most one retry on the next
 * tier → meal_analyses row (service role, verified user id) → response. A student gets the estimate only; the
 * route, triage and cost stay in ai_usage (security review 2026-10-24).
 * Eval mode (secret key only, scripts/eval-router.mjs): may force a tier (then never retries), stores nothing but
 * the ai_usage rows (fn = 'eval') and returns the route, triage and cost. The platform's verify_jwt is off for this
 * function (supabase/config.toml) because a secret key is not a JWT; withSupabase still rejects every caller that
 * is neither a user nor the key.
 */
import { withSupabase } from '@supabase/server';
import { z } from 'zod';

import { schoolDate } from '../../../src/domain/time.ts';
import { deep, triage, type Call, type ImageMedia } from '../_shared/claude.ts';
import { reserve, settle, type Refusal, type Stage } from '../_shared/ledger.ts';
import { MODEL_ID, checkDeep, chooseTier, costUsd, nextTier, stepDown, worstCaseCostUsd, type Deep, type Tier } from '../_shared/meal-router.ts';

const Body = z.object({
  // Claude accepts images up to 5 MB; base64 adds a third. The phone sends ~150-400 KB JPEGs.
  image: z.string().min(100).max(7_000_000),
  media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  force_tier: z.enum(['haiku', 'opus', 'fable']).optional(),
  force_effort: z.enum(['low', 'medium', 'high']).optional(),
});

/** The platform answers 504 when a request sends nothing for 150 s; stop starting model calls well before. */
const DEADLINE_MS = 135_000;
const RETRY_NEEDS_MS = 50_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export default {
  fetch: withSupabase({ auth: ['user', 'secret'], errors: { detailed: false } }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const started = Date.now();
    const left = () => DEADLINE_MS - (Date.now() - started);
    const evalMode = ctx.authMode === 'secret';

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const { image, media_type, meal, day, force_tier, force_effort } = parsed.data;
    if ((force_tier || force_effort) && !evalMode) return json({ error: 'eval_options_need_secret_key' }, 403);
    // The check-in upload window (private.upload_days(), 2 days back) plus tomorrow for a phone ahead of the school.
    const gap = daysBetween(day, schoolDate());
    if (Number.isNaN(gap) || gap < -1 || gap > 2) return json({ error: 'day_out_of_range' }, 400);

    const userId = evalMode ? null : (ctx.userClaims?.id ?? null);
    if (!evalMode && !userId) return json({ error: 'unauthorized' }, 401);
    const admin = ctx.supabaseAdmin;
    const fn = evalMode ? 'eval' : 'analyze-meal';

    const { data: budget, error: budgetError } = await admin.rpc('ai_budget_status');
    if (budgetError || !budget) return json({ error: 'unavailable' }, 503);
    const cap = Number(budget.cap_usd);
    let spent = Number(budget.spent_usd);

    let costThisRequest = 0;
    // What only the eval harness sees: the route, the triage, the cost and the failure detail.
    const evalOnly = (extra: Record<string, unknown>) => (evalMode ? { ...extra, cost_usd: Math.round(costThisRequest * 1e6) / 1e6, ms: Date.now() - started } : {});
    /** Reserves the tier's worst case (refused past the cap or the daily limit), calls, settles to the real cost. */
    const ledgered = async <T>(stage: Stage, tier: Tier, run: () => Promise<Call<T>>, ok: (c: Call<T>) => boolean) => {
      const worstUsd = worstCaseCostUsd(tier);
      const dailyLimit = stage === 'triage' && userId ? Number(budget.per_student_per_day) : null;
      const held = await reserve(admin, { user: userId, fn, stage, model: MODEL_ID[tier], worstUsd, dailyLimit });
      if ('refused' in held) return held;
      const c = await run();
      await settle(admin, held.id, c, ok(c), worstUsd);
      const cost = costUsd(c.model, c.usage);
      spent += cost;
      costThisRequest += cost;
      return { call: c };
    };
    const refused = (r: Refusal) => json({ error: r }, r === 'unavailable' ? 503 : 429);

    const media = media_type as ImageMedia;
    const t = await ledgered('triage', 'haiku', () => triage(image, media, 30_000), (c) => c.output !== null);
    if ('refused' in t) return refused(t.refused);
    const tri = t.call.output;
    if (!tri) return json({ error: 'analysis_failed', ...evalOnly({ stage: 'triage', detail: t.call.error }) }, 502);
    if (!tri.is_food) return json({ status: 'not_food', ...evalOnly({ triage: tri }) });

    const deepOk = (c: Call<Deep>) => c.output !== null && checkDeep(c.output).ok;
    const runDeep = (stage: 'deep' | 'retry', at: Tier, effort?: typeof force_effort) =>
      ledgered(stage, at, () => deep(image, media, tri, at, Math.max(20_000, left() - 5_000), effort), deepOk);

    const route = force_tier ? { tier: force_tier, why: [`forced ${force_tier} (eval)`] } : chooseTier(tri, cap - spent);
    let tier: Tier = route.tier;
    let d = await runDeep('deep', tier, force_effort);
    // The reservation is the budget guard that holds under concurrent requests: step down while it refuses.
    let down = force_tier ? null : stepDown(tier);
    while ('refused' in d && d.refused === 'budget_reached' && down) {
      tier = down;
      down = stepDown(tier);
      route.why.push('budget left too small for a stronger model');
      d = await runDeep('deep', tier, force_effort);
    }
    if ('refused' in d) return refused(d.refused);
    let attempt = d.call;
    let checked = attempt.output ? checkDeep(attempt.output) : null;

    const up = force_tier ? null : nextTier(tier);
    if (!checked?.ok && up && left() > RETRY_NEEDS_MS) {
      const why = `retry on ${up}: ${(checked?.problems ?? [attempt.error ?? 'no output']).slice(0, 2).join('; ')}`;
      const retry = await runDeep('retry', up);
      if (!('refused' in retry)) {
        route.why.push(why);
        tier = up;
        attempt = retry.call;
        checked = attempt.output ? checkDeep(attempt.output) : null;
      }
    }
    if (!checked?.ok || !checked.result) {
      return json({ error: 'analysis_failed', ...evalOnly({ stage: 'deep', detail: checked?.problems ?? [attempt.error] }) }, 422);
    }

    const r = checked.result;
    if (evalMode) {
      return json({ status: 'ok', id: null, day, meal, difficulty: tri.difficulty, tier, analysis: r, ...evalOnly({ route: route.why, triage: tri }) });
    }
    const { data: row, error: saveError } = await admin
      .from('meal_analyses')
      .insert({
        user_id: userId,
        day,
        meal,
        items: r.items,
        kcal: r.kcal,
        kcal_low: r.kcal_low,
        kcal_high: r.kcal_high,
        protein_g: r.protein_g,
        carbs_g: r.carbs_g,
        fat_g: r.fat_g,
        fiber_g: r.fiber_g,
        groups: r.groups,
        uncertain: r.uncertain,
        difficulty: tri.difficulty,
        tier,
        confidence: r.confidence,
      })
      .select('id, created_at')
      .single();
    if (saveError || !row) return json({ error: 'save_failed' }, 500);

    return json({ status: 'ok', id: row.id, created_at: row.created_at, day, meal, difficulty: tri.difficulty, tier, analysis: r });
  }),
};
