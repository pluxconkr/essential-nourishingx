/** Weekly report prose checks (plan "weekly batch" validators) and the template that stands in for the model. */
import { cohortReport } from '@/domain/cohort';
import { generate } from '@/domain/synthetic';

import { checkProse, displayTable, templateProse, type Prose, type WeekNumbers } from '../supabase/functions/_shared/weekly-prose';

const today = '2027-10-08';
const cohort = generate(today);
const rows = cohort.checkins.map((c) => ({ ...c, date: c.day, synthetic: true }));
const meals = cohort.meals.map((m) => ({ userId: m.userId, date: m.day, meal: m.meal, protein_g: m.protein_g, carbs_g: m.carbs_g }));
const week: WeekNumbers = cohortReport(rows, meals, today);
const previous: WeekNumbers = cohortReport(rows, meals, '2027-10-01');
const table = displayTable(week, previous);

const prose = (paragraphs: string[], why = 'It describes this week only.'): Prose => ({ paragraphs, confidence: 'Medium', why });

test('the table carries only group numbers: no ids, nothing per participant', () => {
  expect(table).not.toMatch(/0000-4000|userId|user_id/);
  expect(table).toContain(`Participants: ${week.students}`);
  expect(table).toContain('Groups under 10 participants are never reported');
});

test('the template passes its own checks, for a reported and a suppressed week', () => {
  expect(checkProse(templateProse(week, previous), table)).toEqual([]);
  const small: WeekNumbers = { from: '2027-10-02', to: today, students: 4, suppressed: true };
  expect(checkProse(templateProse(small), displayTable(small))).toEqual([]);
  expect(templateProse(week).confidence).toBe('Low'); // the cohort is all simulated
});

test('a number the table does not hold is rejected', () => {
  expect(checkProse(prose([`Energy fell by 0.37 this week.`]), table)).toEqual([expect.stringContaining('numbers not in the table: 0.37')]);
  expect(checkProse(prose([`Mean energy was ${week.meanEnergy}.`]), table)).toEqual([]);
});

test('causal, diagnostic and "students" wording is rejected', () => {
  for (const s of ['Energy dropped because of exams.', 'Skipping leads to low focus.', 'This suggests a risk of RED-S.', 'Most students were stable.', 'Due to training, fullness fell.']) {
    expect(checkProse(prose([s]), table).some((p) => p.startsWith('forbidden word'))).toBe(true);
  }
});

test('more than 180 words is rejected', () => {
  expect(checkProse(prose([Array.from({ length: 181 }, () => 'participants').join(' ')]), table)).toEqual(['181 words (limit 180)']);
});
