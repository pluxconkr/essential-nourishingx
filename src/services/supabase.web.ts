/** Web: the browser's own localStorage holds the session; static rendering (no window) keeps no session. */
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseConfig } from './supabase-config';

let client: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!client) {
    client = (async () => {
      const cfg = supabaseConfig();
      if (!cfg) return null;
      const { createClient } = await import('@supabase/supabase-js');
      const browser = typeof window !== 'undefined';
      return createClient(cfg.url, cfg.publishableKey, {
        auth: { storage: browser ? window.localStorage : undefined, autoRefreshToken: browser, persistSession: browser, detectSessionInUrl: false },
        // A hung request would hold the sync, and "Delete everything" waits for the sync.
        db: { timeout: 20_000 },
      });
    })();
  }
  return client;
}
