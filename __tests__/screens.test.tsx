/**
 * Every student route renders the safety bar — the disclaimer and the Health Center button (AGENTS.md hard rule) —
 * inside that route's own screen, with the network off (local-only mode: the test config has no Supabase settings).
 * The real route files are rendered through Expo Router's testing library.
 */
import { renderRouter, screen, within } from 'expo-router/testing-library';

import { kv } from '@/data/db';
import { actions, hydrate } from '@/store/appStore';

jest.mock('@/services/notifications', () => ({
  scheduleReminder: jest.fn(async () => 'notif-1'),
  cancelReminder: jest.fn(async () => {}),
  configureNotifications: jest.fn(async () => {}),
  onReminderTap: jest.fn(() => () => {}),
}));

beforeEach(() => {
  for (const k of kv.keys()) kv.remove(k);
  hydrate();
});

async function safetyIn(screenId: string) {
  const s = within(await screen.findByTestId(screenId));
  return { disclaimer: s.queryByTestId('safety-disclaimer'), health: s.queryByTestId('safety-health') };
}

test.each([
  ['/', 'consent'],
  ['/not-now', 'not-now'],
])('before consent, %s carries the disclaimer and the Health Center button', async (url, id) => {
  await renderRouter('./src/app', { initialUrl: url });
  const { disclaimer, health } = await safetyIn(id);
  expect(disclaimer).toBeTruthy();
  expect(health).toBeTruthy();
});

test.each([
  ['/', 'home'],
  ['/checkin', 'checkin'],
  ['/balance', 'balance'],
  ['/data', 'data'],
  ['/how', 'how'],
  ['/privacy', 'privacy'],
  ['/meal', 'meal'],
])('after consent, %s carries the disclaimer and the Health Center button', async (url, id) => {
  await actions.consent(15, 0, false);
  await renderRouter('./src/app', { initialUrl: url });
  const { disclaimer, health } = await safetyIn(id);
  expect(disclaimer).toBeTruthy();
  expect(health).toBeTruthy();
});

test('the Health Center sheet itself keeps the disclaimer', async () => {
  await actions.consent(15, 0, false);
  await renderRouter('./src/app', { initialUrl: '/health' });
  expect((await safetyIn('health')).disclaimer).toBeTruthy();
});

test.each(['/staff', '/staff/rules', '/staff/sign-in'])('on a phone, %s goes home and renders no staff code', async (url) => {
  await actions.consent(15, 0, false);
  // With RNTL 14's async render, expo-router attaches getPathname() to the returned promise itself.
  const rendered = renderRouter('./src/app', { initialUrl: url });
  await rendered;
  expect(await screen.findByTestId('home')).toBeTruthy();
  expect(rendered.getPathname()).toBe('/');
  expect(screen.queryByTestId('staff-sign-in')).toBeNull();
  expect(screen.queryByText('NourishingX staff')).toBeNull();
});
