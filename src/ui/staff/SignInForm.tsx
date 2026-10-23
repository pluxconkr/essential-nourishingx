/**
 * Staff sign-in form: email and password for accounts the school's IT creates (ADR 0001); there is no sign-up.
 * The staff layout shows it in place of any /staff page while signed out, so a deep link lands where it pointed once
 * the session arrives — no redirect, no navigation loop.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ts } from '@/i18n/staff';
import { staffSignIn, staffSignOut } from '@/services/staff';

import { Button, Callout, Footnote, SectionLabel, Subhead } from '../primitives';
import { GUTTER, MIN_TAP, colors, radius, text } from '../theme';

export function SignInForm({ notStaff = false }: { notStaff?: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'wrong' | 'offline' | null>(null);

  const submit = async () => {
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    const result = await staffSignIn(email, password);
    setBusy(false);
    if (result !== 'ok') setError(result);
  };

  return (
    <View style={styles.root} testID="staff-sign-in">
      <View style={styles.card}>
        <Text accessibilityRole="header" style={text.largeTitle}>
          {ts('signin.title')}
        </Text>
        <Subhead style={{ marginTop: 4, marginBottom: 20 }}>{ts('signin.subtitle')}</Subhead>
        <SectionLabel style={styles.label}>{ts('signin.email')}</SectionLabel>
        <TextInput value={email} onChangeText={setEmail} autoComplete="email" inputMode="email" autoCapitalize="none" accessibilityLabel={ts('signin.email')} style={[text.body, styles.input]} testID="staff-email" />
        <SectionLabel style={styles.label}>{ts('signin.password')}</SectionLabel>
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={() => void submit()} accessibilityLabel={ts('signin.password')} style={[text.body, styles.input]} testID="staff-password" />
        {error ? (
          <View style={{ marginTop: 12 }}>
            <Callout icon="info" tone="crimson">
              {ts(error === 'wrong' ? 'signin.wrong' : 'signin.offline')}
            </Callout>
          </View>
        ) : null}
        {notStaff ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Callout icon="lock">{ts('shell.notStaff')}</Callout>
            <Button title={ts('shell.signOut')} variant="ghost" onPress={() => void staffSignOut()} />
          </View>
        ) : null}
        <Button title={ts(busy ? 'signin.working' : 'signin.submit')} onPress={() => void submit()} disabled={busy || !email || !password} style={{ marginTop: 16 }} testID="staff-submit" />
        <Footnote style={{ marginTop: 16 }}>{ts('signin.note')}</Footnote>
        <Footnote style={{ marginTop: 8 }}>{ts('signin.demo')}</Footnote>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER, backgroundColor: colors.paper },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 24 },
  label: { marginTop: 12, marginBottom: 6 },
  input: { minHeight: MIN_TAP, borderWidth: 1, borderColor: colors.line, borderRadius: radius.s, paddingHorizontal: 12, backgroundColor: colors.surface },
});
