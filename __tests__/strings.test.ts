/**
 * Wording operations as code (spec §14). A student-facing string fails if it could be read as
 * (a) a diagnosis, (b) a calorie or weight target, (c) a judgement about a body, (d) guilt about a missed day,
 * or (e) a promise the app cannot keep. Only the allow-listed IDs may contain a forbidden word.
 */
import schoolJson from '@/assets/data/school.json';
import type { School } from '@/domain/types';
import { en, type Key } from '@/i18n/en';
import { FORBIDDEN_ALLOWLIST, inventory } from '@/i18n/inventory';

const school = schoolJson as unknown as School;

const FORBIDDEN: { group: string; re: RegExp }[] = [
  { group: 'a diagnosis', re: /\b(diagnos\w*|RED-S|syndromes?|disorders?|risks?|probabilit\w*)\b/i },
  { group: 'a calorie or weight target', re: /\b(calories?|kcal|weight|BMI)\b|\b(eat|drink)\s+\d/i },
  { group: 'a judgement about a body', re: /\b(body|bodies|fat|thin|skinny|overweight|underweight)\b/i },
  { group: 'guilt about a missed day', re: /\b(streaks?|chain|missed|lost|failed)\b|!/i },
  { group: 'a promise the app cannot keep', re: /\b(prevents?|protects?|guarantees?|detects?|cures?)\b|\bwill improve\b/i },
];

const studentKeys = (Object.keys(en) as Key[]).filter((k) => inventory[k].audience !== 'internal');

describe('string inventory', () => {
  test('every key has an inventory row with an audience and an owner', () => {
    for (const k of Object.keys(en) as Key[]) {
      expect(inventory[k]).toBeDefined();
      expect(inventory[k].owner.length).toBeGreaterThan(0);
    }
  });
  test('STRINGS_GATE: every student-facing string has been reviewed', () => {
    if (process.env.STRINGS_GATE !== '1') return;
    for (const k of studentKeys) expect(inventory[k].reviewedOn).not.toBeNull();
  });
});

describe('rejection tests', () => {
  test('forbidden words appear only in allow-listed string IDs', () => {
    const offenders: string[] = [];
    for (const k of studentKeys) {
      if (FORBIDDEN_ALLOWLIST.includes(k)) continue;
      for (const { group, re } of FORBIDDEN) if (re.test(en[k])) offenders.push(`${k} (${group}): "${en[k]}"`);
    }
    expect(offenders).toEqual([]);
  });
  test('allow-listed IDs do contain a forbidden word (otherwise the allow-list is stale)', () => {
    for (const k of FORBIDDEN_ALLOWLIST) expect(FORBIDDEN.some(({ re }) => re.test(en[k]))).toBe(true);
  });
  test('no percentage sign and no probability anywhere a student reads', () => {
    for (const k of studentKeys) expect(en[k]).not.toMatch(/%/);
  });
  test('action templates obey the same rules and carry no numbers', () => {
    for (const list of Object.values(school.actionsByClause)) {
      for (const s of list) {
        expect(s).not.toMatch(/\d/);
        for (const { re } of FORBIDDEN) expect(s).not.toMatch(re);
      }
    }
  });
});
