/**
 * /staff/ops · Menu table & reminder: Dining Services keeps the menu by hand (plan E6: about four minutes a day).
 * Days are public.menu_days rows — the weekday and weekend templates or a dated override — that phones cache on their
 * next sync (src/services/menu.ts). Editing a day without a row starts from the table bundled with the app.
 * The reminder card states the policy; the school cannot send a reminder.
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import menuJson from '@/assets/data/menu.json';
import { longDate } from '@/domain/format';
import { weekday } from '@/domain/time';
import type { MenuDay } from '@/domain/types';
import { t } from '@/i18n';
import { ts } from '@/i18n/staff';
import { deleteMenuDay, menuRows, saveMenuDay } from '@/services/staff';
import { Button, Callout, Cell, Footnote, Subhead } from '@/ui/primitives';
import { Bullets, Panel, Section, StaffPage, useLoad } from '@/ui/staff/widgets';
import { MIN_TAP, colors, radius, text } from '@/ui/theme';

const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
const bundled = (menuJson as unknown as { days: Record<string, MenuDay> }).days;
const isDate = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(Date.parse(k));
const templateFor = (key: string) => (key === 'weekday' || key === 'weekend' ? key : weekday(key) === 0 || weekday(key) === 6 ? 'weekend' : 'weekday');
const dayLabel = (key: string) => (key === 'weekday' ? ts('ops.day.weekday') : key === 'weekend' ? ts('ops.day.weekend') : longDate(key));
const count = (d: MenuDay) => d.breakfast.length + d.lunch.length + d.dinner.length;

/** Tags are edited as text so typing a comma does not move the cursor; they become a list on save. */
type EditItem = { item: string; station: string; tags: string };
type Draft = Record<(typeof MEALS)[number], EditItem[]>;
const toDraft = (d: MenuDay): Draft => Object.fromEntries(MEALS.map((m) => [m, d[m].map((it) => ({ item: it.item, station: it.station, tags: it.tags.join(', ') }))])) as Draft;
const fromDraft = (d: Draft): MenuDay =>
  Object.fromEntries(
    MEALS.map((m) => [
      m,
      d[m]
        .map((it) => ({ item: it.item.trim(), station: it.station.trim(), tags: it.tags.split(',').map((s) => s.trim()).filter(Boolean) }))
        .filter((it) => it.item.length > 0),
    ]),
  ) as unknown as MenuDay;

