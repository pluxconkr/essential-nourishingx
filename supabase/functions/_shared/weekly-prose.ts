/**
 * Weekly staff report prose — every part that needs no network (ADR 0001; plan "weekly batch").
 * One call to PROSE_MODEL (Claude Opus 5.5, effort low) turns the already-suppressed table into at most 180 words for
 * Dining Services and the Health Center. checkProse runs on whatever comes back; anything that fails is replaced by
 * templateProse, which passes the same checks. Imported by the weekly-report Edge Function (Deno) and by
 * __tests__/weekly-prose.test.ts (Node), so it has no Deno, SDK or relative imports — only zod.
 */
import { z } from 'zod';

/** Room for Opus 5.5's thinking plus at most 180 words; the table itself is under 1K tokens. */
export const PROSE_MAX_TOKENS = 4000;
export const PROSE_WORST_INPUT_TOKENS = 3000;

export const ProseSchema = z.object({
  paragraphs: z.array(z.string().min(1)).min(1).max(3),
  confidence: z.enum(['High', 'Medium', 'Low']),
  why: z.string().min(1).max(300),
});
export type Prose = z.infer<typeof ProseSchema>;

/** The report numbers this module reads (the shape of src/domain/cohort.ts CohortReport, kept structural). */
export interface WeekNumbers {
  from: string;
  to: string;
  students?: number;
  suppressed: boolean;
  syntheticShare?: number;
  checkins?: number;
  meanEnergy?: number;
  meanFullness?: number;
  meanFocus?: number;
  skippedShare?: number;
  heavyShare?: number;
  states?: Record<'stable' | 'watch' | 'attention' | 'nodata', number>;
  attentionStreak3?: number;
  mealStudents?: number;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

/** The only thing the model sees: the numbers the dashboard shows, formatted the way it shows them. */
export function displayTable(week: WeekNumbers, previous?: WeekNumbers | null): string {
  const lines = [`Week ${week.from} to ${week.to}. Groups under 10 participants are never reported.`];
  if (week.suppressed || !week.states) return [...lines, `Participants this week: fewer than 10, so nothing else is reported.`].join('\n');
  lines.push(
    `Participants: ${week.students} (${pct(week.syntheticShare ?? 0)} of them simulated)`,
    `Check-ins: ${week.checkins}`,
    `Mean ratings on the 1-5 scale: energy ${week.meanEnergy}, fullness ${week.meanFullness}, focus ${week.meanFocus}`,
    `Check-ins with a skipped meal: ${pct(week.skippedShare ?? 0)}`,
    `Check-ins with heavy training: ${pct(week.heavyShare ?? 0)}`,
    `Balance words from the same rules as the phone: Stable ${week.states.stable}, Watch ${week.states.watch}, Needs attention ${week.states.attention}, Not enough data ${week.states.nodata}`,
    `Participants at Needs attention 3 or more days in a row: ${week.attentionStreak3}`,
    `Participants who added at least one meal photo: ${week.mealStudents ?? 'fewer than 10'}`,
  );
  if (previous && !previous.suppressed && previous.states) {
    lines.push(
      `Previous week (${previous.from} to ${previous.to}): participants ${previous.students}; mean energy ${previous.meanEnergy}, fullness ${previous.meanFullness}, focus ${previous.meanFocus}; skipped a meal ${pct(previous.skippedShare ?? 0)}; Stable ${previous.states.stable}, Watch ${previous.states.watch}, Needs attention ${previous.states.attention}, Not enough data ${previous.states.nodata}`,
    );
  }
  return lines.join('\n');
}

export const PROSE_SYSTEM = `You write the weekly summary on a boarding school's NourishingX staff dashboard. Readers: Dining Services and the Health Center.
The table you get is all there is: group numbers only, already checked so that no group under 10 participants appears.

Write at most 180 words in 1 to 3 short paragraphs of plain English.
- Always give this week's four Balance word counts (Stable, Watch, Needs attention, Not enough data) and the number at Needs attention 3 or more days in a row; the Health Center reads those first.
- Use only numbers that appear in the table, written as digits exactly as the table shows them, and dates as YYYY-MM-DD. Never work out a new number (no differences, sums, ratios or percentages of your own) and never spell a number as a word.
- Say "participants", never "students".
- Describe what the numbers show; do not explain why. Do not write "because", "cause", "due to", "leads to", "results in", "proves" or "improves health".
- No health or diagnostic language: never "diagnosis", "risk", "RED-S", "disorder" or similar. The Balance words are rules about check-ins, not a health assessment.
- Never single out a person. You may name one thing about the group or the dining hall worth watching next week.
- If many participants are simulated, say so plainly.
Then give your confidence in the summary as one word: High (the pattern holds across 4 or more weeks), Medium (true of this week), Low (suggestive only, for example mostly simulated data or few check-ins), and one sentence on why. That sentence follows the same number rules: the table holds this week and the previous one, so write "this week and the previous week" instead of counting the weeks.`;

const FORBIDDEN = /\b(because|causes?|caused|causing|leads? to|led to|results? in|due to|proves?|improves? health|diagnos\w*|RED-S|risks?|disorders?|students?)\b/i;
// Spelled-out numbers and comparisons that state a number the table does not hold ("two more", "doubled").
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|halved|double[ds]?|doubling|twice|triple[ds]?|tripling|quarter|percentage points?)\b/i;
// Fixed phrases whose digits are not data: the rating scale, the reporting threshold, the streak length and the High
// confidence bar from PROSE_SYSTEM.
const FIXED_PHRASES = /\b1-5\b|\b(?:under|fewer than|at least) 10\b|\b3 or more\b|\b4 or more weeks\b/gi;
const MAX_WORDS = 180;
const numbers = (s: string) => s.match(/\d+(?:\.\d+)?/g) ?? [];

