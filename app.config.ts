/**
 * Adds the Supabase project's public settings to app.json at build time. The Expo CLI loads .env.local first,
 * so SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY come from there. Both are public by design (the publishable key
 * only works within RLS); secret keys are never read here. Without them the app runs in local-only mode.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? null,
  },
});
