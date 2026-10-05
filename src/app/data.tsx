/** Your data: see everything, export, delete all; the reminder; timing; demo scenarios. */
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { shortDate } from '@/domain/format';
import { formatClock } from '@/domain/time';
import type { DemoScenario } from '@/domain/types';
import { t, tn } from '@/i18n';
import { exportCheckins } from '@/services/export';
import { actions, useAppState } from '@/store/appStore';
import { Button, Card, Cell, SectionFooter, SectionHeader, Stepper, Toggle, showToast } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

const SCENARIOS: DemoScenario[] = ['live', 'stable', 'watch', 'attention', 'sparse'];

export default function DataScreen() {
  const router = useRouter();
  const prefs = useAppState((s) => s.prefs);
  const checkins = useAppState((s) => s.checkins);
  const timing = useAppState((s) => s.timing);
  const median = (() => {
    const a = [...timing].sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  })();
  const recent = [...checkins].reverse().slice(0, 30);

  const doExport = async () => {
    if (prefs.demo !== 'live') return showToast(t('data.exportDemo'));
    const ok = await exportCheckins(checkins);
    if (!ok) showToast(t('data.exportNone'));
  };

  const confirmDelete = () => {
    Alert.alert(t('data.delete.confirm.title'), t('data.delete.confirm.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('data.delete'),
        style: 'destructive',
        onPress: async () => {
          await actions.deleteEverything();
          router.replace('/consent');
        },
      },
    ]);
  };

  const toggleReminders = async (v: boolean) => {
    const ok = await actions.setNotificationsEnabled(v);
    if (v && !ok) showToast(t('data.reminder.denied'));
  };

  return (
    <Screen title={t('data.title')} largeTitle={t('data.title')} subtitle={t('data.mode.local')} fallback="/" testID="data">
      <SectionHeader>{t('data.stored.title')}</SectionHeader>
      <Card padded={false}>
        <Cell icon="lock" title={t('data.stored.title')} subtitle={t('data.stored.body')} />
        <Cell icon="close" title={t('data.never.title')} subtitle={t('data.never.body')} last />
      </Card>

      <SectionHeader>{t('data.reminder.title')}</SectionHeader>
      <Card padded={false}>
        <Toggle label={t('data.reminder.toggle')} value={prefs.notificationsEnabled} onChange={(v) => void toggleReminders(v)} />
        <Stepper label={t('data.reminder.time')} value={prefs.reminderHour * 60 + prefs.reminderMinute} display={formatClock(prefs.reminderHour, prefs.reminderMinute)} min={6 * 60} max={22 * 60} step={15} onChange={(v) => void actions.setReminderTime(Math.floor(v / 60), v % 60)} last />
      </Card>
      <SectionFooter>{prefs.notificationsEnabled ? t('data.reminder.next', { time: formatClock(prefs.reminderHour, prefs.reminderMinute) }) : t('data.reminder.off')}</SectionFooter>

      <SectionHeader>{t('data.timing.title')}</SectionHeader>
      <Card padded={false}>
        <Cell icon="checkin" title={median == null ? t('data.timing.none') : tn(timing.length, 'data.timing.body', { s: median })} last />
      </Card>

      <SectionHeader right={t('home.averages.coverage', { n: Math.min(7, checkins.length) })}>{t('data.records.title')}</SectionHeader>
      <Card padded={false}>
        {recent.length === 0 ? (
          <Cell title={t('data.records.empty')} last />
        ) : (
          recent.map((c, i) => (
            <Cell key={c.date} title={`${shortDate(c.date)}${c.isDemo ? ` · ${t('common.demo')}` : ''}`} subtitle={t('data.records.line', { f: c.fullness, e: c.energy, fo: c.focus, t: t(`training.word.${c.training}`), s: t(`skipped.word.${c.skipped}`) })} last={i === recent.length - 1} />
          ))
        )}
      </Card>
      <Button title={t('data.export')} variant="ghost" icon="download" onPress={() => void doExport()} style={{ marginBottom: 12 }} />

      <SectionHeader>{t('data.demo.title')}</SectionHeader>
      <Card padded={false}>
        {SCENARIOS.map((s, i) => (
          <Cell key={s} title={t(`demo.${s}`)} accessory={prefs.demo === s ? 'check' : 'none'} onPress={() => actions.loadDemo(s)} last={i === SCENARIOS.length - 1} testID={`demo-${s}`} />
        ))}
      </Card>
      <SectionFooter>{t('data.demo.footnote')}</SectionFooter>

      <Card padded={false}>
        <Cell icon="info" title={t('privacy.title')} accessory="chevron" onPress={() => router.push('/privacy')} last />
      </Card>
      <Button title={t('data.delete')} variant="danger" icon="trash" onPress={confirmDelete} testID="delete-everything" />
    </Screen>
  );
}
