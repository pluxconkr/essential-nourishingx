/** Store behaviour around Supabase, with src/services/cloud mocked (the real client needs the network). */
jest.mock('@/services/notifications', () => ({
  scheduleReminder: jest.fn(async () => 'notif-1'),
  cancelReminder: jest.fn(async () => {}),
  configureNotifications: jest.fn(async () => {}),
  onReminderTap: jest.fn(() => () => {}),
}));
jest.mock('@/services/cloud', () => ({
  connect: jest.fn(async () => true),
  uploadCheckins: jest.fn(),
  fetchMeals: jest.fn(async () => []),
  fetchMenus: jest.fn(async () => ({})),
  analyzeMeal: jest.fn(),
  deleteMeal: jest.fn(async () => true),
  deleteCloudAccount: jest.fn(async () => true),
}));

import { kv } from '@/data/db';
import { KEYS } from '@/data/registry';
import type { MealRecord } from '@/domain/types';
import { analyzeMeal, deleteCloudAccount, deleteMeal, fetchMeals, fetchMenus, uploadCheckins } from '@/services/cloud';
import { menuForToday } from '@/services/menu';
import { actions, getState, hydrate } from '@/store/appStore';

const today = '2027-10-08';
const record: MealRecord = {
  id: 'm1', date: today, meal: 'lunch', items: [], kcal: 520, kcalLow: 430, kcalHigh: 650, protein_g: 31, carbs_g: 60, fat_g: 14, fiber_g: 6,
  groups: ['protein', 'grains'], uncertain: [], tier: 'fable', difficulty: 'medium', confidence: 'medium', createdAt: '2027-10-08T16:00:00.000Z',
};
const answers = { fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none' } as const;
/** Waits (a bounded number of turns, so a wrong condition fails instead of hanging) for a mock call to happen. */
const until = async (done: () => boolean) => {
  for (let i = 0; i < 50 && !done(); i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(async () => {
  for (const k of kv.keys()) kv.remove(k);
  hydrate();
  jest.clearAllMocks();
  // Every upload succeeds unless a test says otherwise (set here, so a test's override ends with the test).
  (uploadCheckins as jest.Mock).mockImplementation(async (rows: { date: string }[]) => rows.map((r) => r.date));
  await actions.consent(15, 0, true);
});

test('saving a check-in uploads it and clears it from the queue', async () => {
  actions.saveCheckin(answers, 19, today);
  await actions.sync();
  expect(uploadCheckins).toHaveBeenCalledWith([expect.objectContaining({ date: today })]);
  expect(kv.get(KEYS.syncQueue)).toEqual([]);
});

test('a failed upload keeps the date queued for the next sync', async () => {
  (uploadCheckins as jest.Mock).mockResolvedValue([]);
  actions.saveCheckin(answers, 19, today);
  await actions.sync();
  expect(kv.get(KEYS.syncQueue)).toEqual([today]);
});

test('a queued day the server no longer accepts leaves the queue without an upload', async () => {
  await actions.sync();
  kv.set(KEYS.syncQueue, ['2020-01-01']);
  await actions.sync();
  expect(uploadCheckins).not.toHaveBeenCalled();
  expect(kv.get(KEYS.syncQueue)).toEqual([]);
});

test('a day saved again while its upload is in flight is uploaded again with the new answers', async () => {
  await actions.sync();
  jest.clearAllMocks();
  let finish: (dates: string[]) => void = () => {};
  (uploadCheckins as jest.Mock).mockImplementationOnce(() => new Promise<string[]>((resolve) => (finish = resolve)));
  actions.saveCheckin(answers, 19, today);
  await until(() => (uploadCheckins as jest.Mock).mock.calls.length === 1);
  actions.saveCheckin({ ...answers, energy: 5 }, 19, today);
  finish([today]);
  await actions.sync();
  const calls = (uploadCheckins as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[1][0]).toEqual([expect.objectContaining({ date: today, energy: 5 })]);
  expect(kv.get(KEYS.syncQueue)).toEqual([]);
});

test('sync replaces the meal cache with the server rows', async () => {
  (fetchMeals as jest.Mock).mockResolvedValueOnce([record]);
  await actions.sync();
  expect(getState().meals).toEqual([record]);
  hydrate();
  expect(getState().meals).toEqual([record]);
});

test("sync keeps Dining Services' menu; a dated entry beats the template, which beats the bundled table", async () => {
  const day = (item: string) => ({ breakfast: [], lunch: [{ item, station: 'Hot line', tags: [] }], dinner: [] });
  (fetchMenus as jest.Mock).mockResolvedValueOnce({ weekday: day('Entered weekday soup'), '2027-10-08': day('Entered for today'), broken: { lunch: 'x' } });
  await actions.sync();
  expect(Object.keys(getState().menus).sort()).toEqual(['2027-10-08', 'weekday']);
  hydrate();
  const menus = getState().menus;
  expect(menuForToday(today, 12, menus)).toMatchObject({ source: 'today', items: [{ item: 'Entered for today' }] });
  expect(menuForToday('2027-10-11', 12, menus)).toMatchObject({ source: 'template', items: [{ item: 'Entered weekday soup' }] }); // a Monday
  expect(menuForToday('2027-10-11', 12, {})?.items[0].item).toBe('Rice bowl (build your own)');
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

test('delete everything waits for a sync in flight, and nothing that sync fetched lands after the wipe', async () => {
  await actions.sync();
  jest.clearAllMocks();
  let finish: (meals: MealRecord[]) => void = () => {};
  (fetchMeals as jest.Mock).mockImplementationOnce(() => new Promise<MealRecord[]>((resolve) => (finish = resolve)));
  void actions.sync();
  await until(() => (fetchMeals as jest.Mock).mock.calls.length === 1);
  const deleted = actions.deleteEverything();
  await Promise.resolve();
  expect(deleteCloudAccount).not.toHaveBeenCalled();
  finish([record]);
  expect(await deleted).toBe('done');
  expect(getState().meals).toEqual([]);
  expect(kv.keys()).toEqual([KEYS.schema]);
});
