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
let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'NourishingX',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 150],
      });
    }
  } catch {
    /* notifications unavailable (e.g. simulator restrictions) */
  }
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

export async function cancelReminder(): Promise<void> {
  const existing = reminderRepo.get();
  reminderRepo.set(null);
  if (!existing) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(existing.id);
  } catch {
    /* ignore */
  }
}

/** Replace the one scheduled reminder. Returns the notification id, or null when permission is missing. */
export async function scheduleReminder(hour: number, minute: number): Promise<string | null> {
  await cancelReminder();
  await configureNotifications();
  if (!(await ensurePermission())) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
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
