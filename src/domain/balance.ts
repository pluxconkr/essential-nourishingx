/**
 * balanceFor — the single entry point the Balance screen, the batch and the tester use.
 * Evidence explains today's inputs; actions follow the word the student sees.
 */
import { actionsFor, actionsForState } from './actions';
import { buildEvidence } from './evidence';
import { attentionStreak, displayedStates } from './hysteresis';
import { derive, windowFor } from './rules';
import type { Balance, Checkin, School } from './types';

export function balanceFor(checkins: readonly Checkin[], today: string, school: School): Balance {
  const days = displayedStates(checkins, today);
  const todayState = days[days.length - 1];
  const window = windowFor(checkins, today);
  const derived = derive(window);
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
