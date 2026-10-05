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
import type { Checkin, Clause, DayState, StateWord } from './types';

type Word = Exclude<StateWord, 'nodata'>;

export const HYSTERESIS_DAYS = 3;
export const HISTORY_DAYS = 30;
export const NODATA_RESET_DAYS = 7;

export interface RawDay {
  raw: StateWord;
  hasCheckin: boolean;
}

/** The pure fold: raw states in → displayed states out. */
export function foldHysteresis(days: readonly RawDay[]): { shown: StateWord; held: boolean }[] {
  const out: { shown: StateWord; held: boolean }[] = [];
  let carry: Word | null = null;
  let qualifying: Word[] = [];
  let nodataRun = 0;

  for (const { raw, hasCheckin } of days) {
    if (raw === 'nodata') {
      nodataRun += 1;
      qualifying = [];
      if (nodataRun >= NODATA_RESET_DAYS) carry = null;
      out.push({ shown: 'nodata', held: false });
      continue;
    }
    nodataRun = 0;
    if (carry === null || SEVERITY[raw] > SEVERITY[carry]) {
      // first word, or worsening: immediate
      carry = raw;
      qualifying = [];
      out.push({ shown: raw, held: false });
    } else if (SEVERITY[raw] < SEVERITY[carry]) {
      if (hasCheckin) qualifying.push(raw);
      if (qualifying.length >= HYSTERESIS_DAYS) {
        const best = qualifying.slice(-HYSTERESIS_DAYS).reduce<Word>((a, b) => (SEVERITY[b] > SEVERITY[a] ? b : a), 'stable');
        carry = best;
        qualifying = [];
        out.push({ shown: best, held: false });
      } else {
        out.push({ shown: carry, held: true });
      }
    } else {
      qualifying = [];
      out.push({ shown: carry, held: false });
    }
  }
  return out;
}

export function displayedStates(checkins: readonly Checkin[], today: string, days: number = HISTORY_DAYS): DayState[] {
  const raws: (RawDay & { date: string; clause: Clause })[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const window = windowFor(checkins, date);
    const { state: raw, clause } = evaluateRules(derive(window));
    raws.push({ date, raw, clause, hasCheckin: window[6] !== null });
  }
  const folded = foldHysteresis(raws);
  return raws.map((r, i) => ({ date: r.date, hasCheckin: r.hasCheckin, raw: r.raw, clause: r.clause, shown: folded[i].shown, held: folded[i].held }));
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
