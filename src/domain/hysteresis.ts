/**
 * Hysteresis (spec §7): a state may worsen immediately, but may only improve after 3 consecutive days
 * that qualify for the better state. Nothing is persisted: the displayed word for any day is a pure
 * function of the check-ins up to that day, recomputed on read (spec §6 "derived, not stored").
 *
 * Definitions (plan D-rows):
 *  - a qualifying day is a calendar day WITH a check-in whose raw state is better than the carried word;
 *    days without a check-in neither count nor break the run (a student cannot improve by not checking in);
 *  - after three qualifying check-in days the word improves to the most severe raw state among those three;
 *  - "Not enough data" is shown whenever the window has < 4 check-ins; the carried word survives such gaps
 *    unless they last 7 consecutive days (then the window shares no data with it and the fold starts over).
 */
import { SEVERITY, derive, evaluateRules, windowFor } from './rules';
import { addDays } from './time';
import type { Checkin, DayState, StateWord } from './types';

type Word = Exclude<StateWord, 'nodata'>;

export const HYSTERESIS_DAYS = 3;
export const HISTORY_DAYS = 30;

export function displayedStates(checkins: readonly Checkin[], today: string, days: number = HISTORY_DAYS): DayState[] {
  const out: DayState[] = [];
  let carry: Word | null = null;
  let qualifying: Word[] = [];
  let nodataRun = 0;

  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const window = windowFor(checkins, date);
    const { state: raw, clause } = evaluateRules(derive(window));
    const hasCheckin = window[6] !== null;
    let shown: StateWord;
    let held = false;

    if (raw === 'nodata') {
      nodataRun += 1;
      qualifying = [];
      if (nodataRun >= 7) carry = null;
      shown = 'nodata';
    } else {
      nodataRun = 0;
      if (carry === null || SEVERITY[raw] > SEVERITY[carry]) {
        // first word, or worsening: immediate
        carry = raw;
        qualifying = [];
        shown = raw;
      } else if (SEVERITY[raw] < SEVERITY[carry]) {
        if (hasCheckin) qualifying.push(raw);
        if (qualifying.length >= HYSTERESIS_DAYS) {
          const best = qualifying.slice(-HYSTERESIS_DAYS).reduce<Word>((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), 'stable');
          carry = best;
          qualifying = [];
          shown = best;
        } else {
          shown = carry;
          held = true;
        }
      } else {
        qualifying = [];
        shown = carry;
      }
    }
    out.push({ date, hasCheckin, raw, clause, shown, held });
  }
  return out;
}

/** Consecutive displayed 'attention' days ending with the last entry. */
export function attentionStreak(days: readonly DayState[]): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].shown !== 'attention') break;
    n += 1;
  }
  return n;
}
