/** Date words for screens, from the string table. */
import { t, tlist } from '@/i18n';

import { daypart, parseKey, weekday } from './time';

export function longDate(key: string): string {
  const d = parseKey(key);
  return `${tlist('time.daysLong')[weekday(key)]} ${d.getDate()} ${tlist('time.months')[d.getMonth()]}`;
}

export function shortDate(key: string): string {
  const d = parseKey(key);
  return `${tlist('time.days')[weekday(key)]} ${d.getDate()} ${tlist('time.months')[d.getMonth()].slice(0, 3)}`;
}

export function greeting(hour: number): string {
  return t(`greeting.${daypart(hour)}`);
}
