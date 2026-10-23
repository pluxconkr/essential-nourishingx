jest.mock('@/services/notifications', () => ({
  scheduleReminder: jest.fn(async () => 'notif-1'),
  cancelReminder: jest.fn(async () => {}),
  configureNotifications: jest.fn(async () => {}),
  onReminderTap: jest.fn(() => () => {}),
}));

import { kv } from '@/data/db';
import { KEYS } from '@/data/registry';
import { actions, getState, hydrate } from '@/store/appStore';
import { cancelReminder, scheduleReminder } from '@/services/notifications';

const today = '2027-10-08';

beforeEach(() => {
  for (const k of kv.keys()) kv.remove(k);
  hydrate();
  jest.clearAllMocks();
});

describe('store', () => {
  test('consent stores prefs and schedules the one reminder', async () => {
    await actions.consent(15, 0, true);
    expect(getState().prefs.consentedAt).not.toBeNull();
    expect(getState().prefs.notificationsEnabled).toBe(true);
    expect(scheduleReminder).toHaveBeenCalledTimes(1);
    expect(scheduleReminder).toHaveBeenCalledWith(15, 0);
  });
  test('consent with the permission denied leaves reminders off (Your data no longer promises one)', async () => {
    (scheduleReminder as jest.Mock).mockResolvedValueOnce(null);
    expect(await actions.consent(15, 0, true)).toBe(false);
    expect(getState().prefs.consentedAt).not.toBeNull();
    expect(getState().prefs.notificationsEnabled).toBe(false);
  });
  test('a reminder time change that cannot be scheduled turns reminders off', async () => {
    await actions.consent(15, 0, true);
    (scheduleReminder as jest.Mock).mockResolvedValueOnce(null);
    expect(await actions.setReminderTime(16, 30)).toBe(false);
    expect(getState().prefs).toMatchObject({ reminderHour: 16, reminderMinute: 30, notificationsEnabled: false });
  });
  test('real check-ins queue for upload; demo check-ins never do', () => {
    actions.saveCheckin({ fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none' }, 19, today);
    expect(kv.get(KEYS.syncQueue)).toEqual([today]);
    actions.loadDemo('watch', today);
    actions.saveCheckin({ fullness: 5, energy: 5, focus: 5, training: 'none', skipped: 'none' }, 12, '2027-10-09');
    expect(kv.get(KEYS.syncQueue)).toEqual([today]);
  });
  test('a second check-in on the same day overwrites the first; timing is recorded', () => {
    actions.saveCheckin({ fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none' }, 19, today);
    actions.saveCheckin({ fullness: 4, energy: 2, focus: 3, training: 'heavy', skipped: 'breakfast' }, 21, today);
    const { checkins, timing } = getState();
    expect(checkins).toHaveLength(1);
    expect(checkins[0]).toMatchObject({ date: today, fullness: 4, energy: 2, training: 'heavy', skipped: 'breakfast' });
    expect(timing).toEqual([19, 21]);
    // persisted
    hydrate();
    expect(getState().checkins).toHaveLength(1);
  });
  test('demo weeks replace records and Live restores them; demo saves are labelled and not timed', () => {
    actions.saveCheckin({ fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none' }, 19, today);
    actions.loadDemo('watch', today);
    expect(getState().prefs.demo).toBe('watch');
    expect(getState().checkins.every((c) => c.isDemo)).toBe(true);
    actions.saveCheckin({ fullness: 5, energy: 5, focus: 5, training: 'none', skipped: 'none' }, 12, today);
    expect(getState().checkins.find((c) => c.date === today)?.isDemo).toBe(true);
    expect(getState().timing).toEqual([19]);
    actions.loadDemo('live', today);
    expect(getState().checkins).toHaveLength(1);
    expect(getState().checkins[0].isDemo).toBeUndefined();
  });
  test('delete everything leaves only the schema key and cancels the reminder', async () => {
    await actions.consent(15, 0, true);
    actions.saveCheckin({ fullness: 3, energy: 3, focus: 3, training: 'light', skipped: 'none' }, 19, today);
    expect(await actions.deleteEverything()).toBe('done');
    expect(kv.keys().sort()).toEqual([KEYS.schema]);
    expect(cancelReminder).toHaveBeenCalled();
    expect(getState().prefs.consentedAt).toBeNull();
    expect(getState().checkins).toEqual([]);
  });
  test('turning reminders off cancels; turning on without permission reports failure', async () => {
    await actions.setNotificationsEnabled(false);
    expect(cancelReminder).toHaveBeenCalled();
    (scheduleReminder as jest.Mock).mockResolvedValueOnce(null);
    expect(await actions.setNotificationsEnabled(true)).toBe(false);
    expect(getState().prefs.notificationsEnabled).toBe(false);
  });
});
