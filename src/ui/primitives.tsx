/**
 * Building blocks: grouped cards on paper, hairline separators, 44 pt targets, no shadows, no spinners.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './icons';
import { CELL_PAD, MIN_TAP, colors, radius, tabular, text, tint } from './theme';

// ---------- Text ----------

type TP = TextProps & { children: ReactNode; style?: StyleProp<TextStyle> };

export const LargeTitle = ({ children, style, ...r }: TP) => <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={[text.largeTitle, style]} {...r}>{children}</Text>;
export const Title = ({ children, style, ...r }: TP) => <Text accessibilityRole="header" style={[text.title, style]} {...r}>{children}</Text>;
export const Headline = ({ children, style, ...r }: TP) => <Text style={[text.headline, style]} {...r}>{children}</Text>;
export const Body = ({ children, style, ...r }: TP) => <Text style={[text.body, style]} {...r}>{children}</Text>;
export const Subhead = ({ children, style, ...r }: TP) => <Text style={[text.subhead, style]} {...r}>{children}</Text>;
export const Footnote = ({ children, style, ...r }: TP) => <Text style={[text.footnote, style]} {...r}>{children}</Text>;
export const SectionLabel = ({ children, style, ...r }: TP) => <Text accessibilityRole="header" style={[text.sectionLabel, style]} {...r}>{children}</Text>;

// ---------- Surfaces ----------

export function Card({ children, style, padded = true, tone, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean; tone?: 'surface' | 'green' | 'crimson' | 'soft'; testID?: string }) {
  const bg = tone === 'green' ? colors.greenSoft : tone === 'crimson' ? colors.crimsonSoft : tone === 'soft' ? colors.surface2 : colors.surface;
  return <View testID={testID} style={[styles.card, { backgroundColor: bg }, padded && styles.cardPadded, style]}>{children}</View>;
}

/** Section header above a card: label on the left, optional footnote on the right. */
export function SectionHeader({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <SectionLabel>{children}</SectionLabel>
      {typeof right === 'string' ? <Footnote>{right}</Footnote> : right}
    </View>
  );
}

