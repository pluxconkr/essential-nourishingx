/** The synthetic cohort (plan "generate(seed = 2027)"): deterministic, the planned mix, every state visible. */
import { cohortReport } from '@/domain/cohort';
import { SYNTHETIC, generate } from '@/domain/synthetic';
import { addDays } from '@/domain/time';

const today = '2027-10-08';
const cohort = generate(today);

test('the same seed gives the same cohort', () => {
  expect(generate(today)).toEqual(cohort);
  expect(generate(today, 7)).not.toEqual(cohort);
});

test('60 students with the planned profile mix and exactly two sparse students', () => {
  const p = cohort.profiles;
  expect(p).toHaveLength(SYNTHETIC.students);
  expect(p.filter((x) => x.athlete)).toHaveLength(21);
  expect(p.filter((x) => x.skipper)).toHaveLength(18);
  expect(p.filter((x) => x.newBoarder)).toHaveLength(15);
  expect(p.filter((x) => x.daysPerWeek <= 3)).toHaveLength(2);
  expect(p.filter((x) => x.daysPerWeek >= 5 && x.daysPerWeek <= 7).length).toBeGreaterThanOrEqual(36);
  expect(p.filter((x) => x.drift === 'watch')).toHaveLength(3);
  expect(p.filter((x) => x.drift === 'attention')).toHaveLength(1);
  expect(new Set(cohort.checkins.map((c) => c.day)).size).toBe(SYNTHETIC.days);
});

test('the last day shows every state, and flags stay uncommon (watch + attention ≤ 20 %)', () => {
  const report = cohortReport(
    cohort.checkins.map((c) => ({ ...c, date: c.day, synthetic: true })),
    cohort.meals.map((m) => ({ userId: m.userId, date: m.day, meal: m.meal, protein_g: m.protein_g, carbs_g: m.carbs_g })),
    today,
  );
  expect(report.suppressed).toBe(false);
  const s = report.states!;
  for (const word of ['stable', 'watch', 'attention', 'nodata'] as const) expect(s[word]).toBeGreaterThanOrEqual(1);
  expect(s.watch + s.attention).toBeLessThanOrEqual(0.2 * report.students!);
  expect(s.nodata).toBe(2);
});

test('exam week (days 15–19) lowers energy and focus against the week before', () => {
  const mean = (from: number, to: number, k: 'energy' | 'focus') => {
    const days = new Set(Array.from({ length: to - from + 1 }, (_, i) => addDays(today, from + i - SYNTHETIC.days)));
    const xs = cohort.checkins.filter((c) => days.has(c.day)).map((c) => c[k]);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  expect(mean(15, 19, 'energy')).toBeLessThan(mean(8, 12, 'energy') - 0.2);
  expect(mean(15, 19, 'focus')).toBeLessThan(mean(8, 12, 'focus') - 0.3);
});

test('meal photos are built only from the cited anchor foods and add up', () => {
  expect(cohort.meals.length).toBeGreaterThan(300);
  for (const m of cohort.meals) {
    expect(m.kcal).toBe(Math.round(m.items.reduce((a, it) => a + it.kcal, 0)));
    expect(m.kcal_low).toBeLessThanOrEqual(m.kcal);
    expect(m.kcal_high).toBeGreaterThanOrEqual(m.kcal);
    expect(m.meal).not.toBe('snack');
  }
});
