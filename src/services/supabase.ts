/**
 * Supabase client for the phone (ADR 0001), set up as the Supabase Expo quickstart does: URL polyfill plus
 * expo-sqlite's localStorage polyfill for the session. Public settings come from app.config.ts; without them the
 * app stays local-only and this returns null. The polyfills load lazily so tests and local-only builds skip them.
 * Web gets supabase.web.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { supabaseConfig } from './supabase-config';

let client: Promise<SupabaseClient | null> | null = null;

export function getSupabase(): Promise<SupabaseClient | null> {
  if (!client) {
    client = (async () => {
      const cfg = supabaseConfig();
      if (!cfg) return null;
      await import('react-native-url-polyfill/auto');
      await import('expo-sqlite/localStorage/install');
      const { createClient } = await import('@supabase/supabase-js');
      return createClient(cfg.url, cfg.publishableKey, {
        auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
      });
    })();
  }
  return client;
}
