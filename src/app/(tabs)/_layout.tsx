import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';

import { t } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { colors, text, tint } from '@/ui/theme';

function TabIcon({ name, color }: { name: IconName; color: string }) {
  return <Icon name={name} size={24} color={color} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: colors.ink2,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarAllowFontScaling: false,
        lazy: false,
        sceneStyle: { backgroundColor: colors.paper },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'home' : 'homeOutline'} color={String(color)} /> }} />
      <Tabs.Screen name="checkin" options={{ title: t('tab.checkin'), tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'checkin' : 'checkinOutline'} color={String(color)} /> }} />
      <Tabs.Screen name="balance" options={{ title: t('tab.balance'), tabBarIcon: ({ color, focused }) => <TabIcon name={focused ? 'balance' : 'balanceOutline'} color={String(color)} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, height: Platform.OS === 'ios' ? 84 : 64, paddingTop: 6 },
  label: { ...text.tabLabel, marginTop: 1 },
});
