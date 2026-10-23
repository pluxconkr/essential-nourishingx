#!/usr/bin/env node
/**
 * Runs one SQL statement on the linked project through the Supabase Management API and prints the rows
 * as JSON lines (developer tool; the access token never leaves this process):
 *   node --env-file=.env.local scripts/sql.mjs "select count(*) from public.checkins"
 */
const sql = process.argv.slice(2).join(' ').trim();
const { SUPABASE_URL, SUPABASE_ACCESS_TOKEN } = process.env;
if (!sql || !SUPABASE_URL || !SUPABASE_ACCESS_TOKEN) {
  console.error('usage: node --env-file=.env.local scripts/sql.mjs "<sql>"');
  process.exit(2);
}
const ref = new URL(SUPABASE_URL).host.split('.')[0];
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.json();
if (!res.ok) {
  console.error(res.status, JSON.stringify(body));
  process.exit(1);
}
for (const row of Array.isArray(body) ? body : [body]) console.log(JSON.stringify(row));
