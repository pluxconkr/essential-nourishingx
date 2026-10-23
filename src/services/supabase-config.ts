/** The Supabase project's public settings from app.config.ts, or null in local-only mode. */
import Constants from 'expo-constants';

export function supabaseConfig(): { url: string; publishableKey: string } | null {
  const extra = Constants.expoConfig?.extra as { supabaseUrl?: string | null; supabasePublishableKey?: string | null } | undefined;
  return extra?.supabaseUrl && extra.supabasePublishableKey ? { url: extra.supabaseUrl, publishableKey: extra.supabasePublishableKey } : null;
}
