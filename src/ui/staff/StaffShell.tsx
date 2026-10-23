/**
 * The staff dashboard frame (web): sidebar in three groups (plan: Dining Services / Health & Wellness / How it works),
 * the synthetic-data banner on every view, the signed-in account, and a readable content column. Below
 * STAFF.narrow the sidebar folds into a row of links above the page.
 */
import { usePathname, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import schoolJson from '@/assets/data/school.json';
import { SYNTHETIC } from '@/domain/synthetic';
import { ts, type StaffKey } from '@/i18n/staff';
import { staffOverview, staffSignOut } from '@/services/staff';

import { Footnote, SectionLabel } from '../primitives';
import { GUTTER, MIN_TAP, STAFF, colors, radius, text, tint } from '../theme';

import { pct, useLoad } from './widgets';

const NAV: { group: StaffKey; items: { href: Href; label: StaffKey }[] }[] = [
  {
    group: 'shell.group.dining',
    items: [
      { href: '/staff', label: 'nav.overview' },
      { href: '/staff/menu', label: 'nav.menu' },
      { href: '/staff/meals', label: 'nav.meals' },
      { href: '/staff/ops', label: 'nav.ops' },
    ],
  },
  { group: 'shell.group.health', items: [{ href: '/staff/wellness', label: 'nav.wellness' }] },
  {
    group: 'shell.group.how',
    items: [
      { href: '/staff/rules', label: 'nav.rules' },
      { href: '/staff/data', label: 'nav.data' },
      { href: '/staff/scope', label: 'nav.scope' },
    ],
  },
];

/** "Synthetic data" on every view while any simulated student is in the week shown (plan R10; ADR 0001). */
function Banner() {
  const [overview] = useLoad(staffOverview);
  if (overview.status !== 'ready' || overview.data.suppressed) return null;
  const share = overview.data.synthetic_share ?? 0;
  if (share <= 0) return null;
  const n = String(overview.data.students);
  const msg = share >= 1 ? ts('banner.allSynthetic', { n, students: SYNTHETIC.students, days: SYNTHETIC.days, seed: SYNTHETIC.seed }) : ts('banner.someSynthetic', { share: pct(share), n });
  return (
    <View style={styles.banner} accessibilityRole="alert" testID="staff-banner">
      <Text style={[text.footnote, { color: colors.white }]}>{msg}</Text>
    </View>
  );
}

function NavLink({ href, label, active, compact }: { href: Href; label: StaffKey; active: boolean; compact?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      testID={label.replace('.', '-')}
      style={({ pressed }) => [styles.link, compact && styles.linkCompact, active && styles.linkActive, pressed && { opacity: 0.6 }]}>
      <Text style={[text.subhead, { color: active ? tint : colors.ink }, active && { fontWeight: text.headline.fontWeight }]}>{ts(label)}</Text>
    </Pressable>
  );
}

export function StaffShell({ email, children }: { email: string; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const narrow = width < STAFF.narrow;
  const isActive = (href: Href) => (href === '/staff' ? pathname === '/staff' : pathname.startsWith(String(href)));

  const account = (
    <View style={{ gap: 6 }}>
      <Footnote numberOfLines={1}>{ts('shell.signedIn', { email })}</Footnote>
      <Pressable onPress={() => void staffSignOut()} accessibilityRole="button" testID="staff-signout" style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.6 }]}>
        <Text style={[text.footnote, { color: tint, fontWeight: text.headline.fontWeight }]}>{ts('shell.signOut')}</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.root}>
      {narrow ? null : (
        <View style={styles.sidebar}>
          <Text style={text.headline}>{ts('shell.title')}</Text>
          <Footnote style={{ marginTop: 2, marginBottom: 18 }}>{schoolJson.name}</Footnote>
          {NAV.map((g) => (
            <View key={g.group} style={{ marginBottom: 16 }}>
              <SectionLabel style={{ marginBottom: 4, paddingHorizontal: 10 }}>{ts(g.group)}</SectionLabel>
              {g.items.map((it) => (
                <NavLink key={String(it.href)} href={it.href} label={it.label} active={isActive(it.href)} />
              ))}
            </View>
          ))}
          <View style={{ flex: 1 }} />
          {account}
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Banner />
        {narrow ? (
          <ScrollView horizontal style={styles.topNav} contentContainerStyle={{ gap: 4, paddingHorizontal: GUTTER, alignItems: 'center' }}>
            {NAV.flatMap((g) => g.items).map((it) => (
              <NavLink key={String(it.href)} href={it.href} label={it.label} active={isActive(it.href)} compact />
            ))}
          </ScrollView>
        ) : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            {children}
            {narrow ? <View style={{ marginTop: 24 }}>{account}</View> : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.paper },
  sidebar: { width: STAFF.sidebar, paddingHorizontal: 14, paddingVertical: 20, backgroundColor: colors.surface, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line },
  link: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.s },
  linkCompact: { minHeight: MIN_TAP },
  linkActive: { backgroundColor: colors.crimsonSoft },
  signOut: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' },
  banner: { backgroundColor: colors.ink, paddingHorizontal: GUTTER, paddingVertical: 8 },
  topNav: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: colors.surface },
  scroll: { paddingHorizontal: GUTTER, paddingVertical: 28, alignItems: 'center' },
  content: { width: '100%', maxWidth: STAFF.content },
});
