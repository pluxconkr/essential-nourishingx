/**
 * balanceFor — the single entry point the Balance screen, the weekly report and the tester use.
 * Evidence explains today's inputs; actions follow the word the student sees.
 * `meals` are the student's analysed meal photos (optional; none is fine).
 */
import { actionsFor, actionsForState } from './actions.ts';
import { buildEvidence } from './evidence.ts';
import { HISTORY_DAYS, attentionStreak, displayedStates } from './hysteresis.ts';
import { mealsIn } from './meals.ts';
import { derive, windowFor } from './rules.ts';
import type { Balance, Checkin, MealLog, School } from './types.ts';

export function balanceFor(checkins: readonly Checkin[], today: string, school: School, meals: readonly MealLog[] = []): Balance {
  const days = displayedStates(checkins, today, HISTORY_DAYS, meals);
  const todayState = days[days.length - 1];
  const window = windowFor(checkins, today);
  const derived = derive(window, mealsIn(meals, today));
  const evidence = buildEvidence(derived, todayState.clause);
  const actions = todayState.held ? actionsForState(todayState.shown, school) : actionsFor(todayState.clause, school);
  return {
    date: today,
    state: todayState.shown,
    raw: todayState.raw,
    clause: todayState.clause,
    held: todayState.held,
    derived,
    window,
    evidence,
    actions,
    attentionStreak: attentionStreak(days),
  };
}
