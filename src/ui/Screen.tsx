/**
 * Screen scaffold. Every student screen carries the SafetyBar below the scroll view:
 * "This app does not diagnose any condition" + the Health Center button (spec §11 hard rule — never dismissable).
 */
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { useDemoScenario } from '@/store/derived';

import { Icon } from './icons';
import { GUTTER, MIN_TAP, colors, text, tint } from './theme';

export function goBackOr(router: ReturnType<typeof useRouter>, fallback: '/' | '/checkin' | '/balance' = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function SafetyBar({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.safety, { paddingBottom: Math.max(insets.bottom, 10) }]} accessibilityRole="summary">
      <Text maxFontSizeMultiplier={1.3} style={[text.footnote, { flex: 1 }]} testID="safety-disclaimer">
        {t('safety.disclaimer')}
      </Text>
      {compact ? null : (
        <Pressable onPress={() => router.push('/health')} accessibilityRole="button" accessibilityLabel={t('safety.health')} testID="safety-health" style={({ pressed }) => [styles.safetyBtn, pressed && { opacity: 0.6 }]}>
          <Icon name="health" size={16} color={tint} />
          <Text maxFontSizeMultiplier={1.3} style={[text.footnote, { color: tint, fontWeight: text.headline.fontWeight }]}>
            {t('safety.health')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function DemoFootnote() {
  const demo = useDemoScenario();
  if (demo === 'live') return null;
  return (
    <Text style={styles.note} accessibilityLiveRegion="polite">
      {t('demo.footnote', { name: t(`demo.${demo}`) })}
    </Text>
  );
}

export function BackHeader({ title, fallback }: { title: string; fallback?: '/' | '/checkin' | '/balance' }) {
  const router = useRouter();
  return (
    <View style={styles.navBar}>
      <Pressable onPress={() => goBackOr(router, fallback)} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.5 }]}>
        <Icon name="back" size={22} color={tint} />
        <Text maxFontSizeMultiplier={1.3} style={[text.body, { color: tint }]}>{t('common.back')}</Text>
      </Pressable>
      <Text maxFontSizeMultiplier={1.3} style={styles.navTitle} numberOfLines={1}>{title}</Text>
      <View style={styles.navRight} />
    </View>
  );
}

export function Screen({ children, title, largeTitle, subtitle, headerRight, safety = 'full', scroll = true, fallback, testID }: { children: ReactNode; /** Sub-screen nav bar title (renders a back button). */ title?: string; largeTitle?: string; subtitle?: string; headerRight?: ReactNode; /** 'full' = disclaimer + Health Center button; 'text' = disclaimer only (the Health Center sheet itself); 'none' only for consent screens before any data exists. */ safety?: 'full' | 'text' | 'none'; scroll?: boolean; fallback?: '/' | '/checkin' | '/balance'; testID?: string }) {
  const insets = useSafeAreaInsets();
  const header = largeTitle ? (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={text.largeTitle}>{largeTitle}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <DemoFootnote />
      </View>
      {headerRight ? <View style={{ paddingBottom: 6 }}>{headerRight}</View> : null}
    </View>
  ) : null;
  const body = <View style={styles.padded}>{children}</View>;
  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID={testID}>
      {title ? <BackHeader title={title} fallback={fallback} /> : null}
      {scroll ? (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="never">
          {header}
          {body}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>
          {header}
          {body}
        </View>
      )}
      {safety === 'none' ? null : <SafetyBar compact={safety === 'text'} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  padded: { paddingHorizontal: GUTTER },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: 10 },
  subtitle: { ...text.subhead, marginTop: 4 },
  note: { ...text.footnote, marginTop: 3, color: colors.amber },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, minHeight: MIN_TAP },
  backBtn: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP, paddingRight: 8, minWidth: 84, gap: 2 },
  navTitle: { flex: 1, textAlign: 'center', ...text.headline },
  navRight: { minWidth: 84 },
  safety: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUTTER, paddingTop: 10, backgroundColor: colors.surface2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  safetyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: MIN_TAP, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});
