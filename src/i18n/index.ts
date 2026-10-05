/**
 * Tiny string table: t(key, params) with {name} placeholders and .one/.other plurals.
 * No Expo imports — shared by the domain layer, tests and scripts.
 */
import { en, type Key } from './en';

export type { Key };

export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Keys that exist as a `.one` / `.other` pair. */
type PluralKeyOf<K> = K extends `${infer B}.one` ? (`${B}.other` extends Key ? B : never) : never;
export type PluralKey = PluralKeyOf<Key>;

/** English-style plural: exactly one vs. everything else. Fills {n} automatically. */
export function tn(n: number, key: PluralKey, params?: Record<string, string | number>): string {
  return t(`${key}.${n === 1 ? 'one' : 'other'}` as Key, { n, ...(params ?? {}) });
}

/** Comma-separated list keys → array. */
export function tlist(key: Key): string[] {
  return t(key).split(',');
}
