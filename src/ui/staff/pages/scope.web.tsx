/**
 * /staff/scope · Scope guard (plan R1: scope creep is the top project risk): the features this product will not have,
 * each with its reason and the answer to give, the six build counters with the first build beside them, and the
 * weekly review questions. Counter values come from src/domain/counters.ts, which a test checks against the code.
 */
import { COUNTERS, FIRST_BUILD } from '@/domain/counters';
import { ts, type StaffKey } from '@/i18n/staff';
import { Bullets, DataTable, Panel, Section, StaffPage } from '@/ui/staff/widgets';

const EXCLUDED = ['feed', 'points', 'friends', 'waste', 'weight', 'targets', 'menuApi', 'simulator', 'chatbot', 'alerts'] as const;
const COUNTER_KEYS = Object.keys(COUNTERS) as (keyof typeof COUNTERS)[];

export default function StaffScope() {
  return (
    <StaffPage title={ts('scope.title')} subtitle={ts('scope.subtitle')} testID="staff-scope">
      <Section title={ts('scope.excluded.title')}>
        <DataTable
          testID="scope-excluded"
          columns={[{ label: ts('col.feature'), flex: 1.2 }, { label: ts('col.why'), flex: 2 }, { label: ts('col.ifAsked'), flex: 2 }]}
          rows={EXCLUDED.map((k) => [ts(`scope.${k}`), ts(`scope.${k}.why` as StaffKey), ts(`scope.${k}.ask` as StaffKey)])}
        />
      </Section>
      <Section title={ts('scope.counters.title')} foot={ts('scope.counters.foot')}>
        <DataTable
          testID="scope-counters"
          columns={[{ label: ts('col.counter'), flex: 1.3 }, { label: ts('col.firstBuild'), numeric: true, flex: 0.7 }, { label: ts('col.now'), numeric: true, flex: 0.6 }, { label: ts('col.reason'), flex: 3 }]}
          rows={COUNTER_KEYS.map((k) => [ts(`counter.${k}`), FIRST_BUILD[k], COUNTERS[k], ts(`counter.${k}.why` as StaffKey)])}
        />
      </Section>
      <Section title={ts('scope.review.title')}>
        <Panel>
          <Bullets keys={['scope.review.1', 'scope.review.2', 'scope.review.3', 'scope.review.4', 'scope.review.5', 'scope.review.6']} />
        </Panel>
      </Section>
    </StaffPage>
  );
}
