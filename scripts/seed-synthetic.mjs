#!/usr/bin/env node
/**
 * Seeds the synthetic cohort (src/domain/synthetic.ts) into Supabase so the staff dashboard has 60 simulated
 * students × 30 days to show before a pilot (plan "seed-synthetic"; ADR 0001). Every row has cohort = 'synthetic';
 * real rows are never touched. Re-running replaces the synthetic rows with a fresh 30 days ending today (school
 * time), then writes the last four weekly reports through the weekly-report function: the three earlier weeks from
 * the template, the current week with its one prose call.
 * Run: npm run seed:synthetic            (or add --clear to only remove the synthetic rows)
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
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

async function must(label, promise) {
  const { error } = await promise;
  if (error) {
    console.error(`${label}: ${error.message}`);
    process.exit(1);
  }
}

await must('remove synthetic check-ins', admin.from('checkins').delete().eq('cohort', 'synthetic'));
await must('remove synthetic meal estimates', admin.from('meal_analyses').delete().eq('cohort', 'synthetic'));
if (process.argv.includes('--clear')) {
  console.log('Removed the synthetic cohort.');
  process.exit(0);
}

const { checkins, meals } = generate(today);
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
console.log(`Seeded ${checkins.length} synthetic check-ins and ${meals.length} synthetic meal estimates for the 30 days ending ${today}.`);

for (const [weeksBack, prose] of [[3, false], [2, false], [1, false], [0, true]]) {
  const weekEnd = addDays(today, -7 * weeksBack);
  const res = await fetch(`${SUPABASE_URL}/functions/v1/weekly-report`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ week_end: weekEnd, prose }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.report) {
    console.error(`weekly report for the week ending ${weekEnd}: HTTP ${res.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  const r = body.report;
  const s = r.aggregates.states;
  console.log(`Week ${r.week_start}: ${r.aggregates.students} participants${s ? ` · stable ${s.stable}, watch ${s.watch}, attention ${s.attention}, not enough data ${s.nodata}` : ' · suppressed'} · prose from ${r.prose_source}${r.model ? ` (${r.model})` : ''}`);
}
