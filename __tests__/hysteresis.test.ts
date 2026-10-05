import { balanceFor } from '@/domain/balance';
import { scenarioCheckins } from '@/domain/demo';
import { attentionStreak, displayedStates, foldHysteresis, type RawDay } from '@/domain/hysteresis';
import type { School, StateWord } from '@/domain/types';
import schoolJson from '@/assets/data/school.json';

const school = schoolJson as unknown as School;
const seq = (...raws: (StateWord | [StateWord, boolean])[]): RawDay[] => raws.map((r) => (Array.isArray(r) ? { raw: r[0], hasCheckin: r[1] } : { raw: r, hasCheckin: true }));
const shown = (days: RawDay[]) => foldHysteresis(days).map((x) => x.shown);

describe('foldHysteresis', () => {
  test('worsens immediately', () => {
    expect(shown(seq('stable', 'watch'))).toEqual(['stable', 'watch']);
    expect(shown(seq('watch', 'attention'))).toEqual(['watch', 'attention']);
    expect(shown(seq('stable', 'attention'))).toEqual(['stable', 'attention']);
  });
  test('improves only after three qualifying check-in days', () => {
    expect(shown(seq('attention', 'stable', 'stable', 'stable'))).toEqual(['attention', 'attention', 'attention', 'stable']);
    expect(foldHysteresis(seq('attention', 'stable')).map((x) => x.held)).toEqual([false, true]);
  });
  test('ten bad days then one good day stays held (no date-based reset)', () => {
    const days = seq(...Array<StateWord>(10).fill('attention'), 'stable');
    expect(shown(days).at(-1)).toBe('attention');
  });
  test('days without a check-in neither count nor break the run', () => {
    const days = seq('attention', ['stable', false], ['stable', false], ['stable', false], ['stable', true], ['stable', true], ['stable', true]);
    expect(shown(days)).toEqual(['attention', 'attention', 'attention', 'attention', 'attention', 'attention', 'stable']);
  });
  test('improves to the most severe raw state among the three qualifying days', () => {
    expect(shown(seq('attention', 'stable', 'watch', 'stable')).at(-1)).toBe('watch');
  });
  test('a nodata gap shorter than 7 days keeps the carried word', () => {
    const days = seq('attention', 'nodata', 'nodata', 'nodata', 'stable');
    expect(shown(days)).toEqual(['attention', 'nodata', 'nodata', 'nodata', 'attention']);
  });
  test('seven consecutive nodata days reset the fold', () => {
    const days = seq('attention', ...Array<StateWord>(7).fill('nodata'), 'stable');
    expect(shown(days).at(-1)).toBe('stable');
  });
  test('a qualifying run is broken by a day equal to the carried word', () => {
    expect(shown(seq('watch', 'stable', 'stable', 'watch', 'stable')).at(-1)).toBe('watch');
  });
});

describe('displayedStates and balanceFor on the demo weeks', () => {
  const today = '2027-10-08';
  test.each([
    ['watch', 'watch', 'C1'],
    ['stable', 'stable', 'D'],
    ['attention', 'attention', 'B1'],
    ['sparse', 'nodata', 'A'],
  ] as const)('%s week shows %s (%s)', (scenario, word, clause) => {
    const b = balanceFor(scenarioCheckins(scenario, today), today, school);
    expect(b.state).toBe(word);
    expect(b.clause).toBe(clause);
    expect(b.held).toBe(false);
  });
  test('attention streak counts consecutive displayed attention days', () => {
    const days = displayedStates(scenarioCheckins('attention', today), today);
    expect(attentionStreak(days)).toBeGreaterThanOrEqual(1);
    expect(attentionStreak(displayedStates(scenarioCheckins('stable', today), today))).toBe(0);
  });
  test('nodata renders no evidence and the A action; others render four lines and ≤ 3 actions', () => {
    const sparse = balanceFor(scenarioCheckins('sparse', today), today, school);
    expect(sparse.evidence).toEqual([]);
    expect(sparse.actions).toEqual(school.actionsByClause.A);
    for (const s of ['watch', 'stable', 'attention'] as const) {
      const b = balanceFor(scenarioCheckins(s, today), today, school);
      expect(b.evidence).toHaveLength(4);
      expect(b.actions.length).toBeLessThanOrEqual(3);
      expect(b.actions.length).toBeGreaterThan(0);
    }
  });
});
