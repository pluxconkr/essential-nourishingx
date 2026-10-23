#!/usr/bin/env node
/**
 * Student web end-to-end test (npm run e2e:student [photo.jpg]) against a served web build: consent → anonymous
 * session → a real meal photo through analyze-meal (one Claude router run, about USD 0.04) → the estimate on Home and
 * Your data → a check-in reaching Supabase → a reload on a deep link → "Delete everything" removing the account and
 * its rows. The secret key is used only to look at the database from outside, never by the page.
 */
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { BASE, start } from './harness.mjs';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

/** A meal photo: the argument, or the public-domain USDA school-lunch tray from the router eval (scripts/eval/cases.json). */
async function mealPhoto() {
  if (process.argv[2]) return process.argv[2];
  const file = path.join('.cache', 'e2e-photo', 'meal.jpg');
  if (fs.existsSync(file)) return file;
  const { cases } = JSON.parse(fs.readFileSync('scripts/eval/cases.json', 'utf8'));
  const res = await fetch(cases.find((c) => c.id === 'commons-usda-tray').url, { headers: { 'User-Agent': 'NourishingX-e2e/0.1 (student project; github.com/pluxconkr/essential-nourishingx)' } });
  if (!res.ok) throw new Error(`photo download: HTTP ${res.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const t = await start('student', { width: 390, height: 844 });
const { page, byId, visible, shot, check } = t;
try {
  const photo = await mealPhoto();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('first visit shows consent', await visible('consent', 20000));
  check('consent lists the meal-photo sentence', await page.getByText('Meal photos are optional. An AI model estimates').isVisible());
  await shot('01-consent');

  await byId('consent-accept').click();
  check('consent opens Home', await visible('home', 20000));
  await page.waitForTimeout(1500);
  check('Home shows the meals card and the Your data entry', (await byId('home-meals').isVisible()) && (await byId('home-data').isVisible()));
  const userId = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('sb-') && x.endsWith('-auth-token'));
    return k ? JSON.parse(localStorage.getItem(k)).user?.id : null;
  });
  check('consent starts an anonymous Supabase session', Boolean(userId), userId ?? 'none');
  await shot('02-home');

  await byId('home-meal').click();
  await visible('meal');
  await page.getByRole('radio', { name: 'Lunch' }).click();
  const chooser = page.waitForEvent('filechooser');
  await byId('meal-library').click();
  await (await chooser).setFiles(photo);
  await page.waitForTimeout(800);
  await shot('03-meal-working');
  const t0 = Date.now();
  check('a food photo returns an estimate', await visible('meal-items', 150000), `${Math.round((Date.now() - t0) / 1000)} s`);
  await shot('04-meal-result');
  const totals = await byId('meal-totals').innerText();
  check('the estimate shows a kcal range and macros', /About \d+–\d+ kcal/.test(totals) && /Protein \d+ g/.test(totals), totals.replace(/\n/g, ' | '));
  check('it names the model and says the photo was not kept', await page.getByText(/Made by Claude .* the photo was not kept/).isVisible());
  const { data: rows } = await admin.from('meal_analyses').select('meal, kcal, tier').eq('user_id', userId);
  check("the estimate is stored as the student's own row", rows?.length === 1 && rows[0].meal === 'lunch', JSON.stringify(rows));

  await byId('meal-done').click();
  await visible('home');
  await page.waitForTimeout(500);
  check("Home lists today's meal", /Lunch · about \d+ kcal/.test(await byId('home-meals').innerText()));

  await page.getByRole('tab', { name: 'Check-in' }).click();
  await visible('checkin');
  for (const q of ['How full do you feel?', 'How is your energy?', 'How focused do you feel?']) await page.getByRole('radiogroup', { name: q }).getByRole('radio', { name: '3' }).click();
  await page.getByRole('radiogroup', { name: 'Did you train today?' }).getByRole('radio', { name: 'Heavy' }).click();
  await page.getByRole('radiogroup', { name: 'Did you skip a meal?' }).getByRole('radio', { name: 'No' }).click();
  await page.getByRole('button', { name: /^Save/ }).click();
  await visible('balance');
  await page.waitForTimeout(2500);
  await shot('05-balance');
  const { data: ck } = await admin.from('checkins').select('training').eq('user_id', userId);
  check('the check-in reached the server', ck?.length === 1 && ck[0].training === 'heavy', JSON.stringify(ck));

  await page.goto(`${BASE}/data`, { waitUntil: 'networkidle' });
  await visible('data');
  await shot('06-data');
  check('a reload on /data shows the stored meal estimate', /About \d+ kcal · protein \d+ g/.test(await byId('data-meals').innerText()));
  check('Your data says a copy is on the server', await byId('data').getByText('On this phone, with a copy on the school’s server').first().isVisible());
  await page.getByRole('button', { name: 'Back' }).first().click();
  await visible('home');
  await byId('home-data').click();
  check('Home opens Your data', await visible('data'));

  await byId('delete-everything').click();
  check('Delete everything returns to consent', await visible('consent', 20000));
  const gone = await admin.auth.admin.getUserById(userId);
  const { data: leftMeals } = await admin.from('meal_analyses').select('id').eq('user_id', userId);
  const { data: leftCk } = await admin.from('checkins').select('day').eq('user_id', userId);
  check('Delete everything removed the server account and its rows', Boolean(gone.error) && leftMeals?.length === 0 && leftCk?.length === 0);
} catch (e) {
  await shot('99-failure').catch(() => {});
  check('flow', false, e.message.split('\n')[0]);
}
await t.finish();
