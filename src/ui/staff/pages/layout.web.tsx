/**
 * Staff dashboard layout (web; on phones layout.tsx sends every /staff route home). Every /staff route except sign-in needs a staff session:
 * a non-anonymous account with app_metadata.role = 'staff'. The database enforces the same rule, so this gate is
 * for the person, not for security. Signed out, the page itself is replaced by the sign-in form (no redirect), so the
 * address is kept and the navigator never unmounts mid-navigation.
 */
import { Slot, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ts } from '@/i18n/staff';
import { staffSignOut, useStaffSession } from '@/services/staff';
import { Button, Callout, Footnote } from '@/ui/primitives';
import { SignInForm } from '@/ui/staff/SignInForm';
import { StaffShell } from '@/ui/staff/StaffShell';
import { GUTTER, colors } from '@/ui/theme';

function Centered({ children }: { children: ReactNode }) {
  return (
    <View style={styles.centered}>
      <View style={styles.box}>{children}</View>
    </View>
  );
}

export default function StaffLayout() {
  const session = useStaffSession();
  const pathname = usePathname();
  if (pathname === '/staff/sign-in') return <Slot />;
  switch (session.status) {
    case 'loading':
      return (
        <Centered>
          <Footnote>{ts('shell.loading')}</Footnote>
        </Centered>
      );
    case 'signedOut':
      return <SignInForm />;
    case 'notConfigured':
      return (
        <Centered>
          <Callout icon="info">{ts('shell.notConfigured')}</Callout>
        </Centered>
      );
    case 'notStaff':
      return (
        <Centered>
          <Callout icon="lock">{ts('shell.notStaff')}</Callout>
          <Button title={ts('shell.signOut')} variant="ghost" onPress={() => void staffSignOut()} />
        </Centered>
      );
    case 'staff':
      return (
        <StaffShell email={session.email}>
          <Slot />
        </StaffShell>
      );
  }
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER, backgroundColor: colors.paper },
  box: { width: '100%', maxWidth: 440, gap: 12 },
});
