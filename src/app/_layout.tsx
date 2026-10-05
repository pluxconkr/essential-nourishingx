import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';

import { configureNotifications, onReminderTap } from '@/services/notifications';
import { hydrate, useAppState } from '@/store/appStore';
import { ToastHost } from '@/ui/primitives';
import { colors } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Synchronous hydration from disk: the first frame is the real Home. No network, no waiting.
hydrate();

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const consented = useAppState((s) => s.prefs.consentedAt !== null);
  // Already-mounted text keeps stale measurements when the user changes text size; remounting fixes it.
  const { fontScale } = useWindowDimensions();
  const router = useRouter();

  useEffect(() => {
    SplashScreen.hide();
    void configureNotifications();
    return onReminderTap(() => router.push('/checkin'));
  }, [router]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack key={`fs-${fontScale}`} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={!consented}>
          <Stack.Screen name="consent" />
          <Stack.Screen name="not-now" />
        </Stack.Protected>
        <Stack.Protected guard={consented}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="data" />
          <Stack.Screen name="how" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Screen name="health" options={{ presentation: 'modal' }} />
        <Stack.Screen name="privacy" />
      </Stack>
      <ToastHost />
    </>
  );
}
