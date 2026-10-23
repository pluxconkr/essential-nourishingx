#!/usr/bin/env node
/**
 * Router eval (docs/ai-router.md). Sends labelled photos through the deployed analyze-meal function and scores
 * the answers against Nutrition5k's measured nutrition or the Commons labels in scripts/eval/cases.json.
 *
 *   node --env-file=.env.local scripts/eval-router.mjs --label v1-router            # the router decides
 *   node --env-file=.env.local scripts/eval-router.mjs --label v1-opus --tier opus  # every photo forced onto Opus
 *   options: --only id1,id2   --source n5k|commons   --concurrency 3   --max-usd 3   --effort low|medium|high (with --tier)
 *
 * --tier uses the secret-key eval path (nothing stored). Without it the harness signs in throwaway anonymous
 * students, exactly like the phone. Photos are cached in .cache/eval/ (gitignored); results go to docs/eval/.
 */
import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const LABEL = arg('label', 'run');
const TIER = arg('tier', null);
const EFFORT = arg('effort', null);
const ONLY = arg('only', null)?.split(',');
const SOURCE = arg('source', null);
const CONCURRENCY = Number(arg('concurrency', 3));
const MAX_USD = Number(arg('max-usd', 3));

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY) {
  console.error('Run with: node --env-file=.env.local scripts/eval-router.mjs ...');
  process.exit(2);
}
const ROOT = process.cwd();
const CACHE = path.join(ROOT, '.cache', 'eval');
const OUT = path.join(ROOT, 'docs', 'eval');
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'eval', 'cases.json'), 'utf8'));
const UA = { 'User-Agent': 'NourishingX-eval/0.1 (student project; github.com/pluxconkr/essential-nourishingx)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cached(file, url, { pace = 0 } = {}) {
  const p = path.join(CACHE, file);
  if (fs.existsSync(p)) return p;
  for (let attempt = 1; attempt <= 4; attempt++) {
    await wait(pace * attempt);
    const res = await fetch(url, { headers: UA });
    if (res.ok) {
      fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
      return p;
    }
    if (res.status !== 429) throw new Error(`${url} -> ${res.status}`);
  }
  throw new Error(`${url} kept returning 429`);
}

// Nutrition5k truth: dish_id, kcal, mass, fat, carb, protein, then 7 fields per ingredient (id, name, grams, kcal, fat, carb, protein).
async function nutrition5k() {
  const csv = fs.readFileSync(await cached('n5k_cafe1.csv', spec.sources.nutrition5k.metadata), 'utf8');
  const truth = new Map();
  for (const line of csv.trim().split(/\r?\n/)) {
    const r = line.split(',');
    const ingredients = [];
    for (let i = 6; i + 6 < r.length; i += 7) ingredients.push({ name: r[i + 1], grams: Number(r[i + 2]) });
    truth.set(r[0], { kcal: Number(r[1]), mass: Number(r[2]), fat: Number(r[3]), carb: Number(r[4]), protein: Number(r[5]), ingredients });
  }
  return truth;
}

/** Head noun of an ingredient name ("white rice" → rice, "spinach (raw)" → spinach), singular. */
const headNoun = (name) => name.replace(/\(.*?\)/g, '').trim().toLowerCase().split(/[^a-z]+/).filter(Boolean).pop()?.replace(/(es|s)$/, '') ?? '';

