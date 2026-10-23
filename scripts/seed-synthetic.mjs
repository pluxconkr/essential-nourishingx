#!/usr/bin/env node
/**
 * Seeds the synthetic cohort (src/domain/synthetic.ts) into Supabase so the staff dashboard has 60 simulated
 * students × 30 days to show before a pilot (plan "seed-synthetic"; ADR 0001). Every row has cohort = 'synthetic';
 * real rows are never touched. Re-running replaces the synthetic rows, and the weekly reports built from them, with a
 * fresh 30 days ending on the Sunday of the latest closed week (public.report_week()), then writes that week's report
 * and the three before it through the weekly-report function, oldest first, which publishes each week: the earlier
 * weeks from the template, the latest with its one prose call. A week of those four that is already published is
 * replaced only if none of its own numbers shown to staff came from real students (public.weeks_showing_real);
 * otherwise the seed refuses to run, because a week that showed staff numbers from real students never changes.
 * Synthetic and real rows never share a day. Anyone with this repo can regenerate the synthetic answers (seed 2027),
 * so on a shared day subtracting them from the staff totals would give the real students' answers back (code review
 * 2026-10-24). Real students can write only open days (the upload window) and the seed writes only closed ones, so the
 * one way to mix them is seeding over days that already hold real rows: the seed refuses to.
 * Run: npm run seed:synthetic            (or add --clear to only remove the synthetic rows and reports)
 */
import { createClient } from '@supabase/supabase-js';

import { generate } from '../src/domain/synthetic.ts';
import { addDays } from '../src/domain/time.ts';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Run with: npm run seed:synthetic');
  process.exit(2);
}
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(`${label}: ${error.message}`);
    process.exit(1);
  }
  return data;
}

const clearOnly = process.argv.includes('--clear');
const weekEnd = (await must('read the latest closed week', admin.rpc('report_week'))).to;
const from = addDays(weekEnd, -29);
// The four weeks the seed publishes, oldest first; only the latest gets model prose.
const weeks = [3, 2, 1, 0].map((back) => ({ end: addDays(weekEnd, -7 * back), prose: back === 0 }));
const weekStarts = weeks.map((w) => addDays(w.end, -6));
if (!clearOnly) {
  for (const table of ['checkins', 'meal_analyses']) {
    const { count, error } = await admin.from(table).select('user_id', { count: 'exact', head: true }).eq('cohort', 'real').gte('day', from).lte('day', weekEnd);
    if (error || count) {
      console.error(error ? `count real ${table}: ${error.message}` : `${count} real ${table} rows fall between ${from} and ${weekEnd}; synthetic rows must not share a day with real ones. Nothing was changed.`);
      process.exit(1);
    }
  }
  // A week already published there is unpublished and written again below only if none of its own numbers shown to
  // staff came from real students. One with such numbers stays published, even after they delete their rows, so the
  // seed refuses: such a week never changes.
  const real = await must('check the seeded weeks', admin.rpc('weeks_showing_real', { p_week_ends: weeks.map((w) => w.end) }));
  if (real.length) {
    console.error(`Staff were shown numbers from real students for the week ending ${real.join(', ')}, and such a week never changes. Nothing was changed.`);
    process.exit(1);
  }
  await must('unpublish the seeded weeks', admin.from('weekly_reports').delete().in('week_start', weekStarts));
}
await must('remove synthetic check-ins', admin.from('checkins').delete().eq('cohort', 'synthetic'));
await must('remove synthetic meal estimates', admin.from('meal_analyses').delete().eq('cohort', 'synthetic'));
// Deleting a week's report unpublishes it (staff read published weeks only), and the next report freezes the week
// afresh. A report counts synthetic participants in syntheticShare; one built only from real rows has 0 and stays.
await must('remove synthetic weekly reports', admin.from('weekly_reports').delete().gt('aggregates->>syntheticShare', '0'));
if (clearOnly) {
  console.log('Removed the synthetic cohort and its weekly reports.');
  process.exit(0);
}

const { checkins, meals } = generate(weekEnd);
const chunks = (rows, n = 500) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, i * n + n));
for (const part of chunks(checkins)) {
  await must(
    'insert check-ins',
    admin.from('checkins').insert(part.map((c) => ({ user_id: c.userId, day: c.day, fullness: c.fullness, energy: c.energy, focus: c.focus, training: c.training, skipped: c.skipped, cohort: 'synthetic' }))),
  );
}
for (const part of chunks(meals)) {
  await must(
    'insert meal estimates',
    admin.from('meal_analyses').insert(
      part.map((m) => ({
        user_id: m.userId,
        day: m.day,
        meal: m.meal,
        items: m.items,
        kcal: m.kcal,
        kcal_low: m.kcal_low,
        kcal_high: m.kcal_high,
        protein_g: m.protein_g,
        carbs_g: m.carbs_g,
        fat_g: m.fat_g,
        fiber_g: m.fiber_g,
        groups: m.groups,
        uncertain: [],
        difficulty: m.difficulty,
        tier: m.tier,
        confidence: m.confidence,
        cohort: 'synthetic',
      })),
    ),
  );
}
console.log(`Seeded ${checkins.length} synthetic check-ins and ${meals.length} synthetic meal estimates for the 30 days ending ${weekEnd}, the Sunday of the latest closed week.`);

for (const { end, prose } of weeks) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/weekly-report`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ week_end: end, prose }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.report) {
    console.error(`weekly report for the week ending ${end}: HTTP ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  // The seed unpublished this week, so its report must be the one this call wrote. A cached one was published by
  // another call (a staff Regenerate) while seeding, perhaps before every synthetic row was in.
  if (body.cached) {
    console.error(`The week ending ${end} was published by another call while seeding. Run npm run seed:synthetic again.`);
    process.exit(1);
  }
  const r = body.report;
  const s = r.aggregates.states;
  console.log(`Week ${r.week_start}: ${s ? `${r.aggregates.students} participants · stable ${s.stable}, watch ${s.watch}, attention ${s.attention}, not enough data ${s.nodata}` : 'fewer than 10 participants · suppressed'} · prose from ${r.prose_source}${r.model ? ` (${r.model})` : ''}`);
}
