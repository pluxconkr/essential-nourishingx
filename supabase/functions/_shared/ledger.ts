/**
 * The ai_usage ledger (ADR 0001: every Claude call writes a row; the budget guard refuses calls past AI_BUDGET_USD).
 * Before each call the worst-case cost is reserved by public.reserve_ai, which takes a database lock, checks the cap
 * and the student's daily limit, and inserts the row; concurrent requests therefore cannot all pass the check
 * (security review 2026-10-24). After the call the row is settled to the real tokens and cost.
 */
import type { SupabaseContext } from '@supabase/server';

import type { Call } from './claude.ts';
import { costUsd } from './meal-router.ts';

type Admin = SupabaseContext['supabaseAdmin'];
export type Stage = 'triage' | 'deep' | 'retry' | 'prose';
export type Refusal = 'budget_reached' | 'daily_limit' | 'unavailable';

export async function reserve(
  admin: Admin,
  r: { user: string | null; fn: string; stage: Stage; model: string; worstUsd: number; dailyLimit?: number | null },
): Promise<{ id: number } | { refused: Refusal }> {
  const { data, error } = await admin.rpc('reserve_ai', { p_user: r.user, p_fn: r.fn, p_stage: r.stage, p_model: r.model, p_worst_usd: r.worstUsd, p_daily_limit: r.dailyLimit ?? null });
  if (error) return { refused: /budget_reached/.test(error.message) ? 'budget_reached' : /daily_limit/.test(error.message) ? 'daily_limit' : 'unavailable' };
  return { id: Number(data) };
}

/** Real cost when the API answered. An error with an HTTP status from the API was not billed; a timeout or a lost
 * connection may have been, so it keeps the reserved worst case. */
export async function settle(admin: Admin, id: number, call: Call<unknown>, ok: boolean, worstUsd: number): Promise<void> {
  const answered = call.usage.input_tokens > 0 || call.usage.output_tokens > 0;
  const unbilled = !answered && /^\d{3} /.test(call.error ?? '');
  await admin
    .from('ai_usage')
    .update({
      model: call.model,
      input_tokens: call.usage.input_tokens,
      output_tokens: call.usage.output_tokens,
      cache_read_tokens: call.usage.cache_read_input_tokens ?? 0,
      cache_write_tokens: call.usage.cache_creation_input_tokens ?? 0,
      cost_usd: answered ? costUsd(call.model, call.usage) : unbilled ? 0 : worstUsd,
      latency_ms: call.latencyMs,
      ok,
    })
    .eq('id', id);
}
