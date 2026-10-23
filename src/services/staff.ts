/**
 * The staff side of Supabase (ADR 0001): email + password sign-in with the role in app_metadata, and the n ≥ 10
 * aggregate RPCs. It is a separate client with its own storage key, so a staff sign-in in a browser never replaces
 * a student's anonymous session there. Imported only by the web-only /staff routes; staff never read student rows.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import type { CohortReport } from '@/domain/cohort';
import type { MenuDay } from '@/domain/types';

import { supabaseConfig } from './supabase-config';

let client: SupabaseClient | null | undefined;

export function staffClient(): SupabaseClient | null {
  if (client === undefined) {
    const cfg = supabaseConfig();
    const browser = typeof window !== 'undefined';
    client = cfg
      ? createClient(cfg.url, cfg.publishableKey, {
          auth: { storageKey: 'nourishingx-staff-auth', storage: browser ? window.localStorage : undefined, persistSession: browser, autoRefreshToken: browser, detectSessionInUrl: false },
        })
      : null;
  }
  return client;
}

export type StaffSession = { status: 'loading' | 'signedOut' | 'notConfigured' } | { status: 'notStaff' | 'staff'; email: string };

/** The current staff session. Authorisation reads app_metadata only; user_metadata can be edited by the user. */
export function useStaffSession(): StaffSession {
  const [session, setSession] = useState<StaffSession>(() => (staffClient() ? { status: 'loading' } : { status: 'notConfigured' }));
  useEffect(() => {
    const sb = staffClient();
    if (!sb) return;
    const read = (user: { email?: string; app_metadata?: Record<string, unknown>; is_anonymous?: boolean } | null | undefined) =>
      setSession(!user ? { status: 'signedOut' } : { status: user.app_metadata?.role === 'staff' && !user.is_anonymous ? 'staff' : 'notStaff', email: user.email ?? '' });
    void sb.auth.getSession().then(({ data }) => read(data.session?.user));
    const { data } = sb.auth.onAuthStateChange((_event, s) => read(s?.user));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}

export async function staffSignIn(email: string, password: string): Promise<'ok' | 'wrong' | 'offline'> {
  const sb = staffClient();
  if (!sb) return 'offline';
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return 'ok';
  return error.status === 400 ? 'wrong' : 'offline';
}

export async function staffSignOut(): Promise<void> {
  await staffClient()?.auth.signOut({ scope: 'local' });
}

/** Calls one of the public.staff_* wrappers; null when the call failed (offline, or the account is not staff). */
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const sb = staffClient();
  if (!sb) return null;
  const { data, error } = await sb.rpc(fn, args);
  return error ? null : (data as T);
}

export interface Overview {
  from: string;
  to: string;
  days: number;
  students: number;
  suppressed: boolean;
  checkins?: number;
  checkins_per_student?: number;
  avg_fullness?: number;
  avg_energy?: number;
  avg_focus?: number;
  skipped_share?: number;
  heavy_share?: number;
  synthetic_share?: number;
}

export interface DailyRow {
  day: string;
  students: number;
  suppressed: boolean;
  avg_energy: number | null;
  avg_fullness: number | null;
  avg_focus: number | null;
  skipped_share: number | null;
  heavy_share: number | null;
}

export interface MealsSummary {
  from: string;
  to: string;
  students: number;
  suppressed: boolean;
  analyses?: number;
  synthetic_share?: number;
  low_confidence_share?: number;
  by_meal?: { meal: string; analyses: number; students: number; suppressed: boolean; avg_kcal: number | null; avg_protein_g: number | null; avg_carbs_g: number | null; avg_fat_g: number | null; avg_fiber_g: number | null }[];
  groups?: { group: string; share: number }[];
  tiers?: Record<string, number>;
  difficulty?: Record<string, number>;
}

export interface AiSpend {
  cap_usd: number;
  spent_usd: number;
  calls: number;
  by_model: { model: string; stage: string; calls: number; cost_usd: number; avg_latency_ms: number | null }[];
}

export const staffOverview = (days = 7) => rpc<Overview>('staff_overview', { p_days: days });
export const staffDaily = (days = 30) => rpc<DailyRow[]>('staff_daily', { p_days: days });
export const staffMeals = (days = 7) => rpc<MealsSummary>('staff_meals', { p_days: days });
export const staffAiSpend = () => rpc<AiSpend>('staff_ai_spend');

/** A row of public.weekly_reports: the shared rules' counts for one week (never a student row) and its prose. */
export interface WeeklyReport {
  week_start: string;
  aggregates: CohortReport & { previous?: CohortReport; proseConfidence?: 'High' | 'Medium' | 'Low'; proseWhy?: string };
  prose: string;
  prose_source: 'model' | 'template';
  model: string | null;
  generated_at: string;
}

export async function latestReports(limit = 8): Promise<WeeklyReport[] | null> {
  const sb = staffClient();
  if (!sb) return null;
  const { data, error } = await sb.from('weekly_reports').select('*').order('week_start', { ascending: false }).limit(limit);
  return error ? null : (data as WeeklyReport[]);
}

/** Runs the weekly-report Edge Function now (staff JWT). `cached` means a report from the last 15 minutes was reused. */
export async function generateReport(): Promise<{ report: WeeklyReport; cached: boolean } | null> {
  const sb = staffClient();
  if (!sb) return null;
  const { data, error } = await sb.functions.invoke('weekly-report', { body: {} });
  return error || !data?.report ? null : (data as { report: WeeklyReport; cached: boolean });
}

export interface MenuRow {
  key: string;
  meals: MenuDay;
  entered_by: string;
  updated_at: string;
}

export async function menuRows(): Promise<MenuRow[] | null> {
  const sb = staffClient();
  if (!sb) return null;
  const { data, error } = await sb.from('menu_days').select('key, meals, entered_by, updated_at').order('key');
  return error ? null : (data as MenuRow[]);
}

export async function saveMenuDay(key: string, meals: MenuDay): Promise<boolean> {
  const sb = staffClient();
  if (!sb) return false;
  const { error } = await sb.from('menu_days').upsert({ key, meals, entered_by: 'Dining Services', updated_at: new Date().toISOString() });
  return !error;
}

export async function deleteMenuDay(key: string): Promise<boolean> {
  const sb = staffClient();
  if (!sb) return false;
  const { error } = await sb.from('menu_days').delete().eq('key', key);
  return !error;
}
