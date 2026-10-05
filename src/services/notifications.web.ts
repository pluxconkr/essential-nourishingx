/** Web: no notifications. Same surface, no-ops. */
export const CHANNEL_ID = 'nourishingx';
export async function configureNotifications(): Promise<void> {}
export async function ensurePermission(): Promise<boolean> {
  return false;
}
export async function cancelReminder(): Promise<void> {}
export async function scheduleReminder(_hour: number, _minute: number): Promise<string | null> {
  return null;
}
export function onReminderTap(_handler: () => void): () => void {
  return () => {};
}
