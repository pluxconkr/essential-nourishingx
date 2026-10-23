import {
  atwaterKcal,
  checkDeep,
  chooseTier,
  costUsd,
  nextTier,
  worstCaseCostUsd,
  type Deep,
  type DeepItem,
  type Triage,
} from '../supabase/functions/_shared/meal-router';

const triage = (over: Partial<Triage> = {}): Triage => ({
  is_food: true,
  items: [{ name: 'banana', amount: '1 medium' }],
  signals: [],
  difficulty: 'easy',
  photo_quality: 'good',
  confidence: 'high',
  reason: 'test',
  ...over,
});

// Roughly USDA-like values; the tests check the validator's arithmetic, not nutrition facts.
const chicken: DeepItem = { name: 'grilled chicken breast', portion: '1 piece', grams: 120, kcal: 198, protein_g: 37.2, carbs_g: 0, fat_g: 4.3, fiber_g: 0, group: 'protein', confidence: 'high' };
const rice: DeepItem = { name: 'white rice', portion: '1 cup', grams: 158, kcal: 205, protein_g: 4.3, carbs_g: 44.5, fat_g: 0.4, fiber_g: 0.6, group: 'grains', confidence: 'high' };
const broccoli: DeepItem = { name: 'steamed broccoli', portion: '1 cup', grams: 91, kcal: 31, protein_g: 2.5, carbs_g: 6, fat_g: 0.3, fiber_g: 2.4, group: 'vegetables', confidence: 'medium' };
const deep = (over: Partial<Deep> = {}): Deep => ({ items: [chicken, rice, broccoli], kcal_low: 380, kcal_high: 520, uncertain: ['amount of oil'], confidence: 'medium', ...over });

describe('chooseTier', () => {
  const rich = 100;
  test('difficulty picks the tier: easy → haiku, medium → opus, hard → fable', () => {
    expect(chooseTier(triage(), rich).tier).toBe('haiku');
    expect(chooseTier(triage({ difficulty: 'medium' }), rich).tier).toBe('opus');
    expect(chooseTier(triage({ difficulty: 'hard' }), rich).tier).toBe('fable');
  });
  test('low triage confidence or a poor photo moves one tier up', () => {
    expect(chooseTier(triage({ confidence: 'low' }), rich).tier).toBe('opus');
    expect(chooseTier(triage({ difficulty: 'medium', photo_quality: 'poor' }), rich).tier).toBe('fable');
    expect(chooseTier(triage({ difficulty: 'hard', confidence: 'low' }), rich).tier).toBe('fable');
  });
  test('a small budget moves the tier down, never up', () => {
    expect(chooseTier(triage({ difficulty: 'hard' }), worstCaseCostUsd('opus') + 0.0001).tier).toBe('opus');
    expect(chooseTier(triage({ difficulty: 'hard' }), 0.01).tier).toBe('haiku');
    const r = chooseTier(triage({ difficulty: 'hard' }), 0.01);
    expect(r.why.some((w) => w.includes('budget'))).toBe(true);
  });
});

test('nextTier climbs haiku → opus → fable and stops', () => {
  expect(nextTier('haiku')).toBe('opus');
  expect(nextTier('opus')).toBe('fable');
  expect(nextTier('fable')).toBeNull();
});

test('costUsd prices tokens per model and prices unknown models as Fable', () => {
  expect(costUsd('claude-haiku-5-5', { input_tokens: 1000, output_tokens: 500 })).toBeCloseTo((1000 * 0.1 + 500 * 0.5) / 1e6, 9);
  expect(costUsd('claude-opus-5-5', { input_tokens: 2000, output_tokens: 1000, cache_read_input_tokens: 1000 })).toBeCloseTo((2000 * 4 + 1000 * 20 + 1000 * 0.2) / 1e6, 9);
  expect(costUsd('some-new-model', { input_tokens: 1000, output_tokens: 1000 })).toBe(costUsd('claude-fable-5-1', { input_tokens: 1000, output_tokens: 1000 }));
  expect(worstCaseCostUsd('fable')).toBeGreaterThan(worstCaseCostUsd('opus'));
  expect(worstCaseCostUsd('opus')).toBeGreaterThan(worstCaseCostUsd('haiku'));
});

describe('checkDeep', () => {
  test('atwaterKcal uses 4/4/9 and about 2 kcal per gram of fibre', () => {
    expect(atwaterKcal({ protein_g: 10, carbs_g: 10, fat_g: 10, fiber_g: 5 })).toBe(40 + 40 + 90 - 10);
  });
  test('a consistent plate passes and totals are recomputed from the items', () => {
    const c = checkDeep(deep());
    expect(c.problems).toEqual([]);
    expect(c.ok).toBe(true);
    expect(c.result?.kcal).toBe(198 + 205 + 31);
    expect(c.result?.protein_g).toBeCloseTo(37.2 + 4.3 + 2.5, 5);
    expect(c.result?.groups).toEqual(['protein', 'grains', 'vegetables']);
    expect(c.result?.kcal_low).toBeLessThanOrEqual(434);
    expect(c.result?.kcal_high).toBeGreaterThanOrEqual(434);
  });
  test('energy far from the macros fails, so the photo goes one tier up', () => {
    const c = checkDeep(deep({ items: [{ ...chicken, kcal: 900 }] }));
    expect(c.ok).toBe(false);
    expect(c.problems.join(' ')).toMatch(/900 kcal vs/);
  });
  test('macros heavier than the food fail', () => {
    expect(checkDeep(deep({ items: [{ ...rice, grams: 20 }] })).ok).toBe(false);
  });
  test('fibre above total carbohydrate fails', () => {
    expect(checkDeep(deep({ items: [{ ...broccoli, fiber_g: 9 }] })).ok).toBe(false);
  });
  test('the energy range always contains the estimate and stays within 0.5x-1.8x', () => {
    const c = checkDeep(deep({ kcal_low: 0, kcal_high: 99999 }));
    expect(c.result?.kcal_low).toBe(Math.round(434 * 0.5));
    expect(c.result?.kcal_high).toBe(Math.round(434 * 1.8));
    const narrow = checkDeep(deep({ kcal_low: 434, kcal_high: 434 }));
    expect(narrow.result?.kcal_low).toBe(Math.round(434 * 0.9));
    expect(narrow.result?.kcal_high).toBe(Math.round(434 * 1.1));
  });
  test('judgement words in "hard to judge" notes are dropped; product names are kept', () => {
    const c = checkDeep(deep({ items: [{ ...chicken, name: 'Diet Coke', group: 'drinks', grams: 355, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 }], uncertain: ['too much sauce', 'amount of dressing', 'unhealthy oil'] }));
    expect(c.ok).toBe(true);
    expect(c.result?.items[0].name).toBe('Diet Coke');
    expect(c.result?.uncertain).toEqual(['amount of dressing']);
  });
  test('an empty plate fails', () => {
    expect(checkDeep(deep({ items: [] })).ok).toBe(false);
  });
});
