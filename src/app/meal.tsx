/**
 * Meal photo (ADR 0001). Optional: pick the meal, take or choose a photo, read the estimate.
 * The photo is resized here to at most 1280 px on the long edge — the size of the Commons photos the router was
 * tuned on (scripts/eval/cases.json) — sent once to analyze-meal and dropped; only the returned estimate is kept.
 * Long work shows named steps and the live timer, never a spinner.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { roundKcal } from '@/domain/format';
import type { Meal, MealRecord } from '@/domain/types';
import { t } from '@/i18n';
import type { AnalyzeResult } from '@/services/cloud';
import { mealFor } from '@/services/menu';
import { deletePhotoFiles } from '@/services/photo-files';
import { actions } from '@/store/appStore';
import { cloudEnabled, useToday } from '@/store/derived';
import { ChoiceRow, TimerPill } from '@/ui/checkin-widgets';
import { Button, Callout, Card, Cell, Footnote, SectionFooter, SectionHeader, Subhead, Title, confirmDestructive, showToast, successHaptic } from '@/ui/primitives';
import { Screen, goBackOr } from '@/ui/Screen';
import { colors, tint } from '@/ui/theme';

const MAX_SIDE = 1280;
const MEALS: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const STEPS = ['meal.step.resize', 'meal.step.analyse'] as const;

type Phase =
  | { kind: 'pick' }
  | { kind: 'working'; step: 0 | 1; startedAt: number }
  | { kind: 'done'; record: MealRecord }
  | { kind: 'notFood' }
  | { kind: 'error'; reason: Extract<AnalyzeResult, { status: 'error' }>['reason'] };

/** Base64 JPEG no larger than MAX_SIDE on the long edge. The picker's own width/height can be 0, so measure first.
 * The picker's copy and the resized file are deleted here; only the base64 string goes on. */
async function shrink(uri: string): Promise<string | null> {
  try {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const long = Math.max(original.width, original.height);
    const image = long > MAX_SIDE ? await ImageManipulator.manipulate(original).resize(original.width >= original.height ? { width: MAX_SIDE } : { height: MAX_SIDE }).renderAsync() : original;
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
    deletePhotoFiles([saved.uri]);
    return saved.base64 ?? null;
  } finally {
    deletePhotoFiles([uri]);
  }
}

