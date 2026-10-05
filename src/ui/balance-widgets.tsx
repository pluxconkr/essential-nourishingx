/**
 * Home and Balance widgets. The state word is never colour alone (dot + word); the week strip uses one
 * neutral colour with hollow slots for missing days; evidence carries icons and words.
 */
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { addDays, weekday } from '@/domain/time';
import type { Checkin, Evidence, StateWord } from '@/domain/types';
import { t, tlist, tn } from '@/i18n';

import { Icon, type IconName } from './icons';
import { Card, Footnote, Headline, SectionLabel, Subhead } from './primitives';
import { colors, radius, stateTone, text, tint } from './theme';

export function stateWord(state: StateWord): string {
  return t(`state.${state}`);
}

export function StateWordView({ state, testID }: { state: StateWord; testID?: string }) {
  const tone = stateTone[state];
  return (
    <View style={styles.stateRow} accessibilityRole="header" accessibilityLabel={`${t('balance.card.label')}: ${stateWord(state)}`} testID={testID}>
      <View style={[styles.stateDot, { backgroundColor: tone.dot }]} />
      <Text maxFontSizeMultiplier={1.3} style={[text.display, { color: tone.text }]}>{stateWord(state)}</Text>
    </View>
  );
}

/** Seven bars, oldest first. Height = energy ÷ 5; hollow when there is no check-in. One neutral colour. */
export function WeekStrip({ window, today, detailed = false }: { window: readonly (Checkin | null)[]; today: string; detailed?: boolean }) {
  const days = tlist('time.days');
  const daysLong = tlist('time.daysLong');
  return (
    <View style={styles.strip} accessibilityRole="list">
      {window.map((c, k) => {
        const date = addDays(today, k - 6);
        const wd = weekday(date);
        const label = c ? (detailed ? `${daysLong[wd]}, energy ${c.energy} ${t('common.outOfFive')}` : `${daysLong[wd]}, checked in`) : `${daysLong[wd]}, no check-in`;
        return (
          <View key={date} style={styles.stripCol} accessible accessibilityLabel={label}>
            <View style={[styles.bar, !c && styles.barHollow]}>{c ? <View style={[styles.barFill, { height: `${(c.energy / 5) * 100}%` }]} /> : null}</View>
            <Text style={[text.footnote, { marginTop: 4 }]}>{days[wd].slice(0, 1)}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function ScoreBox({ label, value, caption, testID }: { label: string; value: string; caption: string; testID?: string }) {
  return (
    <View style={styles.score} testID={testID} accessible accessibilityLabel={`${label} ${value} ${t('common.outOfFive')}, ${caption}`}>
      <Text maxFontSizeMultiplier={1.3} style={text.score}>{value}</Text>
      <SectionLabel style={{ marginTop: 2 }}>{label}</SectionLabel>
      <Footnote numberOfLines={2}>{caption}</Footnote>
    </View>
  );
}

export function Suggestion({ label, heading, body }: { label: string; heading: string; body: string }) {
  return (
    <Card tone="green">
      <SectionLabel style={{ color: colors.greenInk }}>{label}</SectionLabel>
      <Headline style={{ color: colors.greenInk, marginTop: 4 }}>{heading}</Headline>
      <Subhead style={{ color: colors.greenInk, marginTop: 4 }}>{body}</Subhead>
    </Card>
  );
}

export function MenuCard({ meal, hours, items, footnote }: { meal: string; hours: string; items: string[]; footnote: string }) {
  return (
    <View style={styles.menu} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="meals" size={20} color={colors.onDark} />
        <Text style={[text.sectionLabel, { color: colors.onDark }]}>{t('home.menu.label')}</Text>
      </View>
      <Text maxFontSizeMultiplier={1.4} style={[text.headline, { color: colors.white, marginTop: 8 }]}>{t('home.menu.meal', { meal, hours })}</Text>
      <View style={{ marginTop: 8, gap: 3 }}>
        {items.length === 0 ? <Text style={[text.subhead, { color: colors.onDark }]}>{t('home.menu.none')}</Text> : items.map((it) => <Text key={it} style={[text.subhead, { color: colors.white }]}>{it}</Text>)}
      </View>
      <Text style={[text.footnote, { color: colors.onDark, marginTop: 10 }]}>{footnote}</Text>
    </View>
  );
}

const EVIDENCE_ICON: Record<Evidence['category'], IconName> = { skipped: 'meals', training: 'training', fullness: 'fullness', energy: 'energy', focus: 'focus' };

export function evidenceText(e: Evidence): { title: string; line: string } {
  switch (e.category) {
    case 'skipped':
      return { title: t('ev.skipped.title'), line: e.count === 0 ? t('ev.skipped.none') : tn(e.count, 'ev.skipped.n') };
    case 'training':
      return { title: t('ev.training.title'), line: e.count === 0 ? t('ev.training.none') : tn(e.count, 'ev.training.n') };
    case 'fullness':
      return { title: t('ev.fullness.title'), line: t(`ev.fullness.${e.direction ?? 'steady'}`) };
    case 'energy':
      return { title: t('ev.energy.title'), line: e.count === 0 ? t('ev.energy.none') : tn(e.count, 'ev.energy.n') };
    case 'focus':
      return { title: t('ev.focus.title'), line: e.count === 0 ? t('ev.focus.none') : tn(e.count, 'ev.focus.n') };
  }
}

export function EvidenceRow({ evidence }: { evidence: Evidence }) {
  const { title, line } = evidenceText(evidence);
  return (
    <View style={styles.evRow} accessible accessibilityLabel={`${title}: ${line}`}>
      <View style={styles.evIcon}>
        <Icon name={EVIDENCE_ICON[evidence.category]} size={18} color={colors.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Headline>{title}</Headline>
        <Subhead style={{ marginTop: 1 }}>{line}</Subhead>
      </View>
    </View>
  );
}

export function ActionRow({ n, action }: { n: number; action: string }) {
  return (
    <View style={styles.actionRow} accessible accessibilityLabel={`${n}. ${action}`}>
      <View style={styles.actionNum}>
        <Text style={[text.footnote, { color: colors.white, fontWeight: text.headline.fontWeight }]}>{n}</Text>
      </View>
      <Subhead style={{ flex: 1, color: colors.greenInk }}>{action}</Subhead>
    </View>
  );
}

export function AttentionCard({ phoneDisplay, phone, firm, onReach, messageText }: { phoneDisplay: string; phone: string; firm: boolean; onReach: () => void; messageText: string }) {
  return (
    <Card tone="crimson" testID="attention-card">
      <SectionLabel style={{ color: colors.crimsonInk }}>{t('attention.title')}</SectionLabel>
      <Subhead style={{ color: colors.crimsonInk, marginTop: 6 }}>{t(firm ? 'attention.firm' : 'attention.body', { phone: phoneDisplay })}</Subhead>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Pressable onPress={() => void Linking.openURL(`tel:${phone}`)} accessibilityRole="button" accessibilityLabel={`${t('health.call')} ${t('health.phone')}`} style={({ pressed }) => [styles.smallBtn, { backgroundColor: tint }, pressed && { opacity: 0.6 }]}>
          <Icon name="call" size={16} color={colors.white} />
          <Text style={[text.footnote, { color: colors.white, fontWeight: text.headline.fontWeight }]}>{t('health.call')}</Text>
        </Pressable>
        <Pressable onPress={onReach} accessibilityRole="button" style={({ pressed }) => [styles.smallBtn, styles.smallGhost, pressed && { opacity: 0.6 }]}>
          <Text style={[text.footnote, { color: colors.crimsonInk, fontWeight: text.headline.fontWeight }]}>{t('attention.reach')}</Text>
        </Pressable>
        {firm ? (
          <Pressable onPress={() => void Linking.openURL(`sms:${phone}?body=${encodeURIComponent(messageText)}`)} accessibilityRole="button" style={({ pressed }) => [styles.smallBtn, styles.smallGhost, pressed && { opacity: 0.6 }]}>
            <Icon name="message" size={16} color={colors.crimsonInk} />
            <Text style={[text.footnote, { color: colors.crimsonInk, fontWeight: text.headline.fontWeight }]}>{t('attention.message')}</Text>
          </Pressable>
        ) : null}
      </View>
      <Footnote style={{ color: colors.crimsonInk, marginTop: 10 }}>{t('attention.footnote')}</Footnote>
    </Card>
  );
}

const styles = StyleSheet.create({
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stateDot: { width: 12, height: 12, borderRadius: 6 },
  strip: { flexDirection: 'row', gap: 6, marginTop: 12 },
  stripCol: { flex: 1, alignItems: 'center' },
  bar: { width: '100%', height: 44, borderRadius: radius.s, backgroundColor: colors.surface2, justifyContent: 'flex-end', overflow: 'hidden' },
  barHollow: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.ink3 },
  barFill: { width: '100%', backgroundColor: tint, opacity: 0.7, borderTopLeftRadius: radius.s, borderTopRightRadius: radius.s },
  score: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 12, minHeight: 96 },
  menu: { backgroundColor: tint, borderRadius: radius.l, padding: 16, marginBottom: 12 },
  evRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 12, marginBottom: 8 },
  evIcon: { width: 30, height: 30, borderRadius: radius.s, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  actionRow: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.greenSoft, borderRadius: radius.m, padding: 12, marginBottom: 8 },
  actionNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.s },
  smallGhost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
});