function score(c, body) {
  const items = body.analysis?.items ?? [];
  const names = items.map((i) => i.name.toLowerCase()).join(' | ');
  const s = { is_food_ok: null, recall: null, kcal_err: null, in_range: null, protein_err: null, carb_err: null, fat_err: null, mass_err: null };
  if (c.truth) {
    const t = c.truth;
    s.is_food_ok = body.status === 'ok';
    const major = t.ingredients.filter((i) => i.grams >= 0.15 * t.mass).slice(0, 5).map((i) => headNoun(i.name)).filter(Boolean);
    s.major = major;
    if (body.analysis) {
      const a = body.analysis;
      s.recall = major.length ? major.filter((m) => names.includes(m)).length / major.length : null;
      s.kcal_err = (a.kcal - t.kcal) / t.kcal;
      s.in_range = t.kcal >= a.kcal_low && t.kcal <= a.kcal_high;
      s.protein_err = a.protein_g - t.protein;
      s.carb_err = a.carbs_g - t.carb;
      s.fat_err = a.fat_g - t.fat;
      s.mass_err = (items.reduce((x, i) => x + i.grams, 0) - t.mass) / t.mass;
    }
  } else {
    const e = c.expect;
    s.is_food_ok = e.is_food ? body.status === 'ok' : body.status === 'not_food';
    if (e.keywords.length && body.analysis) s.recall = e.keywords.filter((k) => new RegExp(k, 'i').test(names)).length / e.keywords.length;
  }
  return s;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, opts);
const students = [];
async function studentToken(i) {
  // The function allows 12 analyses per student per day, so a new throwaway student every 10 photos.
  const k = Math.floor(i / 10);
  if (!students[k]) {
    const c = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, opts);
    const { data, error } = await c.auth.signInAnonymously();
    if (error) throw error;
    students[k] = { id: data.user.id, token: data.session.access_token };
  }
  return students[k].token;
}

const truth = await nutrition5k();
let cases = spec.cases.map((c) => (c.dish ? { ...c, truth: truth.get(c.dish) } : c));
if (ONLY) cases = cases.filter((c) => ONLY.includes(c.id));
if (SOURCE) cases = cases.filter((c) => (SOURCE === 'n5k' ? c.dish : !c.dish));

const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
let spent = 0;
const results = [];

async function run(c, i) {
  if (spent >= MAX_USD) return { id: c.id, skipped: 'max-usd reached' };
  const file = c.dish ? `${c.dish}.png` : `${c.id}.jpg`;
  const url = c.dish ? spec.sources.nutrition5k.image.replace('{dish}', c.dish) : c.url;
  const p = await cached(file, url, { pace: c.dish ? 0 : 3000 });
  const media = c.dish ? 'image/png' : 'image/jpeg';
  const headers = TIER
    ? { apikey: SUPABASE_SECRET_KEY, 'Content-Type': 'application/json' }
    : { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${await studentToken(i)}`, 'Content-Type': 'application/json' };
  const t0 = Date.now();
  const payload = JSON.stringify({ image: fs.readFileSync(p).toString('base64'), media_type: media, meal: 'lunch', day, ...(TIER ? { force_tier: TIER } : {}), ...(EFFORT ? { force_effort: EFFORT } : {}) });
  const send = () => fetch(`${SUPABASE_URL}/functions/v1/analyze-meal`, { method: 'POST', headers, body: payload });
  // A 503 here is the platform refusing a worker, not the model; retry once so the eval measures the model.
  let res = await send();
  let retried503 = false;
  if (res.status === 503) {
    retried503 = true;
    await wait(3000);
    res = await send();
  }
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: `non-JSON ${res.status}: ${text.slice(0, 120)}` };
  }
  spent += Number(body.cost_usd ?? 0);
  const r = {
    id: c.id,
    band: c.band ?? 'commons',
    http: res.status,
    retried503,
    status: body.status ?? body.error,
    difficulty: body.difficulty ?? body.triage?.difficulty ?? null,
    tier: body.tier ?? null,
    route: body.route ?? null,
    signals: body.triage?.signals ?? null,
    items: (body.analysis?.items ?? []).map((x) => `${x.name} ${x.grams}g ${x.kcal}kcal`),
    kcal: body.analysis?.kcal ?? null,
    kcal_range: body.analysis ? [body.analysis.kcal_low, body.analysis.kcal_high] : null,
    truth_kcal: c.truth ? Math.round(c.truth.kcal) : null,
    cost_usd: body.cost_usd ?? 0,
    ms: Date.now() - t0,
    detail: body.detail ?? null,
    ...score(c, body),
  };
  const pct = (x) => (x == null ? '   -' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`.padStart(5));
  console.log(`${c.id.padEnd(30)} ${String(r.status).padEnd(15)} ${String(r.tier ?? '-').padEnd(6)} ${String(r.difficulty ?? '-').padEnd(7)} kcal ${String(r.kcal ?? '-').padStart(5)} vs ${String(r.truth_kcal ?? '-').padStart(5)} ${pct(r.kcal_err)} recall ${r.recall == null ? '-' : r.recall.toFixed(2)} $${Number(r.cost_usd).toFixed(4)} ${(r.ms / 1000).toFixed(1)}s`);
  return r;
}

