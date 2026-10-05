/**
 * String inventory (spec §14): every student-facing string has an audience, an owner and a review date.
 * `reviewedOn` is filled during the week-7 review with the Health Center; the strings test enforces it
 * when STRINGS_GATE=1.
 */
import { en, type Key } from './en';

export type Audience = 'student' | 'consent' | 'notification' | 'internal';

export interface InventoryRow {
  audience: Audience;
  owner: string;
  reviewedOn: string | null;
}

function audienceOf(key: Key): Audience {
  if (key.startsWith('consent.') || key.startsWith('notnow.')) return 'consent';
  if (key.startsWith('notif.')) return 'notification';
  if (key.startsWith('time.')) return 'internal';
  return 'student';
}

export const inventory: Record<Key, InventoryRow> = Object.fromEntries(
  (Object.keys(en) as Key[]).map((k) => [k, { audience: audienceOf(k), owner: 'team', reviewedOn: null }]),
) as Record<Key, InventoryRow>;

/**
 * String IDs that must contain a word from the forbidden list: the pinned disclaimer, the consent sentence,
 * and the list of things the app never collects. Nothing else may.
 */
export const FORBIDDEN_ALLOWLIST: readonly Key[] = ['safety.disclaimer', 'consent.s6', 'data.never.body'];