export function SectionFooter({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Footnote style={[styles.sectionFooter, style]}>{children}</Footnote>;
}

/** A grouped-list row: optional icon, title + subtitle, optional value, chevron, press. */
export function Cell({ icon, iconColor = tint, title, subtitle, value, accessory = 'none', onPress, last, testID, accessibilityLabel, trailing }: { icon?: IconName; iconColor?: string; title: ReactNode; subtitle?: ReactNode; value?: string; accessory?: 'none' | 'chevron' | 'check'; onPress?: () => void; last?: boolean; testID?: string; accessibilityLabel?: string; trailing?: ReactNode }) {
  const content = (
    <View style={styles.cell}>
      {icon ? <Icon name={icon} size={22} color={iconColor} style={styles.cellIcon} /> : null}
      <View style={[styles.cellBody, !last && styles.cellSeparator]}>
        <View style={{ flex: 1 }}>
          {typeof title === 'string' ? <Body>{title}</Body> : title}
          {subtitle ? typeof subtitle === 'string' ? <Footnote style={{ marginTop: 2 }}>{subtitle}</Footnote> : subtitle : null}
        </View>
        {value ? <Text style={[text.body, tabular, { color: colors.ink2 }]}>{value}</Text> : null}
        {trailing}
        {accessory === 'chevron' ? <Icon name="chevron" size={16} color={colors.ink3} style={{ marginLeft: 6 }} /> : null}
        {accessory === 'check' ? <Icon name="check" size={18} color={tint} style={{ marginLeft: 6 }} /> : null}
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} testID={testID} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

export function Divider({ inset = CELL_PAD }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

// ---------- Controls ----------

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'green';

export function Button({ title, onPress, variant = 'primary', icon, disabled, style, testID, accessibilityHint }: { title: string; onPress: () => void; variant?: ButtonVariant; icon?: IconName; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string; accessibilityHint?: string }) {
  const bg = variant === 'primary' ? tint : variant === 'danger' ? colors.crimsonSoft : variant === 'green' ? colors.green : colors.surface;
  const fg = variant === 'primary' || variant === 'green' ? colors.white : variant === 'danger' ? colors.crimsonInk : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      testID={testID}
      style={({ pressed }) => [styles.button, { backgroundColor: bg }, variant === 'ghost' && styles.buttonGhost, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed, style]}>
      {icon ? <Icon name={icon} size={18} color={fg} style={{ marginRight: 6 }} /> : null}
      <Text maxFontSizeMultiplier={1.5} style={[text.button, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Toggle({ label, value, onChange, hint, last }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string; last?: boolean }) {
  return (
    <View style={styles.cell}>
      <View style={[styles.cellBody, !last && styles.cellSeparator]}>
        <View style={{ flex: 1 }}>
          <Body>{label}</Body>
          {hint ? <Footnote style={{ marginTop: 2 }}>{hint}</Footnote> : null}
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.green, false: colors.line }} accessibilityLabel={label} />
      </View>
    </View>
  );
}

/** − value + stepper, 44 pt targets. */
export function Stepper({ label, value, display, onChange, min, max, step = 1, last }: { label: string; value: number; display: string; onChange: (v: number) => void; min: number; max: number; step?: number; last?: boolean }) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  return (
    <View style={styles.cell}>
      <View style={[styles.cellBody, !last && styles.cellSeparator]}>
        <Body style={{ flex: 1 }}>{label}</Body>
        <Pressable onPress={dec} accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={value <= min} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, value <= min && styles.buttonDisabled]}>
          <Text style={[text.headline, { color: tint }]}>−</Text>
        </Pressable>
        <Text style={[text.body, tabular, styles.stepValue]} accessibilityLiveRegion="polite">{display}</Text>
        <Pressable onPress={inc} accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={value >= max} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, value >= max && styles.buttonDisabled]}>
          <Text style={[text.headline, { color: tint }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Badge({ children, tone = 'grey' }: { children: string; tone?: 'green' | 'grey' }) {
  return (
    <View style={[styles.badge, { backgroundColor: tone === 'green' ? colors.greenSoft : colors.surface2 }]}>
      <Text style={[text.footnote, { color: tone === 'green' ? colors.greenInk : colors.ink2, fontWeight: text.headline.fontWeight }]}>{children}</Text>
    </View>
  );
}

export function Callout({ icon, title, children, tone = 'soft' }: { icon: IconName; title?: string; children: ReactNode; tone?: 'soft' | 'green' | 'crimson' }) {
  const fg = tone === 'green' ? colors.greenInk : tone === 'crimson' ? colors.crimsonInk : colors.ink2;
  return (
    <Card tone={tone}>
      <View style={styles.calloutRow}>
        <Icon name={icon} size={22} color={fg} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          {title ? <Headline style={{ color: fg }}>{title}</Headline> : null}
          {typeof children === 'string' ? <Subhead style={[{ color: fg }, title ? { marginTop: 3 } : null]}>{children}</Subhead> : children}
        </View>
      </View>
    </Card>
  );
}

// ---------- Toast ----------

type ToastListener = (msg: string | null) => void;
let toastListener: ToastListener | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string) {
  toastListener?.(message);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastListener?.(null), 2600);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastListener = setMsg;
    return () => {
      toastListener = null;
    };
  }, []);
  if (!msg) return null;
  return (
    <View pointerEvents="none" style={styles.toastWrap} accessibilityLiveRegion="polite">
      <View style={styles.toast}>
        <Text style={[text.subhead, { color: colors.white }]}>{msg}</Text>
      </View>
    </View>
  );
}

export async function selectionHaptic() {
  try {
    await Haptics.selectionAsync();
  } catch {
    /* web / unsupported */
  }
}

export async function successHaptic() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    /* web / unsupported */
  }
}

export const pressStyle: PressableProps['style'] = ({ pressed }) => (pressed ? styles.pressed : null);

const styles = StyleSheet.create({
  card: { borderRadius: radius.m, marginBottom: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  cardPadded: { padding: CELL_PAD },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6, marginTop: 8 },
  sectionFooter: { paddingHorizontal: 4, marginTop: -4, marginBottom: 14 },
  cell: { flexDirection: 'row', alignItems: 'center', paddingLeft: CELL_PAD, minHeight: MIN_TAP, backgroundColor: colors.surface },
  cellIcon: { marginRight: 12 },
  cellBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingRight: CELL_PAD, gap: 8 },
  cellSeparator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  pressed: { opacity: 0.6 },
  button: { minHeight: 50, borderRadius: radius.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  buttonGhost: { borderWidth: 1, borderColor: colors.line },
  buttonDisabled: { opacity: 0.45 },
  stepBtn: { width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center', borderRadius: radius.s, backgroundColor: colors.surface2 },
  stepValue: { minWidth: 84, textAlign: 'center' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  calloutRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 110, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.m, maxWidth: '88%' },
});
