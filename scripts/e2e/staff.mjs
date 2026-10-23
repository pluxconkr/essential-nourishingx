#!/usr/bin/env node
/**
 * Staff dashboard web end-to-end test (npm run e2e:staff) against a served web build, signed in with the demo staff
 * account from .env.staff.local (npm run staff:create): wrong password refused → every view renders → the page's word
 * counts equal the stored weekly report → the rule tester gives the phone's word for each demo week → a menu edit
 * reaches menu_days and a phone can read it (then it is removed again) → Regenerate → narrow window → sign-out.
 * Expects the synthetic cohort (npm run seed:synthetic), whose latest closed week has its report already, so
 * Regenerate must return that stored report and make no Claude call.
 */
import { createClient } from '@supabase/supabase-js';

import { BASE, start } from './harness.mjs';

if (!process.env.STAFF_EMAIL || !process.env.STAFF_PASSWORD) {
  console.error('Run npm run staff:create first; it writes .env.staff.local.');
  process.exit(2);
}
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

const t = await start('staff', { width: 1360, height: 900 });
const { page, byId, visible, shot, check } = t;
const VIEWS = ['menu', 'meals', 'ops', 'wellness', 'rules', 'data', 'scope'];
try {
  await page.goto(`${BASE}/staff`, { waitUntil: 'networkidle' });
  check('signed out, /staff shows the sign-in form', await visible('staff-sign-in'));
  await shot('01-sign-in', false);

  await byId('staff-email').fill(process.env.STAFF_EMAIL);
  await byId('staff-password').fill('not-the-password-123');
  await byId('staff-submit').click();
  check(
    'a wrong password is refused',
    await page
      .getByText('That email and password do not match')
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false),
  );
  await byId('staff-password').fill(process.env.STAFF_PASSWORD);
  await byId('staff-submit').click();
  check('the demo staff account signs in to the overview', await visible('staff-overview', 20000));
  await page.waitForTimeout(2500);
  await shot('02-overview');
  const kpi = await byId('kpi-participants').innerText().catch(() => '');
  check("the overview shows the latest closed week's participants", /Participants\s+\d+/i.test(kpi), kpi.replace(/\n/g, ' | '));
  const days = await byId('kpi-days').innerText().catch(() => '');
  check('the overview says how many of its 7 days are shown', /Days shown\s+[1-7]\b/i.test(days), days.replace(/\n/g, ' | '));
  check('the synthetic-data banner is on the page', /Synthetic data|Includes synthetic data/.test(await byId('staff-banner').innerText().catch(() => '')));
  check('the weekly report is shown with its source label', /Written by Claude|Written from a template/.test(await byId('staff-prose').innerText().catch(() => '')));

  for (const v of VIEWS) {
    await byId(`nav-${v}`).first().click();
    const ok = await visible(`staff-${v}`);
    await page.waitForTimeout(1200);
    await shot(`03-${v}`);
    check(`${v} renders`, ok);
  }

  await byId('nav-wellness').first().click();
  await visible('staff-wellness');
  await page.waitForTimeout(1200);
  const { data: rep } = await admin.from('weekly_reports').select('aggregates').order('week_start', { ascending: false }).limit(1).single();
  const words = ['stable', 'watch', 'attention', 'nodata'];
  const shown = {};
  for (const w of words) shown[w] = Number((await byId(`count-${w}`).innerText().catch(() => '')).split('\n').pop());
  check('aggregate states equal the stored weekly report', words.every((w) => shown[w] === rep.aggregates.states?.[w]), JSON.stringify(shown));

  await byId('nav-rules').first().click();
  await visible('staff-rules');
  for (const [week, word] of Object.entries({ stable: 'Stable', watch: 'Watch', attention: 'Needs attention', sparse: 'Not enough data' })) {
    await byId(`load-${week}`).click();
    await page.waitForTimeout(300);
    const got = (await byId('rules-word').innerText()).trim();
    check(`rule tester: the ${week} week gives ${word}`, got === word, got);
  }

  await byId('nav-ops').first().click();
  await visible('menu-editor');
  await byId('menu-day-weekday').click();
  const item = 'Rice bowl (build your own) · e2e';
  await byId('menu-lunch-item-0').fill(item);
  await byId('menu-save').click();
  await page.getByText('Saved. Phones pick it up on their next sync.').waitFor({ timeout: 10000 });
  const { data: saved } = await admin.from('menu_days').select('meals').eq('key', 'weekday').maybeSingle();
  check('saving the weekday template writes menu_days', saved?.meals?.lunch?.[0]?.item === item);
  const { data: phone } = await anon.from('menu_days').select('meals').eq('key', 'weekday');
  check('a phone (publishable key, no session) reads the saved day', phone?.[0]?.meals?.lunch?.[0]?.item === item);
  await byId('menu-delete').click();
  await page.getByText('Deleted. Phones fall back to the weekly table.').waitFor({ timeout: 10000 });
  const { data: gone } = await admin.from('menu_days').select('key').eq('key', 'weekday');
  check('deleting the day removes the row', gone?.length === 0);

  await byId('nav-overview').first().click();
  await visible('staff-overview');
  const proseCalls = async () => (await admin.from('ai_usage').select('id', { count: 'exact', head: true }).eq('fn', 'weekly-report')).count;
  const callsBefore = await proseCalls();
  await byId('staff-regenerate').click();
  const reused = await page
    .getByText('The stored report is shown')
    .first()
    .waitFor({ timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  check("Regenerate returns the closed week's stored report without a new Claude call", reused && (await proseCalls()) === callsBefore);

  t.step('narrow window');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(800);
  await shot('04-overview-narrow', false);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.waitForTimeout(800);
  t.step('sign out');
  await byId('staff-signout').first().click();
  check('sign-out shows the sign-in form again', await visible('staff-sign-in'));
} catch (e) {
  await shot('99-failure').catch(() => {});
  check('flow', false, e.message.split('\n')[0]);
}
await t.finish();
