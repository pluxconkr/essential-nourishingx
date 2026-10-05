/**
 * Student export: a CSV of the student's own records, shared through the system share sheet.
 * Demo records are never exported. Expo SDK 57 file API (File / Paths).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Checkin } from '@/domain/types';

export function toCsv(checkins: readonly Checkin[]): string {
  const rows = checkins.filter((c) => !c.isDemo).map((c) => [c.date, c.fullness, c.energy, c.focus, c.training, c.skipped, c.savedAt].join(','));
  return ['date,fullness,energy,focus,training,skipped,saved_at', ...rows].join('\n') + '\n';
}

/** Returns true when a share sheet was shown. */
export async function exportCheckins(checkins: readonly Checkin[]): Promise<boolean> {
  const real = checkins.filter((c) => !c.isDemo);
  if (real.length === 0) return false;
  try {
    const file = new File(Paths.cache, 'nourishingx-checkins.csv');
    if (file.exists) file.delete();
    file.create();
    file.write(toCsv(real));
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'My check-ins' });
    return true;
  } catch {
    return false;
  }
}
