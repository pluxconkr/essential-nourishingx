/**
 * /staff/wellness · Aggregate states: the Balance word each participant sees, counted by the weekly report
 * (cohortReport → the phone's balanceFor), four closed weeks as counts not rates, which rule chose the word, and why
 * there is no list of students behind any number ("Not hidden — not built"). The word, clause and streak counts are
 * shown even under 10 inside a reported week, the documented exception in docs/security-and-privacy.md.
 */
import { View } from 'react-native';

import { CLAUSE_WORD } from '@/domain/rules';
import { CLAUSES, type StateWord } from '@/domain/types';
import { t } from '@/i18n';
import { ts } from '@/i18n/staff';
import { latestReports } from '@/services/staff';
import { Callout, Cell, Footnote, Subhead } from '@/ui/primitives';
import { BarRow, Bullets, DataTable, Grid, Panel, Section, StaffPage, StateCount, clauseText, pct, useLoad } from '@/ui/staff/widgets';
import { colors, stateTone } from '@/ui/theme';

const WORDS: readonly StateWord[] = ['stable', 'watch', 'attention', 'nodata'];
const loadReports = () => latestReports(4);

export default function StaffWellness() {
  const [reports] = useLoad(loadReports);
  const list = reports.status === 'ready' ? reports.data : [];
  const latest = list[0]?.aggregates;

  return (
    <StaffPage title={ts('wellness.title')} subtitle={ts('wellness.subtitle')} testID="staff-wellness">
      {reports.status === 'error' ? <Callout icon="info">{ts('common.unavailable')}</Callout> : null}
      {reports.status === 'ready' && !latest ? <Callout icon="info">{ts('wellness.none')}</Callout> : null}
      {latest?.suppressed ? <Callout icon="lock">{ts('common.suppressed')}</Callout> : null}

      {latest && !latest.suppressed && latest.states ? (
        <>
          <Section title={`${ts('wellness.counts.title')} · ${ts('common.window', { from: latest.from, to: latest.to })}`} foot={ts('wellness.streak.foot')}>
            <Grid>
              {WORDS.map((w) => (
                <StateCount key={w} state={w} n={latest.states![w]} testID={`count-${w}`} />
              ))}
            </Grid>
            <Subhead style={{ marginTop: 12, color: colors.ink }}>{ts('wellness.streak', { n: latest.attentionStreak3 ?? 0 })}</Subhead>
            {latest.syntheticShare ? <Footnote style={{ marginTop: 6 }}>{ts('report.synthetic', { share: pct(latest.syntheticShare) })}</Footnote> : null}
          </Section>

          <Section title={ts('wellness.trend.title')}>
            <DataTable
              testID="wellness-trend"
              columns={[{ label: ts('wellness.trend.week'), flex: 1.4 }, ...WORDS.map((w) => ({ label: t(`state.${w}`), numeric: true })), { label: ts('col.participants'), numeric: true }, { label: ts('col.synthetic'), numeric: true }]}
              rows={[...list].reverse().map((r) => [r.week_start, ...WORDS.map((w) => (r.aggregates.suppressed ? null : (r.aggregates.states?.[w] ?? null))), r.aggregates.students ?? null, r.aggregates.suppressed ? null : pct(r.aggregates.syntheticShare)])}
            />
          </Section>

          <Section title={ts('wellness.drivers.title')} foot={ts('wellness.drivers.foot')}>
            <Panel>
              {CLAUSES.filter((c) => (latest.clauses?.[c] ?? 0) > 0).map((c) => (
                <View key={c}>
                  <BarRow label={`${c} · ${t(`state.${CLAUSE_WORD[c]}`)}`} share={(latest.clauses?.[c] ?? 0) / latest.students!} value={String(latest.clauses?.[c] ?? 0)} color={stateTone[CLAUSE_WORD[c]].dot} />
                  <Footnote style={{ marginLeft: 2, marginBottom: 4 }}>{clauseText(c)}</Footnote>
                </View>
              ))}
            </Panel>
          </Section>
        </>
      ) : null}

      <Section title={ts('wellness.states.title')}>
        <Panel style={{ padding: 0 }}>
          <Cell title={t('state.nodata')} subtitle={t('how.state.nodata')} />
          <Cell title={t('state.stable')} subtitle={t('how.state.stable')} />
          <Cell title={t('state.watch')} subtitle={t('how.state.watch')} />
          <Cell title={t('state.attention')} subtitle={t('how.state.attention')} />
          <Cell title={t('how.hold.title')} subtitle={t('how.state.three')} last />
        </Panel>
      </Section>

      <Section title={ts('wellness.hard.title')}>
        <Callout icon="lock">{ts('wellness.hard.body')}</Callout>
      </Section>

      <Section title={ts('wellness.do.title')}>
        <Panel>
          <Bullets keys={['wellness.do.1', 'wellness.do.2', 'wellness.do.3']} />
        </Panel>
      </Section>
    </StaffPage>
  );
}
