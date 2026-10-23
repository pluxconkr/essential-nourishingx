#!/usr/bin/env node
/**
 * Runs one command with .env.local loaded into its environment:
 *   node --env-file=.env.local scripts/env-run.mjs supabase functions deploy analyze-meal --use-api
 * Secrets stay inside the child process environment; nothing here prints them.
 * `supabase` runs the pinned CLI's JS entry through node without a shell, so arguments
 * (SQL strings included) reach it exactly as given on Windows too.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('usage: node --env-file=.env.local scripts/env-run.mjs <command> [args...]');
  process.exit(2);
}
const [cmd, ...args] = argv;
const result =
  cmd === 'supabase'
    ? spawnSync(process.execPath, [createRequire(import.meta.url).resolve('supabase/dist/supabase.js'), ...args], { stdio: 'inherit' })
    : spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
