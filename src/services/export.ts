/**
 * Student export: a CSV of the student's own records, shared through the system share sheet.
 * Demo records are never exported. Expo SDK 57 file API (File / Paths).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { Checkin } from '@/domain/types';
import { t } from '@/i18n';

export function toCsv(checkins: readonly Checkin[]): string {
  const rows = checkins.filter((c) => !c.isDemo).map((c) => [c.date, c.fullness, c.energy, c.focus, c.training, c.skipped, c.savedAt].join(','));
  return ['date,fullness,energy,focus,training,skipped,saved_at', ...rows].join('\n') + '\n';
}

const EXPORT_FILE = 'nourishingx-checkins.csv';

/** "Delete everything" also removes the last export, which used to stay in the app cache. */
export function deleteExportFile(): void {
  try {
    const file = new File(Paths.cache, EXPORT_FILE);
    if (file.exists) file.delete();
  } catch {
    /* no export was made */
  }
}

/** Returns true when a share sheet was shown. */
export async function exportCheckins(checkins: readonly Checkin[]): Promise<boolean> {
  const real = checkins.filter((c) => !c.isDemo);
  if (real.length === 0) return false;
  try {
    const file = new File(Paths.cache, EXPORT_FILE);
    if (file.exists) file.delete();
    file.create();
    file.write(toCsv(real));
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: t('data.export.dialogTitle') });
    return true;
  } catch {
    return false;
  }
}
