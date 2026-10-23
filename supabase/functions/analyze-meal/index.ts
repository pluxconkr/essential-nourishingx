/**
 * POST /functions/v1/analyze-meal — one meal photo in, one validated estimate out (ADR 0001).
 * Body: { image: base64 (resized on the phone), media_type, meal, day: student's local YYYY-MM-DD }.
 * The photo lives only in this request's memory: it is never written to storage, the database or logs.
 * Flow: budget + daily-limit check → Haiku triage → chooseTier → deep analysis → checkDeep → at most one
 * retry on the next tier → meal_analyses row (service role, verified user id) → response.
 */
import { withSupabase } from '@supabase/server';
import { z } from 'zod';

import { deep, triage, type Call, type ImageMedia } from '../_shared/claude.ts';
import { checkDeep, chooseTier, costUsd, nextTier, worstCaseCostUsd, type Tier } from '../_shared/meal-router.ts';

const Body = z.object({
  // Claude accepts images up to 5 MB; base64 adds a third. The phone sends ~150-400 KB JPEGs.
  image: z.string().min(100).max(7_000_000),
  media_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** The platform answers 504 when a request sends nothing for 150 s; stop starting model calls well before. */
const DEADLINE_MS = 135_000;
const RETRY_NEEDS_MS = 50_000;

const json = (body: unknown, status = 200) => Response.json(body, { status });

/** School-local date (New Hampshire, US Eastern) — the same calendar the phone uses for `day`. */
const schoolToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const started = Date.now();
    const left = () => DEADLINE_MS - (Date.now() - started);

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const { image, media_type, meal, day } = parsed.data;
    const gap = daysBetween(day, schoolToday());
    if (Number.isNaN(gap) || gap < -1 || gap > 6) return json({ error: 'day_out_of_range' }, 400);

    const userId = ctx.userClaims?.id;
    if (!userId) return json({ error: 'unauthorized' }, 401);
    const admin = ctx.supabaseAdmin;

    const { data: budget, error: budgetError } = await admin.rpc('ai_budget_status');
    if (budgetError || !budget) return json({ error: 'unavailable' }, 503);
    const cap = Number(budget.cap_usd);
    let spent = Number(budget.spent_usd);
    if (spent + worstCaseCostUsd('haiku') >= cap) return json({ error: 'budget_reached' }, 429);

    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('stage', 'triage').gte('created_at', since);
    if ((count ?? 0) >= Number(budget.per_student_per_day)) return json({ error: 'daily_limit' }, 429);

    let costThisRequest = 0;
    const log = async (stage: 'triage' | 'deep' | 'retry', call: Call<unknown>, ok: boolean) => {
      const cost = costUsd(call.model, call.usage);
      spent += cost;
      costThisRequest += cost;
      await admin.from('ai_usage').insert({
        user_id: userId,
        fn: 'analyze-meal',
        stage,
        model: call.model,
        input_tokens: call.usage.input_tokens,
        output_tokens: call.usage.output_tokens,
        cache_read_tokens: call.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: call.usage.cache_creation_input_tokens ?? 0,
        cost_usd: cost,
        latency_ms: call.latencyMs,
        ok,
      });
    };

    const media = media_type as ImageMedia;
    const tri = await triage(image, media, 30_000);
    await log('triage', tri, tri.output !== null);
    if (!tri.output) return json({ error: 'analysis_failed', stage: 'triage', detail: tri.error }, 502);
    if (!tri.output.is_food) return json({ status: 'not_food', triage: tri.output, cost_usd: costThisRequest, ms: Date.now() - started });

    const route = chooseTier(tri.output, cap - spent);
    let tier: Tier = route.tier;
    let attempt = await deep(image, media, tri.output, tier, Math.max(20_000, left() - 5_000));
    let checked = attempt.output ? checkDeep(attempt.output) : null;
    await log('deep', attempt, Boolean(checked?.ok));

    const up = nextTier(tier);
    if (!checked?.ok && up && left() > RETRY_NEEDS_MS && cap - spent >= worstCaseCostUsd(up)) {
      route.why.push(`retry on ${up}: ${(checked?.problems ?? [attempt.error ?? 'no output']).slice(0, 2).join('; ')}`);
      tier = up;
      attempt = await deep(image, media, tri.output, tier, Math.max(20_000, left() - 5_000));
      checked = attempt.output ? checkDeep(attempt.output) : null;
      await log('retry', attempt, Boolean(checked?.ok));
    }
    if (!checked?.ok || !checked.result) {
      return json({ error: 'analysis_failed', stage: 'deep', detail: checked?.problems ?? [attempt.error], cost_usd: costThisRequest }, 422);
    }

    const r = checked.result;
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
        difficulty: tri.output.difficulty,
        tier,
        confidence: r.confidence,
      })
      .select('id, created_at')
      .single();
    if (saveError || !row) return json({ error: 'save_failed' }, 500);

    return json({
      status: 'ok',
      id: row.id,
      created_at: row.created_at,
      day,
      meal,
      difficulty: tri.output.difficulty,
      tier,
      route: route.why,
      triage: tri.output,
      analysis: r,
      cost_usd: Math.round(costThisRequest * 1e6) / 1e6,
      ms: Date.now() - started,
    });
  }),
};
