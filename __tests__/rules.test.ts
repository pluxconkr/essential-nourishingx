import { scenarioCheckins } from '@/domain/demo';
import { mealsIn } from '@/domain/meals';
import { TH, derive, evaluateRules, windowFor } from '@/domain/rules';
import type { Checkin, Derived, MealLog } from '@/domain/types';

const base: Derived = { n: 7, skipped: 0, heavyDays: 0, lowEnergyDays: 0, lowFocusDays: 0, fullDelta: 0, energyMean: 4, focusMean: 4, fullMean: 4, mealsLogged: 0, lowProteinMeals: 0, heavyDaysLogged: 0, heavyDaysLowCarb: 0 };
const d = (o: Partial<Derived>): Derived => ({ ...base, ...o });

describe('thresholds: prototype values plus the meal-photo values in docs/thresholds.md', () => {
  test('TH', () => {
    expect(TH).toEqual({
      minCheckins: 4, b1_skipped: 5, b1_heavy: 3, b2_lowEnergy: 5, b2_fullDelta: -1.0, b3_skipped: 3, b3_heavy: 4, b3_fullDelta: -0.5, b3_energyMean: 2.2, c1_skipped: 3, c1_heavy: 4, c2_lowEnergy: 3, c2_skipped: 2, c3_fullDelta: -1.0, c3_heavy: 2, c4_lowFocus: 4, c4_skipped: 2,
      meal_lowProtein_g: 10, c5_minMeals: 4, c5_lowShare: 0.75, c6_minMealsPerDay: 2, c6_lowCarb_g: 60, c6_heavyDaysLowCarb: 2,
    });
  });
});

