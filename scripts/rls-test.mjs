#!/usr/bin/env node
/**
 * Proves the RLS model against the hosted project (npm run test:rls).
 * Creates two anonymous students and one staff user, checks every boundary from ADR 0001 and the 2026-10-24 security
 * review as anon, student A, student B and staff, then deletes the users and checks their rows went with them.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { UPLOAD_DAYS, addDays, schoolDate, weekday } from '../src/domain/time.ts';

const URL = process.env.SUPABASE_URL;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SECRET_KEY;
if (!URL || !PUBLISHABLE || !SECRET) {
  console.error('Run with: node --env-file=.env.local scripts/rls-test.mjs');
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SECRET, opts);
const client = () => createClient(URL, PUBLISHABLE, opts);

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });
const denied = (error) => Boolean(error) && (error.code === '42501' || /permission denied|row-level security|staff only/i.test(error.message));

const today = schoolDate();
const row = (overrides = {}) => ({ day: today, fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none', ...overrides });
const created = [];

try {
  const anon = client();
  const a = client();
  const b = client();
  const staff = client();

  const { data: sa, error: ea } = await a.auth.signInAnonymously();
  const { data: sb, error: eb } = await b.auth.signInAnonymously();
  if (ea || eb) throw new Error('anonymous sign-in failed: ' + (ea || eb).message);
  const idA = sa.user.id;
  const idB = sb.user.id;
  created.push(idA, idB);

  const email = `rls-staff-${randomUUID().slice(0, 8)}@example.com`;
  const password = randomBytes(18).toString('base64url');
  const { data: su, error: es } = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: 'staff' } });
  if (es) throw new Error('staff create failed: ' + es.message);
  created.push(su.user.id);
  const { error: el } = await staff.auth.signInWithPassword({ email, password });
  if (el) throw new Error('staff sign-in failed: ' + el.message);

  // anon (no session)
  let r = await anon.from('checkins').select('*');
  check('anon cannot read check-ins', denied(r.error), r.error?.message);
  r = await anon.from('menu_days').select('key');
  check('anon can read the menu', !r.error, r.error?.message);
  r = await anon.rpc('staff_overview');
  check('anon cannot call staff_overview', denied(r.error), r.error?.message);
  r = await anon.rpc('rls_auto_enable');
  check('anon cannot call rls_auto_enable', Boolean(r.error), r.error?.message);

  // student A
  r = await a.from('checkins').insert(row());
  check('student inserts own check-in', !r.error, r.error?.message);
  r = await a.from('checkins').upsert(row({ energy: 4 }), { onConflict: 'user_id,day' });
  check('student upserts own check-in (same day overwrites)', !r.error, r.error?.message);
  r = await a.from('checkins').select('energy').eq('day', today);
  check('student reads own check-in', !r.error && r.data?.length === 1 && r.data[0].energy === 4, JSON.stringify(r.data ?? r.error?.message));
  // Dates inside the upload window, so only the ownership and cohort rules can refuse these two.
  r = await a.from('checkins').insert(row({ user_id: idB, day: addDays(today, -1) }));
  check("student cannot write another student's row", denied(r.error), r.error?.message);
  r = await a.from('checkins').insert(row({ day: addDays(today, -1), cohort: 'synthetic' }));
  check('student cannot insert synthetic rows', denied(r.error), r.error?.message);
  // The upload window: the last UPLOAD_DAYS days (school time) plus tomorrow, so a closed week can no longer change.
  r = await a.from('checkins').insert(row({ day: addDays(today, -UPLOAD_DAYS) }));
  check(`student can still send a check-in from ${UPLOAD_DAYS} days ago`, !r.error, r.error?.message);
  r = await a.from('checkins').insert(row({ day: addDays(today, -10) }));
  check('student cannot write a check-in 10 days old', denied(r.error), r.error?.message);
  r = await a.from('checkins').insert(row({ day: addDays(today, 3) }));
  check('student cannot write a check-in 3 days ahead', denied(r.error), r.error?.message);
  r = await a.rpc('reserve_ai', { p_user: idA, p_fn: 'analyze-meal', p_stage: 'triage', p_model: 'x', p_worst_usd: 0, p_daily_limit: null });
  check('student cannot reserve AI budget', denied(r.error), r.error?.message);
  r = await a.rpc('freeze_week', { p_week_end: '2026-10-18' });
  check('student cannot freeze a week', denied(r.error), r.error?.message);
  r = await a.from('meal_analyses').insert({ user_id: idA, day: today, meal: 'lunch', items: [], kcal: 1, kcal_low: 1, kcal_high: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, difficulty: 'easy', tier: 'haiku', confidence: 'low' });
  check('student cannot fabricate meal analyses', denied(r.error), r.error?.message);
  r = await a.from('ai_usage').select('*');
  check('student cannot read the AI ledger', denied(r.error), r.error?.message);
  r = await a.from('app_settings').select('*');
  check('student cannot read settings', denied(r.error), r.error?.message);
  r = await a.rpc('ai_budget_status');
  check('student cannot call ai_budget_status', denied(r.error), r.error?.message);
  r = await a.rpc('staff_overview');
  check('student cannot call staff_overview', denied(r.error), r.error?.message);
  r = await a.from('menu_days').insert({ key: '2099-01-01', meals: {} });
  check('student cannot edit the menu', denied(r.error), r.error?.message);
  r = await a.from('weekly_reports').select('*');
  check('student sees no weekly reports', !r.error && r.data.length === 0, JSON.stringify(r.data ?? r.error?.message));

  // student B against A
  r = await b.from('checkins').select('*').eq('user_id', idA);
  check("student B cannot see A's check-ins", !r.error && r.data.length === 0, JSON.stringify(r.data ?? r.error?.message));
  await b.from('checkins').update({ energy: 1 }).eq('user_id', idA);
  await b.from('checkins').delete().eq('user_id', idA);
  r = await a.from('checkins').select('energy').eq('day', today);
  check("student B cannot change or delete A's check-in", r.data?.length === 1 && r.data[0].energy === 4, JSON.stringify(r.data));

  // staff
  r = await staff.from('checkins').select('*');
  check('staff cannot read student rows', !r.error && r.data.length === 0, JSON.stringify(r.data ?? r.error?.message));
  r = await staff.rpc('staff_overview');
  const ov = r.data;
  const finalDay = addDays(today, -UPLOAD_DAYS - 1);
  // A published week (or, before any is published, the latest closed week marked pending with no numbers).
  check(
    'staff_overview: a closed Monday-to-Sunday week, no count when suppressed or pending, never a student id',
    !r.error && ov && weekday(ov.to) === 0 && ov.to <= finalDay && ov.from === addDays(ov.to, -6) &&
      (ov.pending ? ov.students === null && addDays(ov.to, 7) > finalDay : ov.suppressed ? ov.students === null : ov.students >= 10) &&
      !/user_id|[0-9a-f]{8}-[0-9a-f]{4}-4/.test(JSON.stringify(ov)),
    JSON.stringify(ov ?? r.error?.message),
  );
  // Days of published weeks only; any other day, and a day under 10 students: no count, no averages.
  r = await staff.rpc('staff_daily', { p_days: 90 });
  const quiet = Array.isArray(r.data) ? r.data.filter((d) => d.suppressed) : [];
  check("staff_daily: ends on the overview week's Sunday", Array.isArray(r.data) && r.data.at(-1)?.day === ov?.to, JSON.stringify(r.data?.at(-1) ?? r.error?.message));
  check('staff_daily: a day under 10 students shows neither its count nor averages', !r.error && quiet.length > 0 && quiet.every((d) => d.students === null && d.avg_energy === null && d.avg_fullness === null), `${quiet.length} quiet days`);
  r = await staff.rpc('report_week');
  check('staff cannot call report_week (service role only)', denied(r.error), r.error?.message);
  // A week is published once, by the weekly-report function, so staff cannot freeze or publish one themselves.
  r = await staff.rpc('freeze_week', { p_week_end: ov?.to ?? '2026-10-18' });
  check('staff cannot freeze a week (service role only)', denied(r.error), r.error?.message);
  r = await staff.rpc('publish_week', { p_week_end: ov?.to ?? '2026-10-18', p_made_at: new Date().toISOString(), p_report: {} });
  check('staff cannot publish a week (service role only)', denied(r.error), r.error?.message);
  const again = await staff.rpc('staff_overview');
  check('staff_overview gives the same published week again', !again.error && JSON.stringify(again.data) === JSON.stringify(ov), JSON.stringify(again.data ?? again.error?.message));
  for (const fn of ['staff_daily', 'staff_meals', 'staff_ai_spend']) {
    r = await staff.rpc(fn, {});
    check(`staff can call ${fn}`, !r.error, r.error?.message);
  }
  r = await staff.from('menu_days').upsert({ key: '2099-12-31', meals: { breakfast: [], lunch: [], dinner: [] } });
  check('staff can edit the menu', !r.error, r.error?.message);
  await staff.from('menu_days').delete().eq('key', '2099-12-31');
  r = await staff.from('weekly_reports').select('*');
  check('staff can read weekly reports', !r.error, r.error?.message);
  r = await staff.from('ai_usage').select('*');
  check('staff cannot read the raw AI ledger', denied(r.error), r.error?.message);

  // deleting a user removes their rows (trigger on auth.users)
  await admin.auth.admin.deleteUser(idA);
  created.splice(created.indexOf(idA), 1);
  r = await admin.from('checkins').select('day').eq('user_id', idA);
  check("deleting a student removes the student's rows", !r.error && r.data.length === 0, JSON.stringify(r.data ?? r.error?.message));
  // A's access token is still valid for up to an hour: an upload still in flight must not land after the deletion.
  r = await a.from('checkins').upsert(row(), { onConflict: 'user_id,day' });
  check("a deleted student's token cannot write a check-in", denied(r.error), r.error?.message);
  r = await admin.from('meal_analyses').insert({ user_id: idA, day: today, meal: 'lunch', items: [], kcal: 1, kcal_low: 1, kcal_high: 1, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, difficulty: 'easy', tier: 'haiku', confidence: 'low' });
  check('no meal estimate is stored for a deleted account (the analysis in flight)', denied(r.error), r.error?.message);

  const status = (res) => String(res.error?.context?.status ?? (res.error ? res.error.message : 'no error'));
  // weekly-report: staff or the secret key only (the staff path costs a Claude call, so the staff E2E covers it)
  r = await b.functions.invoke('weekly-report', { body: {} });
  check('a student cannot run weekly-report', status(r) === '403', status(r));
  r = await anon.functions.invoke('weekly-report', { body: {} });
  check('weekly-report refuses a caller without a session', status(r) === '401', status(r));

  // delete-me ("Delete everything"): only the anonymous student themself; staff and session-less callers are refused
  r = await staff.functions.invoke('delete-me', { body: {} });
  check('staff cannot use delete-me', status(r) === '403', status(r));
  r = await anon.functions.invoke('delete-me', { body: {} });
  check('delete-me refuses a caller without a session', status(r) === '401', status(r));
  await b.from('checkins').insert(row());
  r = await b.functions.invoke('delete-me', { body: {} });
  check('a student deletes their own account with delete-me', !r.error && r.data?.status === 'deleted', status(r));
  r = await admin.from('checkins').select('day').eq('user_id', idB);
  const gone = await admin.auth.admin.getUserById(idB);
  check('delete-me removes the rows and the anonymous user', !r.error && r.data.length === 0 && Boolean(gone.error), JSON.stringify(r.data ?? r.error?.message));
  if (gone.error) created.splice(created.indexOf(idB), 1);
  // The phone keeps its session until delete-me answers, so a retry after a lost answer must still succeed.
  r = await b.functions.invoke('delete-me', { body: {} });
  check('delete-me answers "deleted" again when the account is already gone', !r.error && r.data?.status === 'deleted', status(r));

  // exact privileges: nothing beyond what the policies need (catches default-ACL grants such as TRUNCATE)
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    const ref = new globalThis.URL(URL).host.split('.')[0];
    const query = "select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1, 2";
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const rows = await res.json();
    const got = Array.isArray(rows) ? rows.map((x) => `${x.table_name}:${x.grantee}=${x.privs}`).sort() : [JSON.stringify(rows)];
    const want = [
      'checkins:authenticated=DELETE,INSERT,SELECT,UPDATE',
      'meal_analyses:authenticated=DELETE,SELECT',
      'menu_days:anon=SELECT',
      'menu_days:authenticated=DELETE,INSERT,SELECT,UPDATE',
      'weekly_reports:authenticated=SELECT',
    ];
    check('table privileges match ADR 0001 exactly', JSON.stringify(got) === JSON.stringify(want), got.join(' | '));
  }
} catch (e) {
  check('setup', false, e.message);
} finally {
  for (const id of created) await admin.auth.admin.deleteUser(id);
}

const width = Math.max(...results.map((x) => x.name.length));
for (const x of results) console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.name.padEnd(width)}  ${x.ok ? '' : x.detail}`);
const failed = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - failed}/${results.length} RLS checks passed`);
process.exit(failed ? 1 : 0);
