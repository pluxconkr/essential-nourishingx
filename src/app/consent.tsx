/** Consent before anything is stored: six plain sentences, the reminder time, I understand / Not now. */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { formatClock } from '@/domain/time';
import { t } from '@/i18n';
import { actions, useAppState } from '@/store/appStore';
import { Button, Card, Cell, SectionFooter, SectionHeader, Stepper, Title, Toggle } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';
import { colors } from '@/ui/theme';

const SENTENCES = ['consent.s1', 'consent.s2', 'consent.s3', 'consent.s4', 'consent.s5', 'consent.s6'] as const;

export default function ConsentScreen() {
  const router = useRouter();
  const prefs = useAppState((s) => s.prefs);
  const [hour, setHour] = useState(prefs.reminderHour);
  const [minute, setMinute] = useState(prefs.reminderMinute);
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    await actions.consent(hour, minute, reminders);
    router.replace('/');
  };

  return (
    <Screen largeTitle={t('consent.title')} testID="consent">
      <Title style={{ marginBottom: 10 }}>{t('consent.heading')}</Title>
      <Card padded={false}>
        {SENTENCES.map((k, i) => (
          <Cell key={k} icon="checkCircle" iconColor={colors.green} title={t(k)} last={i === SENTENCES.length - 1} />
        ))}
      </Card>

      <SectionHeader>{t('consent.reminder.title')}</SectionHeader>
      <Card padded={false}>
        <Toggle label={t('data.reminder.toggle')} value={reminders} onChange={setReminders} />
        <Stepper label={t('consent.reminder.time')} value={hour * 60 + minute} display={formatClock(hour, minute)} min={6 * 60} max={22 * 60} step={15} onChange={(v) => { setHour(Math.floor(v / 60)); setMinute(v % 60); }} last />
      </Card>
      <SectionFooter>{t('consent.reminder.footnote')}</SectionFooter>

      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title={t('consent.accept')} onPress={() => void accept()} disabled={busy} testID="consent-accept" />
        <Button title={t('consent.notNow')} variant="ghost" onPress={() => router.push('/not-now')} />
      </View>
      <SectionFooter style={{ textAlign: 'center', marginTop: 14 }}>{t('consent.reviewed')}</SectionFooter>
    </Screen>
  );
}
