/**
 * Every Claude call (Deno / Edge Functions only): meal triage, meal deep analysis and the weekly report's prose.
 * The key is the ANTHROPIC_API_KEY function secret and never reaches a client. Responses use structured outputs (output_config.format); the text is
 * parsed here rather than with messages.parse() so token usage is still recorded when parsing fails.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

import { DEEP_SYSTEM, DeepSchema, MAX_TOKENS, MODEL_ID, TRIAGE_SYSTEM, TriageSchema, deepUserText, type Deep, type Tier, type Triage, type Usage } from './meal-router.ts';
import { PROSE_MAX_TOKENS, PROSE_SYSTEM, ProseSchema, type Prose } from './weekly-prose.ts';

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), maxRetries: 1 });

export type ImageMedia = 'image/jpeg' | 'image/png' | 'image/webp';

export interface Call<T> {
  output: T | null;
  model: string;
  usage: Usage;
  latencyMs: number;
  stopReason: string | null;
  error: string | null;
}

/** Effort per tier. Opus 5.5 and Haiku 5.5 default to medium; Fable starts low because its turns run long and
 * the platform drops a request after 150 s without a response. Tuned in docs/ai-router.md. */
export const EFFORT: Record<Tier, 'low' | 'medium' | 'high'> = { haiku: 'medium', opus: 'medium', fable: 'low' };

const imageBlock = (data: string, media: ImageMedia) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: media, data } });

interface RawResponse {
  model: string;
  usage: Usage;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

function readOutput<S extends z.ZodType>(schema: S, res: RawResponse): { output: z.infer<S> | null; error: string | null } {
  if (res.stop_reason !== 'end_turn') return { output: null, error: `stop_reason ${res.stop_reason}` };
  const text = res.content.find((b) => b.type === 'text')?.text;
  if (!text) return { output: null, error: 'no text block' };
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? { output: parsed.data, error: null } : { output: null, error: parsed.error.message.slice(0, 300) };
  } catch (e) {
    return { output: null, error: `invalid JSON: ${(e as Error).message}` };
  }
}

const failed = <T>(model: string, t0: number, e: unknown): Call<T> => ({
  output: null,
  model,
  usage: { input_tokens: 0, output_tokens: 0 },
  latencyMs: Date.now() - t0,
  stopReason: null,
  error: e instanceof Anthropic.APIError ? `${e.status ?? 'network'} ${e.message}`.slice(0, 300) : String(e).slice(0, 300),
});

/** Stage 1: Haiku sorts the photo. Thinking is off (allowed on Haiku 5.5 at effort high or below). */
export async function triage(data: string, media: ImageMedia, timeoutMs: number): Promise<Call<Triage>> {
  const t0 = Date.now();
  try {
    const res = await client.messages.create(
      {
        model: MODEL_ID.triage,
        max_tokens: MAX_TOKENS.triage,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low', format: zodOutputFormat(TriageSchema) },
        system: TRIAGE_SYSTEM,
        messages: [{ role: 'user', content: [imageBlock(data, media), { type: 'text', text: 'Sort this photo.' }] }],
      },
      { timeout: timeoutMs },
    );
    const { output, error } = readOutput(TriageSchema, res as unknown as RawResponse);
    return { output, error, model: res.model, usage: res.usage, latencyMs: Date.now() - t0, stopReason: res.stop_reason };
  } catch (e) {
    return failed(MODEL_ID.triage, t0, e);
  }
}

/** Stage 2: the routed model estimates the meal. Fable runs with the server-side refusal fallback on. */
export async function deep(data: string, media: ImageMedia, t: Triage, tier: Tier, timeoutMs: number, effort = EFFORT[tier]): Promise<Call<Deep>> {
  const t0 = Date.now();
  const model = MODEL_ID[tier];
  const messages = [{ role: 'user' as const, content: [imageBlock(data, media), { type: 'text' as const, text: deepUserText(t) }] }];
  const output_config = { effort, format: zodOutputFormat(DeepSchema) };
  try {
    const res =
      tier === 'fable'
        ? await client.beta.messages.create(
            { model, max_tokens: MAX_TOKENS.deep, output_config, system: DEEP_SYSTEM, messages, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
            { timeout: timeoutMs },
          )
        : await client.messages.create({ model, max_tokens: MAX_TOKENS.deep, output_config, system: DEEP_SYSTEM, messages }, { timeout: timeoutMs });
    const { output, error } = readOutput(DeepSchema, res as unknown as RawResponse);
    return { output, error, model: res.model, usage: res.usage, latencyMs: Date.now() - t0, stopReason: res.stop_reason };
  } catch (e) {
    return failed(model, t0, e);
  }
}

/** The weekly report's one prose call (weekly-report). PROSE_MODEL is Claude Opus 5.5 unless the secret says otherwise;
 * Opus 5.5 always thinks, so max_tokens leaves room for it. A refusal or any other stop reason means the template. */
export async function writeProse(table: string, timeoutMs: number): Promise<Call<Prose>> {
  const t0 = Date.now();
  const model = Deno.env.get('PROSE_MODEL') ?? MODEL_ID.opus;
  try {
    const res = await client.messages.create(
      { model, max_tokens: PROSE_MAX_TOKENS, output_config: { effort: 'low', format: zodOutputFormat(ProseSchema) }, system: PROSE_SYSTEM, messages: [{ role: 'user', content: table }] },
      { timeout: timeoutMs },
    );
    const { output, error } = readOutput(ProseSchema, res as unknown as RawResponse);
    return { output, error, model: res.model, usage: res.usage, latencyMs: Date.now() - t0, stopReason: res.stop_reason };
  } catch (e) {
    return failed(model, t0, e);
  }
}
