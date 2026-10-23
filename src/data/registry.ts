/**
 * The complete list of keys the phone stores. "Delete everything" enumerates this list;
 * a test asserts that no other key literal is written anywhere.
 */
export const KEYS = {
  schema: 'schema',
  checkins: 'checkins',
  prefs: 'prefs',
  timing: 'timing',
  reminder: 'reminder',
  demoBackup: 'demoBackup',
  /** Dates of check-ins not yet uploaded (Supabase sync). */
  syncQueue: 'syncQueue',
  /** The student's own analysed meal photos, cached from Supabase (the photos themselves are never kept). */
  meals: 'meals',
} as const;

export type StoreKey = (typeof KEYS)[keyof typeof KEYS];

export const REGISTERED_KEYS: readonly StoreKey[] = Object.values(KEYS);

export const SCHEMA_VERSION = 1;
