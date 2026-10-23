/** Staff dashboard wording: the student rules that apply to adults too, and every dynamically built key exists. */
import { COUNTERS } from '@/domain/counters';
import { staffStrings, type StaffKey } from '@/i18n/staff';

import { FOOD_GROUPS } from '../supabase/functions/_shared/meal-router';

const FORBIDDEN = /\b(diagnos\w*|RED-S|disorders?|because|causes?|caused|leads? to|results? in|due to|proves?)\b|!/i;

test('no diagnosis or causal wording and no "!" anywhere on the dashboard', () => {
  const offenders = Object.entries(staffStrings)
    .filter(([, s]) => FORBIDDEN.test(s))
    .map(([k, s]) => `${k}: ${s}`);
  expect(offenders).toEqual([]);
});

test('keys the views build at runtime all exist', () => {
  const dynamic: string[] = [
    ...FOOD_GROUPS.map((g) => `group.${g}`),
    ...['easy', 'medium', 'hard'].map((d) => `meals.difficulty.${d}`),
    ...['triage', 'deep', 'retry', 'prose'].map((s) => `step.${s}`),
    ...['feed', 'points', 'friends', 'waste', 'weight', 'targets', 'menuApi', 'simulator', 'chatbot', 'alerts'].flatMap((k) => [`scope.${k}`, `scope.${k}.why`, `scope.${k}.ask`]),
    ...Object.keys(COUNTERS).flatMap((k) => [`counter.${k}`, `counter.${k}.why`]),
  ];
  expect(dynamic.filter((k) => !(k in staffStrings))).toEqual([]);
  const sample: StaffKey = 'nav.overview';
  expect(staffStrings[sample]).toBe('Weekly overview');
});
