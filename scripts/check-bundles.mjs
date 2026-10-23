#!/usr/bin/env node
/**
 * The plan's bundle boundary check (npm run check:bundles): exports the Android bundle as plain JavaScript and the web
 * build, then searches them.
 *   - The phone bundle must hold no staff dashboard code and no Claude SDK (staff routes resolve to stubs on phones).
 *   - Neither bundle may hold the Anthropic key, the Supabase secret key or the access token. Values are compared inside
 *     this process and never printed.
 *   - The web bundle must carry the public Supabase settings (it is the only way the browser reaches the project).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join('.cache', 'bundles');
const expo = (args) => {
  const r = spawnSync(process.execPath, [path.join('node_modules', 'expo', 'bin', 'cli'), ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const readAll = (dir) => {
  const files = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) files.push(p);
    }
  })(dir);
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
};

fs.rmSync(OUT, { recursive: true, force: true });
expo(['export', '--platform', 'android', '--no-bytecode', '--clear', '--output-dir', path.join(OUT, 'android')]);
expo(['export', '--platform', 'web', '--clear', '--output-dir', path.join(OUT, 'web')]);
const android = readAll(path.join(OUT, 'android'));
const web = readAll(path.join(OUT, 'web'));

const results = [];
const check = (name, ok) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
};
for (const [label, probe] of [
  ['staff strings', 'NourishingX staff'],
  ['staff session storage key', 'nourishingx-staff-auth'],
  ['staff rule tester', 'Same function, same thresholds'],
  ['Claude API host', 'api.anthropic.com'],
  ['Claude SDK package', '@anthropic-ai'],
]) {
  check(`phone bundle has no ${label}`, !android.includes(probe));
}
check('phone bundle still holds the student app', android.includes('Meal photo'));
for (const name of ['ANTHROPIC_API_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ACCESS_TOKEN']) {
  const value = process.env[name];
  check(`no bundle holds ${name}`, Boolean(value) && !android.includes(value) && !web.includes(value));
}
check('web bundle carries the public Supabase URL and publishable key', web.includes(process.env.SUPABASE_URL) && web.includes(process.env.SUPABASE_PUBLISHABLE_KEY));

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} bundle checks passed`);
process.exit(failed ? 1 : 0);
