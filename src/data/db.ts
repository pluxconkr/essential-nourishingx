/**
 * Synchronous key-value store on SQLite (expo-sqlite/kv-store). Values are JSON.
 * Reads are synchronous so the first frame renders from disk — the check-in "writes locally" (spec §13).
 * Web gets db.web.ts.
 */
import { SQLiteStorage } from 'expo-sqlite/kv-store';

const store = new SQLiteStorage('nourishingx');

export const kv = {
  get<T>(key: string): T | null {
    try {
      const raw = store.getItemSync(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  /** false when the write did not reach disk. */
  set(key: string, value: unknown): boolean {
    try {
      store.setItemSync(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (__DEV__) console.warn('[kv] set failed', key, e);
      return false;
    }
  },
  remove(key: string): void {
    try {
      store.removeItemSync(key);
    } catch {
      /* ignore */
    }
  },
  keys(): string[] {
    try {
      return store.getAllKeysSync();
    } catch {
      return [];
    }
  },
};

export type KV = typeof kv;
