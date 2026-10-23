/**
 * The staff weekly report's numbers (ADR 0001): balanceFor — the phone's own function — run on every student and
 * reduced to counts. Nothing per student leaves this function. A week with fewer than MIN_GROUP students is
 * suppressed whole, without even its exact count, and the week's means use only days that themselves have
 * MIN_GROUP students, so no quiet day can be recovered by subtraction (security review 2026-10-24; the SQL staff
 * totals follow the same rules). The one exception: inside a reported week the Balance word, clause and streak counts
 * stay exact even when small, because the Health Center needs to know someone is at Needs attention; a count names
 * no one (docs/security-and-privacy.md). Called by the weekly-report Edge Function and by the tests.
 */
import { balanceFor } from './balance.ts';
import { FIRM_PROMPT_DAYS } from './hysteresis.ts';
import { addDays } from './time.ts';
import type { Checkin, Clause, MealLog, School, StateWord } from './types.ts';

export const MIN_GROUP = 10;

/** A stored check-in with its (anonymous) owner and cohort. */
export type CohortCheckin = Pick<Checkin, 'date' | 'fullness' | 'energy' | 'focus' | 'training' | 'skipped'> & { userId: string; synthetic: boolean };
export type CohortMeal = MealLog & { userId: string };

export interface CohortReport {
  from: string;
  to: string;
  /** Absent when suppressed: an exact count under MIN_GROUP is itself disclosive. */
  students?: number;
  suppressed: boolean;
  syntheticShare?: number;
  /** This week's check-ins on shown days (days with MIN_GROUP students) and their means (1–5) and shares (0–1). */
  checkins?: number;
  meanEnergy?: number;
  meanFullness?: number;
  meanFocus?: number;
  skippedShare?: number;
  heavyShare?: number;
  states?: Record<StateWord, number>;
  /** Students shown Needs attention FIRM_PROMPT_DAYS or more days in a row (the firmer prompt on the phone). */
  attentionStreak3?: number;
  /** Which rule chose each student's word. */
  clauses?: Partial<Record<Clause, number>>;
  /** Students with at least one analysed meal photo this week; absent under MIN_GROUP, like any other small group. */
  mealStudents?: number;
}

// The report needs the word and the clause, not the actions a student is shown.
const NO_ACTIONS = { actionsByClause: {} } as unknown as School;

function groupBy<T extends { userId: string }>(rows: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const list = m.get(r.userId);
    if (list) list.push(r);
    else m.set(r.userId, [r]);
  }
  return m;
}

/** `checkins` and `meals` should cover the 36 days the hysteresis reads (30 days, each looking 6 days back);
 * a student counts when they checked in on a shown day this week, exactly as the SQL staff_overview counts them,
 * so the report and the overview never differ by the students seen only on a quiet day. */
export function cohortReport(checkins: readonly CohortCheckin[], meals: readonly CohortMeal[], today: string): CohortReport {
  const from = addDays(today, -6);
  const inWeek = (d: string) => d >= from && d <= today;
  const perDay = new Map<string, Set<string>>();
  for (const c of checkins) if (inWeek(c.date)) perDay.set(c.date, (perDay.get(c.date) ?? new Set()).add(c.userId));
  const shown = (d: string) => inWeek(d) && (perDay.get(d)?.size ?? 0) >= MIN_GROUP;
  const active = [...groupBy(checkins)].filter(([, cs]) => cs.some((c) => shown(c.date)));
  if (active.length < MIN_GROUP) return { from, to: today, suppressed: true };

  const mealsByUser = groupBy(meals);
  const states: Record<StateWord, number> = { stable: 0, watch: 0, attention: 0, nodata: 0 };
  const clauses: Partial<Record<Clause, number>> = {};
  let streak3 = 0;
  let synthetic = 0;
  let mealStudents = 0;
  for (const [userId, cs] of active) {
    const own = mealsByUser.get(userId) ?? [];
    const b = balanceFor(
      cs.map((c) => ({ date: c.date, fullness: c.fullness, energy: c.energy, focus: c.focus, training: c.training, skipped: c.skipped, savedAt: '', durationS: null })),
      today,
      NO_ACTIONS,
      own,
    );
    states[b.state] += 1;
    clauses[b.clause] = (clauses[b.clause] ?? 0) + 1;
    if (b.attentionStreak >= FIRM_PROMPT_DAYS) streak3 += 1;
    if (cs[0].synthetic) synthetic += 1;
    if (own.some((m) => inWeek(m.date))) mealStudents += 1;
  }
  const week = checkins.filter((c) => shown(c.date));
  const mean = (f: (c: CohortCheckin) => number) => (week.length ? Math.round((week.reduce((a, c) => a + f(c), 0) / week.length) * 100) / 100 : undefined);
  return {
    from,
    to: today,
    students: active.length,
    suppressed: false,
    syntheticShare: Math.round((synthetic / active.length) * 1000) / 1000,
    checkins: week.length,
    meanEnergy: mean((c) => c.energy),
    meanFullness: mean((c) => c.fullness),
    meanFocus: mean((c) => c.focus),
    skippedShare: mean((c) => (c.skipped !== 'none' ? 1 : 0)),
    heavyShare: mean((c) => (c.training === 'heavy' ? 1 : 0)),
    states,
    attentionStreak3: streak3,
    clauses,
    mealStudents: mealStudents >= MIN_GROUP ? mealStudents : undefined,
  };
}
