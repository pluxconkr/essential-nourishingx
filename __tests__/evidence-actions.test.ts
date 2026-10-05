import schoolJson from '@/assets/data/school.json';
import { MAX_ACTIONS, actionsFor } from '@/domain/actions';
import { CLAUSE_INPUTS, buildEvidence, evidenceCategories } from '@/domain/evidence';
import type { Clause, Derived, School } from '@/domain/types';
import { en } from '@/i18n/en';

const school = schoolJson as unknown as School;
const CLAUSES: Clause[] = ['A', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'C4', 'D'];
const derived: Derived = { n: 7, skipped: 3, heavyDays: 4, lowEnergyDays: 3, lowFocusDays: 4, fullDelta: -0.7, energyMean: 2.4, focusMean: 2.1, fullMean: 2.9 };

describe('evidence is chosen by the firing clause', () => {
  test('every input a clause tests appears in its evidence', () => {
    for (const c of CLAUSES) {
      const cats = evidenceCategories(c);
      for (const input of CLAUSE_INPUTS[c]) expect(cats).toContain(input);
    }
  });
  test('exactly four lines for every clause except A; A has none', () => {
    expect(buildEvidence(derived, 'A')).toEqual([]);
    for (const c of CLAUSES.filter((x) => x !== 'A')) expect(buildEvidence(derived, c)).toHaveLength(4);
  });
  test('C4 shows focus, not energy; energy and focus never both appear', () => {
    const c4 = evidenceCategories('C4');
    expect(c4).toContain('focus');
    expect(c4).not.toContain('energy');
    for (const c of CLAUSES) {
      const cats = evidenceCategories(c);
      expect(cats.includes('energy') && cats.includes('focus')).toBe(false);
      expect(new Set(cats).size).toBe(cats.length);
    }
  });
  test('evidence carries integer counts and a direction word only', () => {
    for (const e of buildEvidence(derived, 'C1')) {
      expect(Number.isInteger(e.count)).toBe(true);
      if (e.category === 'fullness') expect(['down', 'steady', 'up']).toContain(e.direction);
    }
  });
  test('evidence templates contain no decimals, percentages or threshold symbols', () => {
    const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith('ev.') || k.startsWith('clause.') || k.startsWith('balance.') || k.startsWith('attention.') || k.startsWith('state.'));
    for (const k of keys) {
      const s: string = en[k];
      expect(s).not.toMatch(/\d\.\d/);
      expect(s).not.toMatch(/[%≥≤<>]/);
    }
  });
});

describe('actions', () => {
  test('≤ 3 per clause, from the school file, no digits', () => {
    for (const c of CLAUSES) {
      const a = actionsFor(c, school);
      expect(a.length).toBeLessThanOrEqual(MAX_ACTIONS);
      expect(a.length).toBeGreaterThan(0);
      for (const s of a) {
        expect(school.actionsByClause[c]).toContain(s);
        expect(s).not.toMatch(/\d/);
      }
    }
  });
});
