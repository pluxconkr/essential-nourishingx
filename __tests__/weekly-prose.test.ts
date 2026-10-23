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
  expect(checkProse(templateProse(week, previous), week, previous)).toEqual([]);
  const small: WeekNumbers = { from: '2027-10-02', to: today, suppressed: true };
  expect(checkProse(templateProse(small), small)).toEqual([]);
  expect(templateProse(week).confidence).toBe('Low'); // the cohort is all simulated
});

test('a number the table does not hold is rejected', () => {
  expect(checkProse(prose([`Energy fell by 0.37 this week.`]), week, previous)).toEqual([expect.stringContaining('numbers not in the table: 0.37')]);
  expect(checkProse(prose([`Mean energy was ${week.meanEnergy}.`]), week, previous)).toEqual([]);
  expect(checkProse(prose([`Between ${week.from} and ${week.to}, on the 1-5 scale, energy was ${week.meanEnergy}.`]), week, previous)).toEqual([]);
});

test('the confidence sentence may name the High bar and the two weeks the table holds, without counting them', () => {
  // Every model answer was rejected for "only two weeks are available" until PROSE_SYSTEM said how to put it.
  expect(checkProse(prose([`Mean energy was ${week.meanEnergy}.`], 'Most participants are simulated and the table covers only this week and the previous week, not 4 or more weeks.'), week, previous)).toEqual([]);
  expect(checkProse(prose([`Mean energy was ${week.meanEnergy}.`], 'Only two weeks are available.'), week, previous)).toEqual(['number written as a word: "two"']);
});

test('date parts, boilerplate digits and spelled-out numbers cannot carry a made-up figure', () => {
  // Sentences that passed the earlier check because "5", "10" or a date part appeared somewhere in the table.
  const values = new Set(Object.values(week.states!).map(String));
  const unused = ['5', '10', '11', '17', '23', '27'].filter((n) => !values.has(n) && n !== String(week.attentionStreak3));
  for (const n of unused) expect(checkProse(prose([`Watch went up by ${n} this week.`]), week, previous)).toEqual([expect.stringContaining('numbers not in the table')]);
  for (const s of ['Two more participants were at Watch.', 'Stable doubled since last week.', 'Skipped meals rose by 3 percentage points.']) {
    expect(checkProse(prose([s]), week, previous).some((p) => p.startsWith('number written as a word') || p.startsWith('numbers not in the table'))).toBe(true);
  }
});

test('causal, diagnostic and "students" wording is rejected', () => {
  for (const s of ['Energy dropped because of exams.', 'Skipping leads to low focus.', 'This suggests a risk of RED-S.', 'Most students were stable.', 'Due to training, fullness fell.']) {
    expect(checkProse(prose([s]), week, previous).some((p) => p.startsWith('forbidden word'))).toBe(true);
  }
});

test('more than 180 words is rejected', () => {
  expect(checkProse(prose([Array.from({ length: 181 }, () => 'participants').join(' ')]), week, previous)).toEqual(['181 words (limit 180)']);
});
