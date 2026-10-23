/** Your data: see everything, export, delete all; the reminder; timing; meal estimates; demo scenarios. */
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { roundKcal, shortDate } from '@/domain/format';
import { formatClock } from '@/domain/time';
import type { DemoScenario, MealRecord } from '@/domain/types';
import { t, tn } from '@/i18n';
import { exportCheckins } from '@/services/export';
import { actions, useAppState } from '@/store/appStore';
import { cloudEnabled, useBalance, useMeals } from '@/store/derived';
import { Button, Card, Cell, SectionFooter, SectionHeader, Stepper, Toggle, confirmDestructive, showToast } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

const SCENARIOS: DemoScenario[] = ['live', 'stable', 'watch', 'attention', 'sparse'];

export default function DataScreen() {
  const router = useRouter();
  const prefs = useAppState((s) => s.prefs);
  const checkins = useAppState((s) => s.checkins);
  const timing = useAppState((s) => s.timing);
  const meals = useMeals();
  const coverage = useBalance().derived.n;
  const median = (() => {
    const a = [...timing].sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  })();
  const recent = [...checkins].reverse().slice(0, 30);
  // Delete everything waits for the network; a second press must not start a second deletion.
  const [deleting, setDeleting] = useState(false);

  const doExport = async () => {
    if (prefs.demo !== 'live') return showToast(t('data.exportDemo'));
    const ok = await exportCheckins(checkins);
    if (!ok) showToast(t('data.exportNone'));
  };

  const confirmDelete = () =>
    confirmDestructive({
      title: t('data.delete.confirm.title'),
      body: t(cloudEnabled ? 'data.delete.confirm.bodyCloud' : 'data.delete.confirm.body'),
      cancel: t('common.cancel'),
      action: t('data.delete'),
      onConfirm: async () => {
        setDeleting(true);
        if ((await actions.deleteEverything()) === 'offline') {
          setDeleting(false);
          return showToast(t('data.delete.offline'));
        }
        router.replace('/consent');
      },
    });

  const confirmDeleteMeal = (m: MealRecord) =>
    confirmDestructive({
      title: t('data.meals.delete.title'),
      body: t('data.meals.delete.body'),
      cancel: t('common.cancel'),
      action: t('meal.result.delete'),
      onConfirm: async () => showToast(t((await actions.deleteMeal(m.id)) ? 'meal.deleted' : 'meal.deleteFailed')),
    });

  const toggleReminders = async (v: boolean) => {
    const ok = await actions.setNotificationsEnabled(v);
    if (v && !ok) showToast(t('data.reminder.denied'));
  };

  return (
    <Screen title={t('data.title')} largeTitle={t('data.title')} subtitle={t(cloudEnabled ? 'data.mode.cloud' : 'data.mode.local')} fallback="/" testID="data">
      <SectionHeader>{t('data.stored.title')}</SectionHeader>
      <Card padded={false}>
        <Cell icon="lock" title={t('data.stored.title')} subtitle={t('data.stored.body')} />
        {cloudEnabled ? <Cell icon="camera" title={t('data.meals.title')} subtitle={t('data.stored.meals')} /> : null}
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

      <SectionHeader right={t('home.averages.coverage', { n: coverage })}>{t('data.records.title')}</SectionHeader>
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

      {cloudEnabled ? (
        <>
          <SectionHeader>{t('data.meals.title')}</SectionHeader>
          <Card padded={false} testID="data-meals">
            {meals.length === 0 ? (
              <Cell title={t('data.meals.empty')} last />
            ) : (
              meals.map((m, i) => (
                <Cell key={m.id} title={`${shortDate(m.date)} · ${t(`meal.slot.${m.meal}`)}`} subtitle={t('data.meals.line', { kcal: roundKcal(m.kcal), p: Math.round(m.protein_g), c: Math.round(m.carbs_g) })} onPress={() => confirmDeleteMeal(m)} accessory="chevron" last={i === meals.length - 1} />
              ))
            )}
          </Card>
          <SectionFooter>{t('data.meals.footnote')}</SectionFooter>
        </>
      ) : null}

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
      <Button title={t('data.delete')} variant="danger" icon="trash" onPress={confirmDelete} disabled={deleting} testID="delete-everything" />
    </Screen>
  );
}
