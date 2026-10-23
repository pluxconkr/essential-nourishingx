#!/usr/bin/env node
/**
 * Creates (or resets) the demo staff account for the dashboard (ADR 0001: email + password through the Admin API,
 * role in app_metadata, never user_metadata). Writes the sign-in to .env.staff.local, which git ignores.
 * Run: node --env-file=.env.local scripts/create-staff.mjs [email]
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Run with: node --env-file=.env.local scripts/create-staff.mjs [email]');
  process.exit(2);
}

// example.com is reserved for documentation (RFC 2606), so the demo address can never reach a real inbox.
const email = process.argv[2] ?? 'dining.demo@example.com';
const password = randomBytes(18).toString('base64url');
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const attrs = { password, email_confirm: true, app_metadata: { role: 'staff' } };
let existing = null;
for (let page = 1; !existing; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  existing = data.users.find((u) => u.email === email) ?? null;
  if (data.users.length < 1000) break;
}
const { error } = existing ? await admin.auth.admin.updateUserById(existing.id, attrs) : await admin.auth.admin.createUser({ email, ...attrs });
if (error) {
  console.error(`Could not ${existing ? 'reset' : 'create'} ${email}: ${error.message}`);
  process.exit(1);
}

fs.writeFileSync('.env.staff.local', `# Demo staff sign-in for /staff (scripts/create-staff.mjs). Not a real person.\nSTAFF_EMAIL=${email}\nSTAFF_PASSWORD=${password}\n`);
console.log(`${existing ? 'Reset' : 'Created'} staff account ${email}; sign-in saved to .env.staff.local`);
