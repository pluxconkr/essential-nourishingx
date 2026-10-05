/** Web fallback: localStorage with an in-memory mirror. Web is a must-not-crash target, not the product target. */
const mem = new Map<string, string>();
const PREFIX = 'nourishingx:';

function ls(): Storage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export const kv = {
  get<T>(key: string): T | null {
    try {
      const raw = ls()?.getItem(PREFIX + key) ?? mem.get(key) ?? null;
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): boolean {
    const raw = JSON.stringify(value);
    mem.set(key, raw);
    try {
      ls()?.setItem(PREFIX + key, raw);
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    mem.delete(key);
    try {
      ls()?.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
  keys(): string[] {
    const s = ls();
    if (!s) return [...mem.keys()];
    const out: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k.slice(PREFIX.length));
    }
    return out;
  },
};

export type KV = typeof kv;