describe('clause boundaries (first match wins)', () => {
  test('A: fewer than 4 check-ins → nodata; 4 → describable', () => {
    expect(evaluateRules(d({ n: 3 }))).toEqual({ state: 'nodata', clause: 'A' });
    expect(evaluateRules(d({ n: 4 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('B1: skipped ≥ 5 and heavy ≥ 3', () => {
    expect(evaluateRules(d({ skipped: 5, heavyDays: 3 }))).toEqual({ state: 'attention', clause: 'B1' });
    expect(evaluateRules(d({ skipped: 4, heavyDays: 3 }))).toEqual({ state: 'stable', clause: 'D' });
    expect(evaluateRules(d({ skipped: 5, heavyDays: 2 })).clause).not.toBe('B1');
  });
  test('B2: lowEnergy ≥ 5 and fullDelta ≤ −1.0', () => {
    expect(evaluateRules(d({ lowEnergyDays: 5, fullDelta: -1.0 }))).toEqual({ state: 'attention', clause: 'B2' });
    expect(evaluateRules(d({ lowEnergyDays: 5, fullDelta: -0.9 }))).toEqual({ state: 'stable', clause: 'D' });
    expect(evaluateRules(d({ lowEnergyDays: 4, fullDelta: -1.0 })).clause).not.toBe('B2');
  });
  test('B3: all four conditions; relaxing any one falls through to C1', () => {
    const b3 = d({ skipped: 3, heavyDays: 4, fullDelta: -0.5, energyMean: 2.2 });
    expect(evaluateRules(b3)).toEqual({ state: 'attention', clause: 'B3' });
    expect(evaluateRules({ ...b3, energyMean: 2.3 })).toEqual({ state: 'watch', clause: 'C1' });
    expect(evaluateRules({ ...b3, fullDelta: -0.4 })).toEqual({ state: 'watch', clause: 'C1' });
    expect(evaluateRules({ ...b3, heavyDays: 3 }).clause).not.toBe('B3');
    expect(evaluateRules({ ...b3, skipped: 2 }).clause).not.toBe('B3');
  });
  test('C1: skipped ≥ 3, heavy ≥ 4, fullness falling', () => {
    expect(evaluateRules(d({ skipped: 3, heavyDays: 4, fullDelta: -0.1 }))).toEqual({ state: 'watch', clause: 'C1' });
    expect(evaluateRules(d({ skipped: 3, heavyDays: 4, fullDelta: 0 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('C2: lowEnergy ≥ 3 and skipped ≥ 2', () => {
    expect(evaluateRules(d({ lowEnergyDays: 3, skipped: 2 }))).toEqual({ state: 'watch', clause: 'C2' });
    expect(evaluateRules(d({ lowEnergyDays: 2, skipped: 2 }))).toEqual({ state: 'stable', clause: 'D' });
    expect(evaluateRules(d({ lowEnergyDays: 3, skipped: 1 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('C3: fullDelta ≤ −1.0 and heavy ≥ 2', () => {
    expect(evaluateRules(d({ fullDelta: -1.0, heavyDays: 2 }))).toEqual({ state: 'watch', clause: 'C3' });
    expect(evaluateRules(d({ fullDelta: -1.0, heavyDays: 1 }))).toEqual({ state: 'stable', clause: 'D' });
    expect(evaluateRules(d({ fullDelta: -0.99, heavyDays: 2 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('C4: lowFocus ≥ 4 and skipped ≥ 2', () => {
    expect(evaluateRules(d({ lowFocusDays: 4, skipped: 2 }))).toEqual({ state: 'watch', clause: 'C4' });
    expect(evaluateRules(d({ lowFocusDays: 3, skipped: 2 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('C5: at least 4 photographed meals and at least three quarters below 10 g protein', () => {
    expect(evaluateRules(d({ mealsLogged: 4, lowProteinMeals: 3 }))).toEqual({ state: 'watch', clause: 'C5' });
    expect(evaluateRules(d({ mealsLogged: 4, lowProteinMeals: 2 }))).toEqual({ state: 'stable', clause: 'D' });
    expect(evaluateRules(d({ mealsLogged: 3, lowProteinMeals: 3 }))).toEqual({ state: 'stable', clause: 'D' });
    expect(evaluateRules(d({ mealsLogged: 8, lowProteinMeals: 6 }))).toEqual({ state: 'watch', clause: 'C5' });
    expect(evaluateRules(d({ mealsLogged: 8, lowProteinMeals: 5 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('C6: at least 2 heavy training days whose photographed meals had little carbohydrate', () => {
    expect(evaluateRules(d({ heavyDaysLogged: 2, heavyDaysLowCarb: 2 }))).toEqual({ state: 'watch', clause: 'C6' });
    expect(evaluateRules(d({ heavyDaysLogged: 3, heavyDaysLowCarb: 1 }))).toEqual({ state: 'stable', clause: 'D' });
  });
  test('meal clauses come after every check-in clause and never say attention', () => {
    expect(evaluateRules(d({ lowEnergyDays: 3, skipped: 2, mealsLogged: 4, lowProteinMeals: 4 })).clause).toBe('C2');
    expect(evaluateRules(d({ mealsLogged: 21, lowProteinMeals: 21, heavyDaysLogged: 7, heavyDaysLowCarb: 7 })).state).toBe('watch');
    expect(evaluateRules(d({ n: 3, mealsLogged: 21, lowProteinMeals: 21 })).clause).toBe('A');
  });
});

describe('derive with meal photos', () => {
  const today = '2027-10-08';
  const day = (date: string, training: Checkin['training']): Checkin => ({ date, fullness: 4, energy: 4, focus: 4, training, skipped: 'none', savedAt: '', durationS: null });
  const meal = (date: string, slot: MealLog['meal'], protein_g: number, carbs_g: number): MealLog => ({ date, meal: slot, protein_g, carbs_g });
  const week = ['2027-10-02', '2027-10-03', '2027-10-04', '2027-10-05', '2027-10-06', '2027-10-07', '2027-10-08'].map((x, i) => day(x, i < 3 ? 'heavy' : 'light'));

  test('several photos of one meal add up; snacks are not meals', () => {
    const meals = [meal('2027-10-05', 'lunch', 6, 40), meal('2027-10-05', 'lunch', 6, 10), meal('2027-10-05', 'snack', 1, 20), meal('2027-10-06', 'dinner', 4, 30)];
    const i = derive(windowFor(week, today), mealsIn(meals, today));
    expect(i.mealsLogged).toBe(2);
    expect(i.lowProteinMeals).toBe(1);
  });
  test('a heavy day counts only with at least two photographed main meals', () => {
    const meals = [meal('2027-10-02', 'breakfast', 20, 10), meal('2027-10-02', 'lunch', 30, 20), meal('2027-10-03', 'lunch', 30, 5), meal('2027-10-04', 'lunch', 25, 30), meal('2027-10-04', 'dinner', 25, 40)];
    const i = derive(windowFor(week, today), mealsIn(meals, today));
    expect(i.heavyDaysLogged).toBe(2);
    expect(i.heavyDaysLowCarb).toBe(1);
  });
  test('photos outside the 7-day window are ignored', () => {
    expect(mealsIn([meal('2027-10-01', 'lunch', 1, 1), meal('2027-10-02', 'lunch', 1, 1)], today)).toHaveLength(1);
  });
});

describe('derive over a window (prototype semantics)', () => {
  const today = '2027-10-08';
  test('watch week → C1', () => {
    const w = windowFor(scenarioCheckins('watch', today), today);
    const i = derive(w);
    expect(i).toMatchObject({ n: 7, skipped: 3, heavyDays: 4, lowEnergyDays: 3 });
    expect(i.fullDelta).toBeCloseTo(-1.17, 2);
    expect(evaluateRules(i)).toEqual({ state: 'watch', clause: 'C1' });
  });
  test('stable week → D', () => {
    const i = derive(windowFor(scenarioCheckins('stable', today), today));
    expect(evaluateRules(i)).toEqual({ state: 'stable', clause: 'D' });
    expect(i.fullDelta).toBeGreaterThan(0);
  });
  test('attention week → B1', () => {
    const i = derive(windowFor(scenarioCheckins('attention', today), today));
    expect(i).toMatchObject({ skipped: 7, heavyDays: 5 });
    expect(evaluateRules(i)).toEqual({ state: 'attention', clause: 'B1' });
  });
  test('sparse week → A', () => {
    const i = derive(windowFor(scenarioCheckins('sparse', today), today));
    expect(i.n).toBe(3);
    expect(evaluateRules(i)).toEqual({ state: 'nodata', clause: 'A' });
  });
  test('fullDelta is 0 when either side is empty; means round to 2 dp', () => {
    const w = windowFor(scenarioCheckins('sparse', today), today);
    expect(derive(w).fullDelta).toBe(0);
    expect(derive([]).n).toBe(0);
    expect(derive([]).energyMean).toBe(0);
  });
  test('windowFor returns seven slots oldest first, null where no check-in', () => {
    const w = windowFor(scenarioCheckins('sparse', today), today);
    expect(w).toHaveLength(7);
    expect(w.map((c) => (c ? c.date : null))).toEqual([null, null, '2027-10-04', null, null, '2027-10-07', '2027-10-08']);
  });
});
