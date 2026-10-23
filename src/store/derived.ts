/** Derived hooks: today's key, the balance, today's record, the menu. Pure functions over the store. */
import { useEffect, useMemo, useState } from 'react';

import schoolJson from '@/assets/data/school.json';
import { balanceFor } from '@/domain/balance';
import { dateKey } from '@/domain/time';
import { toMealLog, type Balance, type Checkin, type MealRecord, type School } from '@/domain/types';
import { supabaseConfig } from '@/services/supabase-config';

import { useAppState } from './appStore';

export const school = schoolJson as unknown as School;

/** true when this build has the Supabase settings (sync and meal photos); false in local-only mode. */
export const cloudEnabled = supabaseConfig() !== null;

/** Today's local date key, re-read once a minute so a screen left open crosses midnight correctly. */
export function useToday(): string {
  const [today, setToday] = useState(() => dateKey());
  useEffect(() => {
    const id = setInterval(() => {
      const k = dateKey();
      setToday((prev) => (prev === k ? prev : k));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function useCheckins(): Checkin[] {
  return useAppState((s) => s.checkins);
}

export function useMeals(): MealRecord[] {
  return useAppState((s) => s.meals);
}

export function useBalance(): Balance {
  const checkins = useCheckins();
  const meals = useMeals();
  const demo = useDemoScenario();
  const today = useToday();
  // A demo week is synthetic check-ins only; the student's real meal photos never mix into it.
  return useMemo(() => balanceFor(checkins, today, school, demo === 'live' ? meals.map(toMealLog) : []), [checkins, meals, demo, today]);
}

export function useTodayCheckin(): Checkin | null {
  const checkins = useCheckins();
  const today = useToday();
  return useMemo(() => checkins.find((c) => c.date === today) ?? null, [checkins, today]);
}

export function useDemoScenario() {
  return useAppState((s) => s.prefs.demo);
}
