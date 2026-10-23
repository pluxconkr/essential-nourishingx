/**
 * /staff/meals · Meal photos & AI: how the photo router worked in the latest closed week (which model answered, how
 * hard the photos were, how often the estimate was low-confidence) and the AI ledger against the budget cap. No
 * student data: staff_ai_spend holds model, step, calls, cost and latency only.
 */
import { View } from 'react-native';

import { ts, type StaffKey } from '@/i18n/staff';
import { staffAiSpend, staffMeals } from '@/services/staff';
import { Callout, Subhead } from '@/ui/primitives';
import { BarRow, DataTable, Grid, Kpi, Panel, Section, StaffPage, modelName, pct, usd, useLoad } from '@/ui/staff/widgets';
import { colors } from '@/ui/theme';

function Shares({ counts, label }: { counts: Record<string, number>; label: (k: string) => string }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <Panel>
      {Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => (
          <BarRow key={k} label={label(k)} share={total ? n / total : 0} value={`${n} · ${pct(total ? n / total : 0)}`} />
        ))}
    </Panel>
  );
}

export default function StaffMeals() {
  const [meals] = useLoad(staffMeals);
  const [spend] = useLoad(staffAiSpend);
  const m = meals.status === 'ready' ? meals.data : null;
  const s = spend.status === 'ready' ? spend.data : null;

  return (
    <StaffPage title={ts('meals.title')} subtitle={ts('meals.subtitle')} testID="staff-meals">
      {meals.status === 'error' || spend.status === 'error' ? <Callout icon="info">{ts('common.unavailable')}</Callout> : null}
      <View style={{ marginBottom: 24 }}>
        <Grid>
          {m && !m.suppressed ? <Kpi label={ts('meals.photos')} value={String(m.analyses)} foot={ts('meals.photos.foot', { from: m.from, to: m.to })} /> : null}
          {m && !m.suppressed ? <Kpi label={ts('col.participants')} value={String(m.students)} foot={ts('meals.participants.foot')} /> : null}
          {m && !m.suppressed ? <Kpi label={ts('meals.lowConf')} value={pct(m.low_confidence_share)} foot={ts('meals.lowConf.foot')} /> : null}
          {s ? <Kpi label={ts('meals.spend.title')} value={ts('meals.spend.value', { spent: Number(s.spent_usd).toFixed(2), cap: Number(s.cap_usd).toFixed(0) })} foot={ts('meals.spend.foot')} testID="kpi-spend" /> : null}
        </Grid>
      </View>
      {m?.suppressed ? (
        <Section title={ts('meals.tiers.title')}>
          <Callout icon={m.pending ? 'info' : 'lock'}>{m.pending ? ts('common.pending', { from: m.from, to: m.to }) : ts('common.suppressed')}</Callout>
        </Section>
      ) : null}

      {m && !m.suppressed ? (
        <>
          <Section title={ts('meals.tiers.title')} foot={ts('meals.tiers.foot')}>
            {m.tiers ? <Shares counts={m.tiers} label={modelName} /> : <Callout icon="lock">{ts('common.suppressed.table')}</Callout>}
          </Section>
          <Section title={ts('meals.difficulty.title')}>
            {m.difficulty ? <Shares counts={m.difficulty} label={(k) => ts(`meals.difficulty.${k}` as StaffKey)} /> : <Callout icon="lock">{ts('common.suppressed.table')}</Callout>}
          </Section>
        </>
      ) : null}

      {s ? (
        <Section title={ts('meals.spend.title')} foot={ts('meals.spend.foot')}>
          <DataTable
            testID="spend-table"
            columns={[{ label: ts('col.model'), flex: 1.4 }, { label: ts('col.step'), flex: 1.2 }, { label: ts('col.calls'), numeric: true }, { label: ts('col.cost'), numeric: true }, { label: ts('col.time'), numeric: true }]}
            rows={s.by_model.map((r) => [modelName(r.model), ts(`step.${r.stage}` as StaffKey), r.calls, usd(r.cost_usd), r.avg_latency_ms == null ? null : `${(Number(r.avg_latency_ms) / 1000).toFixed(1)} s`])}
          />
        </Section>
      ) : null}

      <Section title={ts('meals.eval.title')}>
        <Panel>
          <Subhead style={{ color: colors.ink }}>{ts('meals.eval.body')}</Subhead>
        </Panel>
      </Section>
    </StaffPage>
  );
}