/** The numbers the prose may use: the week's values as the table shows them, and nothing else. */
function allowedNumbers(week: WeekNumbers, previous?: WeekNumbers | null): Set<string> {
  const out = new Set<string>();
  for (const w of [week, previous]) {
    if (!w || w.suppressed || !w.states) continue;
    for (const v of [w.students, w.checkins, w.meanEnergy, w.meanFullness, w.meanFocus, w.attentionStreak3, w.mealStudents, ...Object.values(w.states)]) if (v != null) out.add(String(v));
    for (const share of [w.syntheticShare, w.skippedShare, w.heavyShare]) if (share != null) out.add(String(Math.round(share * 100)));
  }
  return out;
}

/** The plan's prose checks: length, numbers copied from the week's values only (dates and fixed phrases aside), no
 * spelled-out numbers, no causal or diagnostic words, "participants". */
export function checkProse(p: Prose, week: WeekNumbers, previous?: WeekNumbers | null): string[] {
  const problems: string[] = [];
  const text = [...p.paragraphs, p.why].join(' ');
  const words = p.paragraphs.join(' ').split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS) problems.push(`${words} words (limit ${MAX_WORDS})`);
  const allowed = allowedNumbers(week, previous);
  let data = text.replace(FIXED_PHRASES, ' ');
  for (const d of [week.from, week.to, previous?.from, previous?.to]) if (d) data = data.split(d).join(' ');
  const invented = numbers(data).filter((n) => !allowed.has(n));
  if (invented.length) problems.push(`numbers not in the table: ${[...new Set(invented)].join(', ')}`);
  const bad = text.match(FORBIDDEN);
  if (bad) problems.push(`forbidden word "${bad[0]}"`);
  const spelled = text.match(NUMBER_WORDS);
  if (spelled) problems.push(`number written as a word: "${spelled[0]}"`);
  return problems;
}

/** The fallback when the model is unavailable, refuses, or fails checkProse. It passes checkProse itself (tested). */
export function templateProse(week: WeekNumbers, previous?: WeekNumbers | null): Prose {
  if (week.suppressed || !week.states) {
    return {
      paragraphs: [`Fewer than 10 participants checked in between ${week.from} and ${week.to}, so this week is not reported.`],
      confidence: 'Low',
      why: 'There is too little data to describe the group.',
    };
  }
  const s = week.states;
  const paragraphs = [
    `${week.students} participants checked in between ${week.from} and ${week.to}, ${week.checkins} check-ins in all. Mean ratings on the 1-5 scale were energy ${week.meanEnergy}, fullness ${week.meanFullness} and focus ${week.meanFocus}; ${pct(week.skippedShare ?? 0)} of check-ins had a skipped meal.`,
    `The rules gave Stable to ${s.stable}, Watch to ${s.watch} and Needs attention to ${s.attention} participants, and ${s.nodata} had too few check-ins for a word. Participants at Needs attention 3 or more days in a row: ${week.attentionStreak3}.`,
  ];
  if (previous && !previous.suppressed && previous.states) paragraphs.push(`The previous week had ${previous.students} participants, with mean energy ${previous.meanEnergy}.`);
  const simulated = (week.syntheticShare ?? 0) >= 0.5;
  return {
    paragraphs,
    confidence: simulated ? 'Low' : 'Medium',
    why: simulated ? 'Most participants this week are simulated.' : 'It describes this week only.',
  };
}
