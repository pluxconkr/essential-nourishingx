/**
 * The staff weekly report's numbers (ADR 0001): balanceFor — the phone's own function — run on every student and
 * reduced to counts. Nothing per student leaves this function, and a week with fewer than MIN_GROUP students is
 * suppressed whole (plan "n ≥ 10 suppression"; the SQL aggregates use the same 10). Called by the weekly-report
 * Edge Function and by the tests.
 */
import { balanceFor } from './balance.ts';
import { addDays } from './time.ts';
import type { Checkin, Clause, MealLog, School, StateWord } from './types.ts';

export const MIN_GROUP = 10;

/** A stored check-in with its (anonymous) owner and cohort. */
export type CohortCheckin = Pick<Checkin, 'date' | 'fullness' | 'energy' | 'focus' | 'training' | 'skipped'> & { userId: string; synthetic: boolean };
export type CohortMeal = MealLog & { userId: string };

export interface CohortReport {
  from: string;
  to: string;
  students: number;
  suppressed: boolean;
  syntheticShare?: number;
  /** This week's check-ins and their means (1–5) and shares (0–1). */
  checkins?: number;
  meanEnergy?: number;
  meanFullness?: number;
  meanFocus?: number;
  skippedShare?: number;
  heavyShare?: number;
  states?: Record<StateWord, number>;
  /** Students shown Needs attention three or more days in a row (the firmer prompt on the phone). */
  attentionStreak3?: number;
  /** Which rule chose each student's word. */
  clauses?: Partial<Record<Clause, number>>;
  /** Students with at least one analysed meal photo this week. */
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

/** `checkins` should cover the 30 days the hysteresis reads; a student counts when they checked in this week. */
export function cohortReport(checkins: readonly CohortCheckin[], meals: readonly CohortMeal[], today: string): CohortReport {
  const from = addDays(today, -6);
  const inWeek = (d: string) => d >= from && d <= today;
  const active = [...groupBy(checkins)].filter(([, cs]) => cs.some((c) => inWeek(c.date)));
  if (active.length < MIN_GROUP) return { from, to: today, students: active.length, suppressed: true };

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
    if (b.attentionStreak >= 3) streak3 += 1;
    if (cs[0].synthetic) synthetic += 1;
    if (own.some((m) => inWeek(m.date))) mealStudents += 1;
  }
  const week = checkins.filter((c) => inWeek(c.date));
  const mean = (f: (c: CohortCheckin) => number) => Math.round((week.reduce((a, c) => a + f(c), 0) / week.length) * 100) / 100;
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
    mealStudents,
  };
}
