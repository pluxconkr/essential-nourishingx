/** Health Center sheet: a person, not a feature. Nothing the student entered has been shared. */
import { Linking } from 'react-native';

import { t } from '@/i18n';
import { exportCheckins } from '@/services/export';
import { useAppState } from '@/store/appStore';
import { school, useDemoScenario } from '@/store/derived';
import { Button, Callout, Card, Cell, SectionHeader, Title, showToast } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function HealthScreen() {
  const checkins = useAppState((s) => s.checkins);
  const demo = useDemoScenario();
  const hc = school.healthCenter;

  const doExport = async () => {
    if (demo !== 'live') return showToast(t('data.exportDemo'));
    const ok = await exportCheckins(checkins);
    if (!ok) showToast(t('data.exportNone'));
  };

  return (
    <Screen title={t('health.title')} safety="text" fallback="/balance" testID="health">
      <Title style={{ marginTop: 8, marginBottom: 10 }}>{t('health.heading')}</Title>
      <Card padded={false}>
        <Cell icon="call" title={t('health.phone')} subtitle={`${hc.phoneDisplay} · ${hc.hours}`} value={t('health.call')} onPress={() => void Linking.openURL(`tel:${hc.phone}`)} accessibilityLabel={`${t('health.call')} ${t('health.phone')}`} />
        <Cell icon="time" title={t('health.walkin')} subtitle={hc.walkIn} />
        <Cell icon="sparkle" title={t('health.adviser')} subtitle={t('health.adviserBody')} />
        <Cell icon="training" title={t('health.coach')} subtitle={t('health.coachBody')} last />
      </Card>
      <SectionHeader>{t('data.title')}</SectionHeader>
      <Callout icon="lock">{t('health.note')}</Callout>
      <Button title={t('health.export')} variant="ghost" icon="download" onPress={() => void doExport()} />
    </Screen>
  );
}