export default function MealScreen() {
  const router = useRouter();
  const today = useToday();
  const [meal, setMeal] = useState<Meal>(() => mealFor(new Date().getHours()));
  const [phase, setPhase] = useState<Phase>(cloudEnabled ? { kind: 'pick' } : { kind: 'error', reason: 'not_configured' });

  const run = async (source: 'camera' | 'library') => {
    if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return showToast(t('meal.error.camera'));
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;
    const startedAt = Date.now();
    setPhase({ kind: 'working', step: 0, startedAt });
    const image = await shrink(picked.assets[0].uri).catch(() => null);
    if (!image) return setPhase({ kind: 'error', reason: 'unclear' });
    setPhase({ kind: 'working', step: 1, startedAt });
    const result = await actions.analyzeMeal(image, meal, today);
    if (result.status === 'ok') {
      void successHaptic();
      setPhase({ kind: 'done', record: result.record });
    } else setPhase(result.status === 'not_food' ? { kind: 'notFood' } : { kind: 'error', reason: result.reason });
  };

  const confirmDelete = (id: string) =>
    confirmDestructive({
      title: t('data.meals.delete.title'),
      body: t('data.meals.delete.body'),
      cancel: t('common.cancel'),
      action: t('meal.result.delete'),
      onConfirm: async () => {
        if (!(await actions.deleteMeal(id))) return showToast(t('meal.deleteFailed'));
        showToast(t('meal.deleted'));
        setPhase({ kind: 'pick' });
      },
    });

  const working = phase.kind === 'working';
  return (
    <Screen title={t('meal.title')} largeTitle={t('meal.title')} subtitle={t('meal.subtitle')} headerRight={working ? <TimerPill startedAt={phase.startedAt} running /> : undefined} fallback="/" testID="meal">
      {phase.kind === 'pick' ? (
        <>
          <Card>
            <Title style={{ marginBottom: 12 }}>{t('meal.which')}</Title>
            <ChoiceRow options={MEALS.map((m) => ({ value: m, label: t(`meal.slot.${m}`) }))} value={meal} onChange={setMeal} label={t('meal.which')} />
          </Card>
          <View style={{ gap: 10, marginBottom: 12 }}>
            <Button title={t('meal.take')} icon="camera" onPress={() => void run('camera')} testID="meal-camera" />
            <Button title={t('meal.pick')} icon="image" variant="ghost" onPress={() => void run('library')} testID="meal-library" />
          </View>
          <SectionFooter>{t('meal.tip')}</SectionFooter>
          <Callout icon="lock">{t('meal.how')}</Callout>
        </>
      ) : null}

      {working ? (
        <>
          <Card padded={false}>
            {STEPS.map((k, i) => (
              <Cell key={k} icon={i < phase.step ? 'checkCircle' : 'time'} iconColor={i < phase.step ? colors.green : i === phase.step ? tint : colors.ink3} title={t(k)} last={i === STEPS.length - 1} />
            ))}
          </Card>
          <SectionFooter>{t('meal.step.note')}</SectionFooter>
        </>
      ) : null}

      {phase.kind === 'done' ? <MealResult record={phase.record} onDone={() => goBackOr(router)} onAnother={() => setPhase({ kind: 'pick' })} onDelete={() => confirmDelete(phase.record.id)} /> : null}

      {phase.kind === 'notFood' || phase.kind === 'error' ? (
        <>
          <Callout icon="info">{phase.kind === 'notFood' ? t('meal.notFood') : t(`meal.error.${phase.reason}`)}</Callout>
          {phase.kind === 'error' && (phase.reason === 'not_configured' || phase.reason === 'budget' || phase.reason === 'daily_limit') ? (
            <Button title={t('meal.result.done')} variant="ghost" onPress={() => goBackOr(router)} />
          ) : (
            <Button title={t('meal.retry')} variant="ghost" onPress={() => setPhase({ kind: 'pick' })} />
          )}
        </>
      ) : null}
    </Screen>
  );
}

function MealResult({ record: r, onDone, onAnother, onDelete }: { record: MealRecord; onDone: () => void; onAnother: () => void; onDelete: () => void }) {
  return (
    <>
      <SectionHeader>{t('meal.result.title', { meal: t(`meal.slot.${r.meal}`) })}</SectionHeader>
      <Card padded={false} testID="meal-items">
        {r.items.map((it, i) => (
          <Cell key={`${it.name}-${i}`} title={it.name} subtitle={t('meal.result.item', { portion: it.portion, kcal: roundKcal(it.kcal) })} last={i === r.items.length - 1} />
        ))}
      </Card>
      <Card testID="meal-totals">
        <Title>{t('meal.result.energy', { low: roundKcal(r.kcalLow), high: roundKcal(r.kcalHigh) })}</Title>
        <Subhead style={{ marginTop: 4 }}>{t('meal.result.macros', { p: Math.round(r.protein_g), c: Math.round(r.carbs_g), f: Math.round(r.fat_g), fi: Math.round(r.fiber_g) })}</Subhead>
        {r.uncertain.length > 0 ? <Footnote style={{ marginTop: 8 }}>{t('meal.result.unsure', { list: r.uncertain.join(', ') })}</Footnote> : null}
      </Card>
      <SectionFooter>{t('meal.result.footnote', { model: t(`meal.model.${r.tier}`) })}</SectionFooter>
      <View style={{ gap: 10 }}>
        <Button title={t('meal.result.done')} onPress={onDone} testID="meal-done" />
        <Button title={t('meal.result.another')} variant="ghost" onPress={onAnother} />
        <Button title={t('meal.result.delete')} variant="danger" icon="trash" onPress={onDelete} />
      </View>
    </>
  );
}
