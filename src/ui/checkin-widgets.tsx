/** Check-in widgets: 1–5 scale, four-option choice, progress dots, live timer pill. */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';

import { MIN_TAP, colors, radius, tabular, text, tint } from './theme';
import { selectionHaptic } from './primitives';

export function ScaleRow<T extends number>({ options, value, onChange, label }: { options: readonly T[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.scale} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o;
        return (
          <Pressable
            key={o}
            onPress={() => {
              void selectionHaptic();
              onChange(o);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on }}
            accessibilityLabel={String(o)}
            style={({ pressed }) => [styles.scaleBtn, on && styles.on, pressed && !on && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.3} style={[text.scale, { color: on ? colors.white : colors.ink2 }]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChoiceRow<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T | null; onChange: (v: T) => void; label: string }) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              void selectionHaptic();
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on }}
            style={({ pressed }) => [styles.choiceBtn, on && styles.on, pressed && !on && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[text.headline, { color: on ? colors.white : colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressDots({ done, total = 5 }: { done: number; total?: number }) {
  return (
    <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={t('checkin.answered', { n: done })} accessibilityValue={{ now: done, min: 0, max: total }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i < done && { backgroundColor: tint }]} />
      ))}
    </View>
  );
}

/** Live seconds since the screen opened. Hidden from the screen reader while running; the saved toast carries the number. */
export function TimerPill({ startedAt, running }: { startedAt: number; running: boolean }) {
  // `now` only advances from the interval; when the screen refocuses with a later startedAt, elapsed reads 0 until the next tick.
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startedAt]);
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const label = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <View style={styles.pill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="timer-pill">
      <Text maxFontSizeMultiplier={1.3} style={[text.pill, tabular]}>{label}</Text>
    </View>
  );
}

export function secondsSince(startedAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.round((now - startedAt) / 1000));
}

const styles = StyleSheet.create({
  scale: { flexDirection: 'row', gap: 8 },
  scaleBtn: { flex: 1, aspectRatio: 1, minHeight: MIN_TAP, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceBtn: { flexGrow: 1, flexBasis: '45%', minHeight: 48, paddingHorizontal: 12, borderRadius: radius.m, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: tint, borderColor: tint },
  pressed: { backgroundColor: colors.surface2 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 8 },
  dot: { width: 28, height: 4, borderRadius: radius.pill, backgroundColor: colors.line },
  pill: { backgroundColor: colors.crimsonSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, minWidth: 54, alignItems: 'center' },
});
