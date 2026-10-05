/** Web export: download a CSV blob. */
import type { Checkin } from '@/domain/types';

export function toCsv(checkins: readonly Checkin[]): string {
  const rows = checkins.filter((c) => !c.isDemo).map((c) => [c.date, c.fullness, c.energy, c.focus, c.training, c.skipped, c.savedAt].join(','));
  return ['date,fullness,energy,focus,training,skipped,saved_at', ...rows].join('\n') + '\n';
}

export async function exportCheckins(checkins: readonly Checkin[]): Promise<boolean> {
  const real = checkins.filter((c) => !c.isDemo);
  if (real.length === 0 || typeof document === 'undefined') return false;
  const blob = new Blob([toCsv(real)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nourishingx-checkins.csv';
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
