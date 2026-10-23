/** Store behaviour around Supabase, with src/services/cloud mocked (the real client needs the network). */
jest.mock('@/services/notifications', () => ({
  scheduleReminder: jest.fn(async () => 'notif-1'),
  cancelReminder: jest.fn(async () => {}),
  configureNotifications: jest.fn(async () => {}),
  onReminderTap: jest.fn(() => () => {}),
}));
jest.mock('@/services/cloud', () => ({
  connect: jest.fn(async () => true),
  uploadCheckins: jest.fn(async (rows: { date: string }[]) => rows.map((r) => r.date)),
  fetchMeals: jest.fn(async () => []),
  analyzeMeal: jest.fn(),
  deleteMeal: jest.fn(async () => true),
  deleteCloudAccount: jest.fn(async () => true),
}));

import { kv } from '@/data/db';
import { KEYS } from '@/data/registry';
import type { MealRecord } from '@/domain/types';
import { analyzeMeal, deleteCloudAccount, deleteMeal, fetchMeals, uploadCheckins } from '@/services/cloud';
import { actions, getState, hydrate } from '@/store/appStore';

const today = '2027-10-08';
const record: MealRecord = {
  id: 'm1', date: today, meal: 'lunch', items: [], kcal: 520, kcalLow: 430, kcalHigh: 650, protein_g: 31, carbs_g: 60, fat_g: 14, fiber_g: 6,
  groups: ['protein', 'grains'], uncertain: [], tier: 'fable', difficulty: 'medium', confidence: 'medium', createdAt: '2027-10-08T16:00:00.000Z',
};
const answers = { fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none' } as const;

beforeEach(async () => {
  for (const k of kv.keys()) kv.remove(k);
  hydrate();
  jest.clearAllMocks();
  await actions.consent(15, 0, true);
});

test('saving a check-in uploads it and clears it from the queue', async () => {
  actions.saveCheckin(answers, 19, today);
  await actions.sync();
  expect(uploadCheckins).toHaveBeenCalledWith([expect.objectContaining({ date: today })]);
  expect(kv.get(KEYS.syncQueue)).toEqual([]);
});

test('a failed upload keeps the date queued for the next sync', async () => {
  (uploadCheckins as jest.Mock).mockResolvedValueOnce([]);
  actions.saveCheckin(answers, 19, today);
  await actions.sync();
  expect(kv.get(KEYS.syncQueue)).toEqual([today]);
});

test('sync replaces the meal cache with the server rows', async () => {
  (fetchMeals as jest.Mock).mockResolvedValueOnce([record]);
  await actions.sync();
  expect(getState().meals).toEqual([record]);
  hydrate();
  expect(getState().meals).toEqual([record]);
});

test('an analysed photo is kept; not-food and errors keep nothing', async () => {
  (analyzeMeal as jest.Mock).mockResolvedValueOnce({ status: 'not_food' }).mockResolvedValueOnce({ status: 'error', reason: 'budget' }).mockResolvedValueOnce({ status: 'ok', record });
  expect((await actions.analyzeMeal('b64', 'lunch', today)).status).toBe('not_food');
  expect((await actions.analyzeMeal('b64', 'lunch', today)).status).toBe('error');
  expect(getState().meals).toEqual([]);
  expect((await actions.analyzeMeal('b64', 'lunch', today)).status).toBe('ok');
  expect(getState().meals.map((m) => m.id)).toEqual(['m1']);
});

test('a meal is removed locally only after the server removed it', async () => {
  (analyzeMeal as jest.Mock).mockResolvedValueOnce({ status: 'ok', record });
  await actions.analyzeMeal('b64', 'lunch', today);
  (deleteMeal as jest.Mock).mockResolvedValueOnce(false);
  expect(await actions.deleteMeal('m1')).toBe(false);
  expect(getState().meals).toHaveLength(1);
  expect(await actions.deleteMeal('m1')).toBe(true);
  expect(getState().meals).toHaveLength(0);
});

test('delete everything deletes nothing when the server cannot be reached', async () => {
  actions.saveCheckin(answers, 19, today);
  (deleteCloudAccount as jest.Mock).mockResolvedValueOnce(false);
  expect(await actions.deleteEverything()).toBe('offline');
  expect(getState().checkins).toHaveLength(1);
  expect(await actions.deleteEverything()).toBe('done');
  expect(kv.keys()).toEqual([KEYS.schema]);
});
