/**
 * Demo weeks (prototype SCENARIOS): seven days, oldest first, dated so the last day is today.
 * Loaded records carry isDemo and are labelled wherever they appear; never exported.
 */
import { addDays } from './time';
import type { Checkin, DemoScenario, Rating, Skipped, Training } from './types';

type Day = { has: false } | { has: true; full: Rating; energy: Rating; focus: Rating; train: Training; skip: Skipped };

const d = (full: Rating, energy: Rating, focus: Rating, train: Training, skip: Skipped): Day => ({ has: true, full, energy, focus, train, skip });
const none: Day = { has: false };

export const SCENARIO_WEEKS: Record<Exclude<DemoScenario, 'live'>, Day[]> = {
  watch: [d(4, 4, 4, 'light', 'none'), d(4, 4, 3, 'none', 'none'), d(3, 3, 3, 'moderate', 'breakfast'), d(3, 3, 3, 'heavy', 'none'), d(3, 2, 2, 'heavy', 'breakfast'), d(2, 2, 2, 'heavy', 'none'), d(2, 2, 2, 'heavy', 'breakfast')],
  stable: [d(4, 4, 4, 'light', 'none'), d(4, 4, 4, 'none', 'none'), d(4, 4, 3, 'moderate', 'none'), d(4, 4, 4, 'heavy', 'none'), d(4, 3, 4, 'moderate', 'none'), d(5, 4, 4, 'light', 'none'), d(4, 4, 4, 'heavy', 'none')],
  attention: [d(4, 3, 3, 'moderate', 'breakfast'), d(3, 3, 3, 'heavy', 'breakfast'), d(3, 2, 2, 'heavy', 'lunch'), d(2, 2, 2, 'heavy', 'breakfast'), d(2, 2, 2, 'heavy', 'breakfast'), d(2, 1, 2, 'moderate', 'dinner'), d(2, 2, 1, 'heavy', 'breakfast')],
  sparse: [none, none, d(3, 3, 3, 'none', 'none'), none, none, d(3, 2, 3, 'heavy', 'breakfast'), d(3, 3, 3, 'light', 'none')],
};

export function scenarioCheckins(scenario: Exclude<DemoScenario, 'live'>, today: string): Checkin[] {
  const week = SCENARIO_WEEKS[scenario];
  const out: Checkin[] = [];
  week.forEach((day, k) => {
    if (!day.has) return;
    out.push({
      date: addDays(today, k - 6),
      fullness: day.full,
      energy: day.energy,
      focus: day.focus,
      training: day.train,
      skipped: day.skip,
      savedAt: new Date().toISOString(),
      durationS: null,
      isDemo: true,
    });
  });
  return out;
}
