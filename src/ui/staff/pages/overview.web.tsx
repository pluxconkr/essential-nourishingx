/**
 * /staff · Weekly overview: this week's KPIs (n ≥ 10 aggregates), the weekly report in prose (model or template,
 * labelled), 30 days of daily means, energy by day of week, and how to read it all honestly.
 */
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { weekday } from '@/domain/time';
import { tlist } from '@/i18n';
import { ts } from '@/i18n/staff';
import { generateReport, latestReports, staffDaily, staffOverview, type DailyRow, type WeeklyReport } from '@/services/staff';
import { Button, Callout, Footnote, Subhead } from '@/ui/primitives';
import { BarRow, Bullets, DailyChart, Grid, Kpi, Panel, Section, StaffPage, num, pct, useLoad } from '@/ui/staff/widgets';
import { colors } from '@/ui/theme';

const loadOverview = () => staffOverview(7);
const loadDaily = () => staffDaily(30);
const loadReports = () => latestReports(1);

const MODEL_NAME: Record<string, string> = { 'claude-opus-5-5': 'Claude Opus 5.5', 'claude-fable-5-1': 'Claude Fable 5.1', 'claude-haiku-5-5': 'Claude Haiku 5.5' };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function ProseCard({ report }: { report: WeeklyReport }) {
  const a = report.aggregates;
  return (
    <Panel testID="staff-prose">
      {report.prose.split('\n\n').map((p, i) => (
        <Subhead key={i} style={{ color: colors.ink, marginBottom: 10 }}>
          {p}
        </Subhead>
      ))}
      <Footnote style={{ marginTop: 4 }}>
        {report.prose_source === 'model'
          ? ts('overview.prose.model', { model: MODEL_NAME[report.model ?? ''] ?? report.model ?? '', time: when(report.generated_at), confidence: a.proseConfidence ?? '' })
          : ts('overview.prose.template', { time: when(report.generated_at) })}
      </Footnote>
      {a.proseWhy ? <Footnote style={{ marginTop: 2 }}>{ts('overview.prose.why', { why: a.proseWhy })}</Footnote> : null}
    </Panel>
  );
}

/** Mean of the daily means per weekday; suppressed days are left out rather than counted as zero. */
function byWeekday(rows: DailyRow[]): { day: string; mean: number }[] {
  const names = tlist('time.days');
  const acc = names.map(() => ({ sum: 0, n: 0 }));
  for (const r of rows) {
    if (r.avg_energy == null) continue;
    const w = weekday(r.day);
    acc[w].sum += Number(r.avg_energy);
    acc[w].n += 1;
  }
  return [1, 2, 3, 4, 5, 6, 0].filter((w) => acc[w].n > 0).map((w) => ({ day: names[w], mean: acc[w].sum / acc[w].n }));
}

export default function StaffOverview() {
  const [overview] = useLoad(loadOverview);
  const [daily] = useLoad(loadDaily);
  const [reports, reloadReports] = useLoad(loadReports);
  const [writing, setWriting] = useState<'idle' | 'working' | 'failed' | 'cached'>('idle');

  const regenerate = useCallback(async () => {
    setWriting('working');
    const r = await generateReport();
    setWriting(!r ? 'failed' : r.cached ? 'cached' : 'idle');
    await reloadReports();
  }, [reloadReports]);

  const o = overview.status === 'ready' ? overview.data : null;
  const report = reports.status === 'ready' ? reports.data[0] : undefined;
  const prev = report?.aggregates.previous;
  const prevFoot = (x?: number) => (x != null ? ts('kpi.scale.prev', { prev: num(x, 2) }) : ts('kpi.scale'));

  return (
    <StaffPage title={ts('overview.title')} subtitle={o ? ts('overview.subtitle', { from: o.from, to: o.to }) : undefined} testID="staff-overview">
      <Section title={ts('overview.kpis.title')}>
        {overview.status === 'error' ? <Callout icon="info">{ts('common.unavailable')}</Callout> : null}
        {o?.suppressed ? <Callout icon="lock">{ts('common.suppressed')}</Callout> : null}
        {o && !o.suppressed ? (
          <Grid>
            <Kpi label={ts('kpi.participants')} value={String(o.students)} foot={ts('kpi.participants.foot')} testID="kpi-participants" />
            <Kpi label={ts('kpi.perStudent')} value={num(o.checkins_per_student)} foot={ts('kpi.perStudent.foot')} />
            <Kpi label={ts('kpi.energy')} value={num(o.avg_energy, 2)} foot={prevFoot(prev?.meanEnergy)} />
            <Kpi label={ts('kpi.fullness')} value={num(o.avg_fullness, 2)} foot={prevFoot(prev?.meanFullness)} />
            <Kpi label={ts('kpi.focus')} value={num(o.avg_focus, 2)} foot={prevFoot(prev?.meanFocus)} />
            <Kpi label={ts('kpi.skipped')} value={pct(o.skipped_share)} foot={ts('kpi.share.foot')} />
            <Kpi label={ts('kpi.heavy')} value={pct(o.heavy_share)} foot={ts('kpi.share.foot')} />
          </Grid>
        ) : null}
      </Section>

      <Section title={ts('overview.prose.title')}>
        {report ? <ProseCard report={report} /> : reports.status === 'ready' ? <Callout icon="info">{ts('overview.prose.none')}</Callout> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <Button title={ts('overview.prose.regenerate')} variant="ghost" icon="sparkle" onPress={() => void regenerate()} disabled={writing === 'working'} testID="staff-regenerate" />
          {writing === 'working' ? <Footnote>{ts('overview.prose.working')}</Footnote> : null}
          {writing === 'failed' ? <Footnote style={{ color: colors.crimsonInk }}>{ts('overview.prose.failed')}</Footnote> : null}
          {writing === 'cached' ? <Footnote>{ts('overview.prose.cached')}</Footnote> : null}
        </View>
      </Section>

      <Section title={ts('overview.daily.title')} foot={ts('overview.daily.foot')}>
        <Panel>{daily.status === 'ready' ? <DailyChart rows={daily.data} /> : daily.status === 'error' ? <Footnote>{ts('common.unavailable')}</Footnote> : null}</Panel>
      </Section>

      <Section title={ts('overview.weekday.title')} foot={ts('overview.weekday.foot')}>
        <Panel>
          {daily.status === 'ready'
            ? byWeekday(daily.data).map((d) => <BarRow key={d.day} label={d.day} share={(d.mean - 1) / 4} value={d.mean.toFixed(2)} />)
            : null}
        </Panel>
      </Section>

      <Section title={ts('overview.honest.title')}>
        <Panel>
          <Bullets keys={['overview.honest.1', 'overview.honest.2', 'overview.honest.3', 'overview.honest.4', 'overview.honest.5']} />
        </Panel>
      </Section>
    </StaffPage>
  );
}
