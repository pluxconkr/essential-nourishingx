/**
 * /staff/rules · Rule engine: the evaluateRules the phone runs (its one definition is src/domain/rules.ts, imported
 * here — the parity argument), a tester over its inputs, the demo weeks, the rules in order with the firing one
 * highlighted, and where each threshold comes from (docs/thresholds.md). Every threshold in the rule listing and the
 * Value column is read from TH.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { scenarioCheckins } from '@/domain/demo';
import { HYSTERESIS_DAYS } from '@/domain/hysteresis';
import { TH, derive, evaluateRules, windowFor } from '@/domain/rules';
import { dateKey } from '@/domain/time';
import type { DemoScenario, Derived } from '@/domain/types';
import { t } from '@/i18n';
import { ts, type StaffKey } from '@/i18n/staff';
import { StateWordView } from '@/ui/balance-widgets';
import { Button, Footnote, Stepper, Subhead } from '@/ui/primitives';
import { DataTable, Panel, RuleListing, Section, StaffPage, clauseText, fullnessDrop, lowProteinShare } from '@/ui/staff/widgets';
import { colors } from '@/ui/theme';

type Input = 'n' | 'skipped' | 'heavyDays' | 'lowEnergyDays' | 'lowFocusDays' | 'fullDelta' | 'energyMean' | 'mealsLogged' | 'lowProteinMeals' | 'heavyDaysLowCarb';

const INPUTS: { key: Input; min: number; max: number; step: number; digits: number }[] = [
  { key: 'n', min: 0, max: 7, step: 1, digits: 0 },
  { key: 'skipped', min: 0, max: 7, step: 1, digits: 0 },
  { key: 'heavyDays', min: 0, max: 7, step: 1, digits: 0 },
  { key: 'lowEnergyDays', min: 0, max: 7, step: 1, digits: 0 },
  { key: 'lowFocusDays', min: 0, max: 7, step: 1, digits: 0 },
  { key: 'fullDelta', min: -4, max: 4, step: 0.25, digits: 2 },
  { key: 'energyMean', min: 1, max: 5, step: 0.1, digits: 1 },
  { key: 'mealsLogged', min: 0, max: 21, step: 1, digits: 0 },
  { key: 'lowProteinMeals', min: 0, max: 21, step: 1, digits: 0 },
  { key: 'heavyDaysLowCarb', min: 0, max: 7, step: 1, digits: 0 },
];

const WEEKS: readonly Exclude<DemoScenario, 'live'>[] = ['stable', 'watch', 'attention', 'sparse'];

/** The Derived inputs of a demo week, computed exactly as the phone computes them. */
const weekInputs = (s: Exclude<DemoScenario, 'live'>): Derived => {
  const today = dateKey();
  return derive(windowFor(scenarioCheckins(s, today), today));
};

const PROVENANCE: { label: StaffKey; value: string; basis: StaffKey; status: StaffKey }[] = [
  { label: 'prov.minCheckins', value: ts('provv.minCheckins', { n: TH.minCheckins }), basis: 'prov.minCheckins.basis', status: 'status.defensible' },
  { label: 'prov.b1', value: ts('provv.b1', { s: TH.b1_skipped, h: TH.b1_heavy }), basis: 'prov.b1.basis', status: 'status.clinician' },
  { label: 'prov.heavy', value: ts('provv.heavy', { a: TH.b1_heavy, b: TH.c1_heavy }), basis: 'prov.heavy.basis', status: 'status.coach' },
  { label: 'prov.fullness', value: ts('provv.fullness', { a: fullnessDrop(TH.b2_fullDelta), b: fullnessDrop(TH.b3_fullDelta) }), basis: 'prov.fullness.basis', status: 'status.defensible' },
  { label: 'prov.energy', value: ts('provv.energy', { a: TH.b2_lowEnergy, b: TH.c2_lowEnergy }), basis: 'prov.energy.basis', status: 'status.defensible' },
  { label: 'prov.focus', value: ts('provv.focus', { a: TH.c4_lowFocus }), basis: 'prov.focus.basis', status: 'status.defensible' },
  { label: 'prov.energyMean', value: ts('provv.energyMean', { m: TH.b3_energyMean }), basis: 'prov.energyMean.basis', status: 'status.clinician' },
  { label: 'prov.hysteresis', value: ts('provv.hysteresis', { n: HYSTERESIS_DAYS }), basis: 'prov.hysteresis.basis', status: 'status.defensible' },
  { label: 'prov.c5', value: ts('provv.c5', { p: TH.meal_lowProtein_g, share: lowProteinShare(), m: TH.c5_minMeals }), basis: 'prov.c5.basis', status: 'status.defensible' },
  { label: 'prov.c6', value: ts('provv.c6', { c: TH.c6_lowCarb_g, k: TH.c6_heavyDaysLowCarb }), basis: 'prov.c6.basis', status: 'status.defensible' },
];

export default function StaffRules() {
  const [inputs, setInputs] = useState<Derived>(() => weekInputs('watch'));
  const result = useMemo(() => evaluateRules(inputs), [inputs]);
  const set = (k: Input, v: number) => setInputs((d) => ({ ...d, [k]: Math.round(v * 100) / 100 }));

  return (
    <StaffPage title={ts('rules.title')} subtitle={ts('rules.subtitle')} testID="staff-rules">
      <Section title={ts('rules.tester.title')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <Footnote>{ts('rules.load')}</Footnote>
          {WEEKS.map((w) => (
            <Button key={w} title={t(`demo.${w}`)} variant="ghost" onPress={() => setInputs(weekInputs(w))} testID={`load-${w}`} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <Panel style={{ flexGrow: 1, flexBasis: 380, padding: 0 }}>
            {INPUTS.map((i, k) => (
              <Stepper key={i.key} label={ts(`input.${i.key}`)} value={inputs[i.key]} display={inputs[i.key].toFixed(i.digits)} min={i.min} max={i.max} step={i.step} onChange={(v) => set(i.key, v)} last={k === INPUTS.length - 1} />
            ))}
          </Panel>
          <Panel style={{ flexGrow: 1, flexBasis: 300 }} testID="rules-result">
            <Footnote>{ts('rules.result')}</Footnote>
            <View style={{ marginTop: 6 }}>
              <StateWordView state={result.state} testID="rules-word" />
            </View>
            <Subhead style={{ marginTop: 8, color: colors.ink }} testID="rules-clause">{`${result.clause} · ${clauseText(result.clause)}`}</Subhead>
            <Footnote style={{ marginTop: 10 }}>{ts('rules.same')}</Footnote>
            <Footnote style={{ marginTop: 6 }}>{ts('rules.raw')}</Footnote>
          </Panel>
        </View>
      </Section>

      <Section title={ts('rules.listing.title')}>
        <RuleListing firing={result.clause} state={result.state} testID="rules-listing" />
      </Section>

      <Section title={ts('rules.provenance.title')} foot={ts('rules.provenance.foot')}>
        <DataTable
          columns={[{ label: ts('col.threshold'), flex: 1.3 }, { label: ts('col.value'), flex: 1.1 }, { label: ts('col.basis'), flex: 2.6 }, { label: ts('col.status'), flex: 1 }]}
          rows={PROVENANCE.map((p) => [ts(p.label), p.value, ts(p.basis), ts(p.status)])}
        />
      </Section>
    </StaffPage>
  );
}
