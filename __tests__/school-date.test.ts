/** schoolDate (src/domain/time.ts): the New Hampshire calendar day, the one every server rule and staff total uses. */
import { schoolDate } from '@/domain/time';

test('the school day follows US Eastern time, summer and winter', () => {
  expect(schoolDate(new Date('2026-10-24T03:30:00Z'))).toBe('2026-10-23'); // 23:30 EDT (UTC−4)
  expect(schoolDate(new Date('2026-10-24T04:00:00Z'))).toBe('2026-10-24'); // midnight EDT
  expect(schoolDate(new Date('2026-12-01T04:59:00Z'))).toBe('2026-11-30'); // 23:59 EST (UTC−5)
  expect(schoolDate(new Date('2026-12-01T05:00:00Z'))).toBe('2026-12-01');
});

test('it is always YYYY-MM-DD, the form the database and the upload window compare', () => {
  expect(schoolDate(new Date('2027-01-05T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
