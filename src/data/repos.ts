/**
 * Local-first repositories. Every read is synchronous and validated with zod, so a bad row can never
 * reach the rules. Nothing here touches the network.
 */
import { z } from 'zod';

import type { Checkin, DemoScenario, Prefs } from '@/domain/types';

import { kv } from './db';
import { KEYS, REGISTERED_KEYS, SCHEMA_VERSION } from './registry';

const Rating = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

export const CheckinSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fullness: Rating,
  energy: Rating,
  focus: Rating,
  training: z.enum(['none', 'light', 'moderate', 'heavy']),
  skipped: z.enum(['none', 'breakfast', 'lunch', 'dinner']),
  savedAt: z.string(),
  durationS: z.number().nullable(),
  isDemo: z.literal(true).optional(),
});

const PrefsSchema = z.object({
  consentedAt: z.string().nullable(),
  reminderHour: z.number().int().min(0).max(23),
  reminderMinute: z.number().int().min(0).max(59),
  notificationsEnabled: z.boolean(),
  demo: z.enum(['live', 'stable', 'watch', 'attention', 'sparse']),
});

export const DEFAULT_PREFS: Prefs = { consentedAt: null, reminderHour: 15, reminderMinute: 0, notificationsEnabled: true, demo: 'live' };

const MAX_CHECKINS = 400;
const MAX_TIMINGS = 60;

function sanitizeCheckins(raw: unknown): Checkin[] {
  if (!Array.isArray(raw)) return [];
  const out: Checkin[] = [];
  for (const r of raw) {
    const p = CheckinSchema.safeParse(r);
    if (p.success) out.push(p.data as Checkin);
  }
  // unique on date, oldest first
  const byDate = new Map<string, Checkin>();
  for (const c of out) byDate.set(c.date, c);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(-MAX_CHECKINS);
}

export const checkinRepo = {
  getAll(): Checkin[] {
    return sanitizeCheckins(kv.get(KEYS.checkins));
  },
  /** One record per day: a second check-in the same day overwrites the first (spec §6). */
  upsert(c: Checkin): Checkin[] {
    const next = sanitizeCheckins([...this.getAll().filter((x) => x.date !== c.date), c]);
    kv.set(KEYS.checkins, next);
    return next;
  },
  replaceAll(list: Checkin[]): Checkin[] {
    const next = sanitizeCheckins(list);
    kv.set(KEYS.checkins, next);
    return next;
  },
};

export const prefsRepo = {
  get(): Prefs {
    const p = PrefsSchema.safeParse(kv.get(KEYS.prefs));
    return p.success ? (p.data as Prefs) : { ...DEFAULT_PREFS };
  },
  set(prefs: Prefs): Prefs {
    kv.set(KEYS.prefs, prefs);
    return prefs;
  },
};

export const timingRepo = {
  getAll(): number[] {
    const raw = kv.get<unknown>(KEYS.timing);
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0) : [];
  },
  add(seconds: number): number[] {
    const next = [...this.getAll(), Math.round(seconds)].slice(-MAX_TIMINGS);
    kv.set(KEYS.timing, next);
    return next;
  },
  median(): number | null {
    const a = [...this.getAll()].sort((x, y) => x - y);
    if (a.length === 0) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  },
};

export interface ReminderRecord {
  id: string;
  hour: number;
  minute: number;
}

export const reminderRepo = {
  get(): ReminderRecord | null {
    const r = kv.get<ReminderRecord>(KEYS.reminder);
    return r && typeof r.id === 'string' ? r : null;
  },
  set(r: ReminderRecord | null): void {
    if (r) kv.set(KEYS.reminder, r);
    else kv.remove(KEYS.reminder);
  },
};

export const demoBackupRepo = {
  get(): Checkin[] | null {
    const raw = kv.get<unknown>(KEYS.demoBackup);
    return raw == null ? null : sanitizeCheckins(raw);
  },
  set(list: Checkin[] | null): void {
    if (list) kv.set(KEYS.demoBackup, list);
    else kv.remove(KEYS.demoBackup);
  },
};

export function initStorage(): void {
  if (kv.get<number>(KEYS.schema) !== SCHEMA_VERSION) kv.set(KEYS.schema, SCHEMA_VERSION);
}

/** Remove every registered key (and anything stray), then re-stamp the schema. */
export function wipeStorage(): void {
  for (const k of new Set<string>([...REGISTERED_KEYS, ...kv.keys()])) kv.remove(k);
  kv.set(KEYS.schema, SCHEMA_VERSION);
}

export type { DemoScenario };
