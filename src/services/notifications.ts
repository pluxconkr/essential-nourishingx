/**
 * The one reminder: a local daily notification at the time the student chose (spec "The one scheduled function").
 * One per day, never two, no re-nudge, silent on failure. Nothing is stored anywhere but this phone.
 * Expo SDK 57: SchedulableTriggerInputTypes.DAILY { hour, minute }. Local notifications work in Expo Go.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { reminderRepo } from '@/data/repos';
import { t } from '@/i18n';

export const CHANNEL_ID = 'nourishingx';
/** One fixed id for the one reminder, so a cancel always finds it, whichever call scheduled it. */
const REMINDER_ID = 'nourishingx-daily-reminder';
let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: t('notif.channel'),
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150],
      });
    }
    configured = true;
  } catch {
    /* notifications unavailable (e.g. simulator restrictions); the next call tries again */
  }
}

/**
 * Reminder changes run one at a time. Two quick taps on the time stepper used to overlap and leave two DAILY
 * reminders scheduled, one of which survived "Delete everything" (reproduced with mocked expo-notifications).
 */
let pending: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = pending.then(fn, fn);
  pending = run.catch(() => undefined);
  return run;
}

export async function ensurePermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted || cur.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) return true;
    if (!cur.canAskAgain) return false;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

async function cancelNow(): Promise<void> {
  const stored = reminderRepo.get();
  reminderRepo.set(null);
  // The stored id covers reminders scheduled before REMINDER_ID existed.
  for (const id of new Set([REMINDER_ID, stored?.id].filter((x): x is string => Boolean(x)))) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      /* nothing scheduled under this id */
    }
  }
}

export function cancelReminder(): Promise<void> {
  return oneAtATime(cancelNow);
}

/** Replace the one scheduled reminder. Returns the notification id, or null when permission is missing. */
export function scheduleReminder(hour: number, minute: number): Promise<string | null> {
  return oneAtATime(async () => {
    await cancelNow();
    await configureNotifications();
    if (!(await ensurePermission())) return null;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_ID,
        content: { title: t('notif.title'), body: t('notif.body'), data: { url: '/checkin' } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
          ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
        },
      });
      reminderRepo.set({ id, hour, minute });
      return id;
    } catch {
      return null;
    }
  });
}

/** Route a tap on the reminder to the Check-in tab. Returns an unsubscribe. */
export function onReminderTap(handler: () => void): () => void {
  let active = true;
  Notifications.getLastNotificationResponseAsync()
    .then((r) => {
      if (active && r?.notification.request.content.data?.url === '/checkin') handler();
    })
    .catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    if (r.notification.request.content.data?.url === '/checkin') handler();
  });
  return () => {
    active = false;
    sub.remove();
  };
}
