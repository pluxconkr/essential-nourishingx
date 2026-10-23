/**
 * Shared bits of the browser end-to-end tests (scripts/e2e/*.mjs): the system Chrome through playwright-core (no browser
 * download), PASS/FAIL lines like scripts/rls-test.mjs, screenshots and page errors tagged with the step they happened in.
 * Serve a web build first: npx expo export --platform web && npx expo serve   (E2E_BASE_URL defaults to :8081).
 */
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright-core';

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:8081';

export async function start(suite, viewport) {
  const out = path.join('.cache', 'e2e', suite);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const results = [];
  const errors = [];
  let step = 'start';
  page.on('pageerror', (e) => errors.push(`[${step}] ${e.message.slice(0, 160)}`));
  page.on('dialog', (d) => d.accept());
  return {
    page,
    byId: (id) => page.locator(`[data-testid="${id}"]`),
    visible: (id, timeout = 15000) =>
      page
        .locator(`[data-testid="${id}"]`)
        .first()
        .waitFor({ timeout })
        .then(() => true)
        .catch(() => false),
    shot: (name, fullPage = true) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage }),
    step: (name) => {
      step = name;
    },
    check(name, ok, detail = '') {
      step = name;
      results.push(Boolean(ok));
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
    },
    async finish() {
      this.check('no page errors', errors.length === 0, errors.join(' | '));
      await browser.close();
      const failed = results.filter((r) => !r).length;
      console.log(`\n${results.length - failed}/${results.length} ${suite} E2E checks passed · screenshots in ${out}`);
      process.exit(failed ? 1 : 0);
    },
  };
}
