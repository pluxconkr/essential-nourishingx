/** The staff weekly report: the phone's balanceFor per student, reduced to counts, suppressed below 10 students. */
import schoolJson from '@/assets/data/school.json';
import { balanceFor } from '@/domain/balance';
import { MIN_GROUP, cohortReport, type CohortCheckin } from '@/domain/cohort';
import { addDays } from '@/domain/time';
import { scenarioCheckins } from '@/domain/demo';
import type { School } from '@/domain/types';

const school = schoolJson as unknown as School;
const today = '2027-10-08';
const SCENARIOS = ['stable', 'watch', 'attention', 'sparse'] as const;

/** Student i lives the i-th scenario week (round robin). */
function cohort(n: number): CohortCheckin[] {
  return Array.from({ length: n }, (_, i) =>
    scenarioCheckins(SCENARIOS[i % SCENARIOS.length], today).map((c) => ({ date: c.date, fullness: c.fullness, energy: c.energy, focus: c.focus, training: c.training, skipped: c.skipped, userId: `u${i}`, synthetic: i % 2 === 0 })),
  ).flat();
}

test('every counted word is the word the phone shows that student', () => {
  const rows = cohort(12);
  const report = cohortReport(rows, [], today);
  const expected = { stable: 0, watch: 0, attention: 0, nodata: 0 };
  for (let i = 0; i < 12; i++) {
    const own = rows.filter((r) => r.userId === `u${i}`).map((r) => ({ ...r, savedAt: '', durationS: null }));
    expected[balanceFor(own, today, school).state] += 1;
  }
  expect(report.suppressed).toBe(false);
  expect(report.states).toEqual(expected);
  expect(report.states).toEqual({ stable: 3, watch: 3, attention: 3, nodata: 3 });
  expect(report.students).toBe(12);
  expect(report.syntheticShare).toBe(0.5);
});

test('fewer than 10 students suppresses the whole week: no states, no clauses, not even the exact count', () => {
  const report = cohortReport(cohort(MIN_GROUP - 1), [], today);
  expect(report).toEqual({ from: '2027-10-02', to: today, suppressed: true });
});

test('a student with no check-in this week is not counted', () => {
  const rows = cohort(10).map((r) => (r.userId === 'u0' ? { ...r, date: '2027-09-20' } : r));
  expect(cohortReport(rows, [], today)).toEqual({ from: '2027-10-02', to: today, suppressed: true });
});

test('a day with fewer than 10 students is left out of the week means, so it cannot be recovered by subtraction', () => {
  // 12 students check in with energy 3 on six days; on the quiet day only one student checks in, with energy 5.
  const quietDay = addDays(today, -1);
  const rows: CohortCheckin[] = [];
  for (let i = 0; i < 12; i++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(today, -d);
      if (date === quietDay && i > 0) continue;
      rows.push({ userId: `u${i}`, date, fullness: 3, energy: date === quietDay ? 5 : 3, focus: 3, training: 'none', skipped: 'none', synthetic: false });
    }
  }
  const report = cohortReport(rows, [], today);
  expect(report.suppressed).toBe(false);
  expect(report.checkins).toBe(12 * 6);
  expect(report.meanEnergy).toBe(3);
  // A 13th student seen only on the quiet day is not a participant either, as in the SQL staff_overview: otherwise
  // the report's count minus the overview's would single them out.
  const withLoner = cohortReport([...rows, { userId: 'u12', date: quietDay, fullness: 3, energy: 5, focus: 3, training: 'none', skipped: 'none', synthetic: false }], [], today);
  expect(withLoner.students).toBe(12);
  expect(Object.values(withLoner.states!).reduce((a, b) => a + b, 0)).toBe(12);
});
