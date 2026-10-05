/** Derived hooks: today's key, the balance, today's record, the menu. Pure functions over the store. */
import { useEffect, useMemo, useState } from 'react';

import schoolJson from '@/assets/data/school.json';
import { balanceFor } from '@/domain/balance';
import { dateKey } from '@/domain/time';
import type { Balance, Checkin, School } from '@/domain/types';

import { useAppState } from './appStore';

export const school = schoolJson as unknown as School;

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

export function useBalance(): Balance {
  const checkins = useCheckins();
  const today = useToday();
  return useMemo(() => balanceFor(checkins, today, school), [checkins, today]);
}

export function useTodayCheckin(): Checkin | null {
  const checkins = useCheckins();
  const today = useToday();
  return useMemo(() => checkins.find((c) => c.date === today) ?? null, [checkins, today]);
}

export function useDemoScenario() {
  return useAppState((s) => s.prefs.demo);
}
