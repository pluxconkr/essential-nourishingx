/**
 * Everything the phone sends to or reads from Supabase (ADR 0001). The local store stays the source of truth:
 * check-ins upload through a queue; meal analyses come back as the student's own rows (RLS). Callers only use
 * this after consent; in local-only mode (no Supabase settings) nothing here touches the network.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { Checkin, Meal, MealRecord, MenuDay } from '@/domain/types';

import { getSupabase } from './supabase';

/** Sign-in and token refresh set no deadline, and React Native's Android client has none either (OkHttpClientProvider
 * sets 0 ms), so a stalled one would hold the sync that "Delete everything" waits for. Past 30 s it counts as offline. */
function within<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('auth deadline')), 30_000);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

/** The anonymous student's id, signing in on first use. Anonymous sign-in collects nothing about the student. */
async function signedIn(sb: SupabaseClient): Promise<string | null> {
  try {
    // An error here (a refresh that failed offline) is not "no session": a new anonymous account would orphan the old one.
    const { data, error } = await within(sb.auth.getSession());
    if (error) return null;
    if (data.session) return data.session.user.id;
    const { data: signed, error: signInError } = await within(sb.auth.signInAnonymously());
    return signInError ? null : (signed.user?.id ?? null);
  } catch {
    return null;
  }
}

/** Starts the anonymous session after consent. Returns false in local-only mode or when offline. */
export async function connect(): Promise<boolean> {
  const sb = await getSupabase();
  return sb ? (await signedIn(sb)) !== null : false;
}

/** Uploads real (non-demo) check-ins: five values and a date. Returns the dates the server now holds. */
export async function uploadCheckins(rows: readonly Checkin[]): Promise<string[]> {
  const sb = await getSupabase();
  const real = rows.filter((c) => !c.isDemo);
  if (!sb || real.length === 0 || !(await signedIn(sb))) return [];
  const { error } = await sb
    .from('checkins')
    .upsert(real.map((c) => ({ day: c.date, fullness: c.fullness, energy: c.energy, focus: c.focus, training: c.training, skipped: c.skipped, updated_at: new Date().toISOString() })), { onConflict: 'user_id,day' });
  return error ? [] : real.map((c) => c.date);
}

interface MealRow {
  id: string;
  day: string;
  meal: Meal;
  items: MealRecord['items'];
  kcal: number;
  kcal_low: number;
  kcal_high: number;
  protein_g: number | string;
  carbs_g: number | string;
  fat_g: number | string;
  fiber_g: number | string;
  groups: string[];
  uncertain: string[];
  tier: MealRecord['tier'];
  difficulty: MealRecord['difficulty'];
  confidence: MealRecord['confidence'];
  created_at: string;
}

// numeric columns arrive as strings from PostgREST
const toRecord = (r: MealRow): MealRecord => ({
  id: r.id,
  date: r.day,
  meal: r.meal,
  items: r.items,
  kcal: r.kcal,
  kcalLow: r.kcal_low,
  kcalHigh: r.kcal_high,
  protein_g: Number(r.protein_g),
  carbs_g: Number(r.carbs_g),
  fat_g: Number(r.fat_g),
  fiber_g: Number(r.fiber_g),
  groups: r.groups,
  uncertain: r.uncertain,
  tier: r.tier,
  difficulty: r.difficulty,
  confidence: r.confidence,
  createdAt: r.created_at,
});

/** The student's own analyses since `fromDay`, newest first; null when the server could not be reached. */
export async function fetchMeals(fromDay: string): Promise<MealRecord[] | null> {
  const sb = await getSupabase();
  if (!sb || !(await signedIn(sb))) return null;
  const { data, error } = await sb.from('meal_analyses').select('*').gte('day', fromDay).order('created_at', { ascending: false });
  return error ? null : (data as MealRow[]).map(toRecord);
}

export type AnalyzeResult =
  | { status: 'ok'; record: MealRecord }
  | { status: 'not_food' }
  | { status: 'error'; reason: 'not_configured' | 'offline' | 'budget' | 'daily_limit' | 'unclear' | 'unavailable' };

/** Sends one resized photo (base64 JPEG) to the analyze-meal function. The photo is not stored anywhere. */
export async function analyzeMeal(input: { image: string; meal: Meal; day: string }): Promise<AnalyzeResult> {
  const sb = await getSupabase();
  if (!sb) return { status: 'error', reason: 'not_configured' };
  if (!(await signedIn(sb))) return { status: 'error', reason: 'offline' };
  const body = { image: input.image, media_type: 'image/jpeg', meal: input.meal, day: input.day };
  for (let attempt = 0; attempt < 2; attempt++) {
    // The function stops starting model calls at 135 s and the platform ends it at 150 s.
    const { data, error } = await sb.functions.invoke('analyze-meal', { body, timeout: 160_000 });
    if (!error) {
      if (data?.status === 'not_food') return { status: 'not_food' };
      if (data?.status === 'ok') return { status: 'ok', record: toRecord({ ...data.analysis, id: data.id, day: data.day, meal: data.meal, tier: data.tier, difficulty: data.difficulty, created_at: data.created_at }) };
      return { status: 'error', reason: 'unavailable' };
    }
    if (!(error instanceof FunctionsHttpError)) return { status: 'error', reason: 'offline' };
    const status = error.context.status;
    // A 503 is the platform refusing a worker (seen in the router eval); one retry clears it.
    if (status === 503 && attempt === 0) continue;
    const reason = await error.context.json().then((b: { error?: string }) => b.error).catch(() => undefined);
    if (reason === 'budget_reached') return { status: 'error', reason: 'budget' };
    if (reason === 'daily_limit') return { status: 'error', reason: 'daily_limit' };
    if (reason === 'analysis_failed') return { status: 'error', reason: 'unclear' };
    return { status: 'error', reason: 'unavailable' };
  }
  return { status: 'error', reason: 'unavailable' };
}

/** Menu days Dining Services entered for these keys ('weekday', 'weekend', YYYY-MM-DD); null when unreachable. */
export async function fetchMenus(keys: readonly string[]): Promise<Record<string, MenuDay> | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('menu_days').select('key, meals').in('key', keys);
  return error ? null : Object.fromEntries((data as { key: string; meals: MenuDay }[]).map((r) => [r.key, r.meals]));
}

export async function deleteMeal(id: string): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb || !(await signedIn(sb))) return false;
  const { error } = await sb.from('meal_analyses').delete().eq('id', id);
  return !error;
}

/** Deletes the anonymous account and every row it owns (delete-me function), then forgets the session. On any
 * failure the session is kept, so "Delete everything" can try again instead of orphaning the server copy. */
export async function deleteCloudAccount(): Promise<boolean> {
  const sb = await getSupabase();
  if (!sb) return true;
  const read = await within(sb.auth.getSession()).catch(() => null);
  if (!read || read.error) return false;
  if (!read.data.session) return true;
  const { error } = await sb.functions.invoke('delete-me', { body: {}, timeout: 30_000 });
  if (error) return false;
  await sb.auth.signOut({ scope: 'local' });
  return true;
}