const queue = cases.map((c, i) => [c, i]);
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const [c, i] = queue.shift();
      try {
        results.push(await run(c, i));
      } catch (e) {
        results.push({ id: c.id, status: 'harness_error', detail: e.message });
        console.log(`${c.id.padEnd(30)} harness error: ${e.message}`);
      }
    }
  }),
);
for (const s of students) if (s) await admin.auth.admin.deleteUser(s.id);

// ---- summary
const done = results.filter((r) => r.http);
const n5k = done.filter((r) => r.truth_kcal != null && r.kcal != null);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const summary = {
  label: LABEL,
  tier: TIER ?? 'router',
  effort: EFFORT ?? 'default',
  retried_503: results.filter((r) => r.retried503).length,
  cases: results.length,
  answered: done.filter((r) => r.status === 'ok' || r.status === 'not_food').length,
  is_food_correct: done.filter((r) => r.is_food_ok).length,
  n5k_scored: n5k.length,
  kcal_mape: mean(n5k.map((r) => Math.abs(r.kcal_err))),
  kcal_median_ape: median(n5k.map((r) => Math.abs(r.kcal_err))),
  kcal_bias: mean(n5k.map((r) => r.kcal_err)),
  range_coverage: mean(n5k.map((r) => (r.in_range ? 1 : 0))),
  protein_mae_g: mean(n5k.map((r) => Math.abs(r.protein_err))),
  carb_mae_g: mean(n5k.map((r) => Math.abs(r.carb_err))),
  fat_mae_g: mean(n5k.map((r) => Math.abs(r.fat_err))),
  mass_mape: mean(n5k.map((r) => Math.abs(r.mass_err))),
  recall: mean(done.filter((r) => r.recall != null).map((r) => r.recall)),
  tiers: done.reduce((m, r) => ((m[r.tier ?? 'none'] = (m[r.tier ?? 'none'] ?? 0) + 1), m), {}),
  cost_usd: Math.round(spent * 1e6) / 1e6,
  mean_ms: Math.round(mean(done.map((r) => r.ms)) ?? 0),
};
fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify({ summary, results }, null, 1));
const f = (x, d = 2) => (x == null ? '-' : Number(x).toFixed(d));
console.log(`\n${LABEL} (${summary.tier}): answered ${summary.answered}/${summary.cases}, food/not-food right ${summary.is_food_correct}/${done.length}`);
console.log(`kcal MAPE ${f(summary.kcal_mape)} (median ${f(summary.kcal_median_ape)}, bias ${f(summary.kcal_bias)}), range covers truth ${f(summary.range_coverage)}, mass MAPE ${f(summary.mass_mape)}`);
console.log(`macro MAE g: protein ${f(summary.protein_mae_g, 1)} carbs ${f(summary.carb_mae_g, 1)} fat ${f(summary.fat_mae_g, 1)} | item recall ${f(summary.recall)} | tiers ${JSON.stringify(summary.tiers)}`);
console.log(`cost $${summary.cost_usd} | mean latency ${(summary.mean_ms / 1000).toFixed(1)} s | written docs/eval/${LABEL}.json`);
