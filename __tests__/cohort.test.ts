/** The staff weekly report: the phone's balanceFor per student, reduced to counts, suppressed below 10 students. */
import schoolJson from '@/assets/data/school.json';
import { balanceFor } from '@/domain/balance';
import { MIN_GROUP, cohortReport, type CohortCheckin } from '@/domain/cohort';
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

test('fewer than 10 students suppresses the whole week: no states, no clauses', () => {
  const report = cohortReport(cohort(MIN_GROUP - 1), [], today);
  expect(report).toEqual({ from: '2027-10-02', to: today, students: 9, suppressed: true });
});

test('a student with no check-in this week is not counted', () => {
  const rows = cohort(10).map((r) => (r.userId === 'u0' ? { ...r, date: '2027-09-20' } : r));
  expect(cohortReport(rows, [], today)).toMatchObject({ students: 9, suppressed: true });
});
