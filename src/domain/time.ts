/** Calendar helpers on local YYYY-MM-DD keys. No Expo imports. */

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The school's calendar date (New Hampshire, US Eastern): the day every server rule and staff total uses. Read from
 * en-US's MM/DD/YYYY, the most settled numeric format: en-CA's YYYY-MM-DD has changed between ICU versions, and Hermes
 * on the phone has DateTimeFormat.format but no formatToParts. '' if the format is ever something else. */
export function schoolDate(now: Date = new Date()): string {
  const us = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}

/** Check-ins older than this many days are no longer accepted by the server (private.upload_days() in
 * supabase/migrations/20261023173407_staff_closed_weeks.sql); a day is final the day after that. */
export const UPLOAD_DAYS = 2;

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(key: string, days: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key: string): number {
  return parseKey(key).getDay();
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86_400_000);
}

export type Daypart = 'morning' | 'afternoon' | 'evening';

export function daypart(hour: number): Daypart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function formatClock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad(minute)} ${hour < 12 ? 'am' : 'pm'}`;
}