export default function StaffOps() {
  const [rows, reload] = useLoad(menuRows);
  const entered = rows.status === 'ready' ? Object.fromEntries(rows.data.map((r) => [r.key, r.meals])) : {};
  const [key, setKey] = useState('weekday');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newDate, setNewDate] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const keys = ['weekday', 'weekend', ...Object.keys(entered).filter(isDate).sort()];
  if (isDate(key) && !keys.includes(key)) keys.push(key);

  // A day's draft starts from its saved row, else from the bundled table for its template, and starts over whenever
  // another day is picked or the rows reload after a save.
  const savedDay: MenuDay | undefined = entered[key];
  const [draftFor, setDraftFor] = useState<{ key: string; rows: typeof rows } | null>(null);
  if (rows.status === 'ready' && (draftFor?.key !== key || draftFor.rows !== rows)) {
    setDraftFor({ key, rows });
    setDraft(toDraft(savedDay ?? bundled[templateFor(key)]));
  }

  const edit = (meal: (typeof MEALS)[number], i: number, field: keyof EditItem, value: string) =>
    setDraft((d) => (d ? { ...d, [meal]: d[meal].map((it, k) => (k === i ? { ...it, [field]: value } : it)) } : d));
  const add = (meal: (typeof MEALS)[number]) => setDraft((d) => (d ? { ...d, [meal]: [...d[meal], { item: '', station: '', tags: '' }] } : d));
  const remove = (meal: (typeof MEALS)[number], i: number) => setDraft((d) => (d ? { ...d, [meal]: d[meal].filter((_, k) => k !== i) } : d));

  const save = async () => {
    if (!draft) return;
    setMessage((await saveMenuDay(key, fromDraft(draft))) ? ts('ops.saved') : ts('ops.saveFailed'));
    await reload();
  };
  const del = async () => {
    setMessage((await deleteMenuDay(key)) ? ts('ops.deleted') : ts('ops.saveFailed'));
    await reload();
  };
  const addDate = () => {
    if (!isDate(newDate.trim())) return setMessage(ts('ops.day.invalid'));
    setMessage(null);
    setKey(newDate.trim());
    setNewDate('');
  };

  return (
    <StaffPage title={ts('ops.title')} subtitle={ts('ops.subtitle')} testID="staff-ops">
      {rows.status === 'error' ? <Callout icon="info">{ts('common.unavailable')}</Callout> : null}
      <View style={styles.columns}>
        <View style={{ flexBasis: 260, flexGrow: 1, maxWidth: 340 }}>
          <Section title={ts('ops.days.title')} foot={ts('ops.fallback')}>
            <Panel style={{ padding: 0 }}>
              {keys.map((k, i) => (
                <Cell key={k} title={dayLabel(k)} subtitle={entered[k] ? ts('ops.items', { n: count(entered[k]) }) : ts('ops.notEntered')} accessory={k === key ? 'check' : 'none'} onPress={() => { setMessage(null); setKey(k); }} testID={`menu-day-${k}`} last={i === keys.length - 1} />
              ))}
            </Panel>
            <View style={styles.addRow}>
              <TextInput value={newDate} onChangeText={setNewDate} placeholder={ts('ops.day.date')} placeholderTextColor={colors.ink3} onSubmitEditing={addDate} accessibilityLabel={ts('ops.day.date')} style={[text.subhead, styles.input, { flex: 1 }]} testID="menu-new-date" />
              <Button title={ts('ops.day.add')} variant="ghost" onPress={addDate} testID="menu-add-date" />
            </View>
          </Section>
        </View>

        <View style={{ flexBasis: 520, flexGrow: 3 }}>
          <Section title={ts('ops.editor.title', { day: dayLabel(key) })}>
            {draft ? (
              <Panel testID="menu-editor">
                {MEALS.map((meal) => (
                  <View key={meal} style={{ marginBottom: 16 }}>
                    <Subhead style={{ color: colors.ink, marginBottom: 6 }}>{t(`time.meal.${meal}`)}</Subhead>
                    {draft[meal].map((it, i) => (
                      <View key={i} style={styles.itemRow}>
                        <TextInput value={it.item} onChangeText={(v) => edit(meal, i, 'item', v)} placeholder={ts('ops.item')} placeholderTextColor={colors.ink3} accessibilityLabel={`${t(`time.meal.${meal}`)} ${ts('ops.item')} ${i + 1}`} style={[text.subhead, styles.input, { flex: 3 }]} testID={`menu-${meal}-item-${i}`} />
                        <TextInput value={it.station} onChangeText={(v) => edit(meal, i, 'station', v)} placeholder={ts('ops.station')} placeholderTextColor={colors.ink3} accessibilityLabel={`${t(`time.meal.${meal}`)} ${ts('ops.station')} ${i + 1}`} style={[text.subhead, styles.input, { flex: 1.2 }]} />
                        <TextInput value={it.tags} onChangeText={(v) => edit(meal, i, 'tags', v)} placeholder={ts('ops.tags')} placeholderTextColor={colors.ink3} accessibilityLabel={`${t(`time.meal.${meal}`)} ${ts('ops.tags')} ${i + 1}`} style={[text.subhead, styles.input, { flex: 1.2 }]} />
                        <Button title={ts('ops.remove')} variant="ghost" onPress={() => remove(meal, i)} />
                      </View>
                    ))}
                    <Button title={ts('ops.addItem')} variant="ghost" onPress={() => add(meal)} style={{ alignSelf: 'flex-start' }} testID={`menu-${meal}-add`} />
                  </View>
                ))}
                <View style={styles.actions}>
                  <Button title={ts('ops.save')} onPress={() => void save()} testID="menu-save" />
                  {savedDay ? <Button title={ts('ops.delete')} variant="danger" icon="trash" onPress={() => void del()} testID="menu-delete" /> : null}
                </View>
                {message ? (
                  <Footnote style={{ marginTop: 10 }} testID="menu-message">
                    {message}
                  </Footnote>
                ) : null}
              </Panel>
            ) : null}
          </Section>
        </View>
      </View>

      <Section title={ts('ops.reminder.title')}>
        <Panel>
          <Bullets keys={['ops.reminder.1', 'ops.reminder.2', 'ops.reminder.3', 'ops.reminder.4']} />
        </Panel>
      </Section>
    </StaffPage>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  itemRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 },
  input: { minHeight: MIN_TAP, borderWidth: 1, borderColor: colors.line, borderRadius: radius.s, paddingHorizontal: 10, backgroundColor: colors.surface, color: colors.ink },
  actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
