/**
 * Screen 2 · Quick Check-In. Five taps, about twenty seconds, one anonymous record.
 * The live timer is the product argument made visible. A second save the same day overwrites the first.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { shortDate } from '@/domain/format';
import { RATINGS, SKIPPEDS, TRAININGS, type Checkin, type Rating, type Skipped, type Training } from '@/domain/types';
import { t } from '@/i18n';
import { actions, type CheckinInput } from '@/store/appStore';
import { useDemoScenario, useToday, useTodayCheckin } from '@/store/derived';
import { ChoiceRow, ProgressDots, ScaleRow, TimerPill, secondsSince } from '@/ui/checkin-widgets';
import { Button, Card, Footnote, SectionFooter, Title, showToast, successHaptic } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

type Draft = { fullness: Rating | null; energy: Rating | null; focus: Rating | null; training: Training | null; skipped: Skipped | null };

const empty: Draft = { fullness: null, energy: null, focus: null, training: null, skipped: null };
const fromRecord = (c: Checkin | null): Draft => (c ? { fullness: c.fullness, energy: c.energy, focus: c.focus, training: c.training, skipped: c.skipped } : empty);

export default function CheckinScreen() {
  const router = useRouter();
  const today = useToday();
  const todayCheckin = useTodayCheckin();
  const demo = useDemoScenario();
  const [draft, setDraft] = useState<Draft>(() => fromRecord(todayCheckin));
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [running, setRunning] = useState(true);

  // Timer starts when the screen comes into view; answers pre-fill from today's record.
  useFocusEffect(
    useCallback(() => {
      setStartedAt(Date.now());
      setDraft(fromRecord(todayCheckin));
      setRunning(true);
      return () => setRunning(false);
    }, [todayCheckin]),
  );

  const answered = (['fullness', 'energy', 'focus', 'training', 'skipped'] as const).filter((k) => draft[k] !== null).length;
  const complete = answered === 5;

  const save = () => {
    if (!complete) return;
    const s = secondsSince(startedAt);
    actions.saveCheckin(draft as CheckinInput, s, today);
    setRunning(false);
    void successHaptic();
    showToast(t(demo === 'live' ? 'checkin.saved' : 'checkin.savedDemo', { s }));
    router.navigate('/balance');
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Screen largeTitle={t('checkin.title')} subtitle={t('checkin.subtitle', { date: shortDate(today) })} headerRight={<TimerPill startedAt={startedAt} running={running} />} testID="checkin">
      <Card>
        <Title>{t('checkin.q.fullness')}</Title>
        <View style={{ marginTop: 10 }}>
          <ScaleRow options={RATINGS} value={draft.fullness} onChange={(v) => set('fullness', v)} label={t('checkin.q.fullness')} />
        </View>
        <Footnote style={{ marginTop: 8 }}>{t('checkin.hint.fullness')}</Footnote>
      </Card>
      <Card>
        <Title>{t('checkin.q.energy')}</Title>
        <View style={{ marginTop: 10 }}>
          <ScaleRow options={RATINGS} value={draft.energy} onChange={(v) => set('energy', v)} label={t('checkin.q.energy')} />
        </View>
        <Footnote style={{ marginTop: 8 }}>{t('checkin.hint.energy')}</Footnote>
      </Card>
      <Card>
        <Title>{t('checkin.q.focus')}</Title>
        <View style={{ marginTop: 10 }}>
          <ScaleRow options={RATINGS} value={draft.focus} onChange={(v) => set('focus', v)} label={t('checkin.q.focus')} />
        </View>
        <Footnote style={{ marginTop: 8 }}>{t('checkin.hint.focus')}</Footnote>
      </Card>
      <Card>
        <Title>{t('checkin.q.training')}</Title>
        <View style={{ marginTop: 10 }}>
          <ChoiceRow options={TRAININGS.map((v) => ({ value: v, label: t(`training.${v}`) }))} value={draft.training} onChange={(v) => set('training', v)} label={t('checkin.q.training')} />
        </View>
      </Card>
      <Card>
        <Title>{t('checkin.q.skipped')}</Title>
        <View style={{ marginTop: 10 }}>
          <ChoiceRow options={SKIPPEDS.map((v) => ({ value: v, label: t(`skipped.${v}`) }))} value={draft.skipped} onChange={(v) => set('skipped', v)} label={t('checkin.q.skipped')} />
        </View>
        <Footnote style={{ marginTop: 8 }}>{t('checkin.hint.skipped')}</Footnote>
      </Card>

      <ProgressDots done={answered} />
      <Button title={complete ? t('checkin.save') : t('checkin.saveLeft', { n: 5 - answered })} onPress={save} disabled={!complete} testID="checkin-save" style={{ marginTop: 8 }} />
      <SectionFooter style={{ textAlign: 'center', marginTop: 10 }}>{t('checkin.footnote')}</SectionFooter>
    </Screen>
  );
}
