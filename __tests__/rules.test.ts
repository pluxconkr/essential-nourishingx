import { scenarioCheckins } from '@/domain/demo';
import { TH, derive, evaluateRules, windowFor } from '@/domain/rules';
import type { Derived } from '@/domain/types';

const base: Derived = { n: 7, skipped: 0, heavyDays: 0, lowEnergyDays: 0, lowFocusDays: 0, fullDelta: 0, energyMean: 4, focusMean: 4, fullMean: 4 };
const d = (o: Partial<Derived>): Derived => ({ ...base, ...o });

describe('thresholds are the prototype values', () => {
  test('TH', () => {
    expect(TH).toEqual({ minCheckins: 4, b1_skipped: 5, b1_heavy: 3, b2_lowEnergy: 5, b2_fullDelta: -1.0, b3_skipped: 3, b3_heavy: 4, b3_fullDelta: -0.5, b3_energyMean: 2.2, c1_skipped: 3, c1_heavy: 4, c2_lowEnergy: 3, c2_skipped: 2, c3_fullDelta: -1.0, c3_heavy: 2, c4_lowFocus: 4, c4_skipped: 2 });
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
