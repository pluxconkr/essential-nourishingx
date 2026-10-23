/**
 * /staff/data · Data & consent: what is stored and what is never collected, retention as it is today (no automatic
 * purge yet), the re-identification controls, the exact consent sentences students accept, and the approvals a pilot
 * still needs (all "Not started": this build runs on synthetic data).
 */
import { t, type Key } from '@/i18n';
import { ts, type StaffKey } from '@/i18n/staff';
import { Cell } from '@/ui/primitives';
import { Bullets, DataTable, Panel, Section, StaffPage } from '@/ui/staff/widgets';
import { colors } from '@/ui/theme';

const CONSENT: readonly Key[] = ['consent.s1', 'consent.s2', 'consent.s3', 'consent.s4', 'consent.s5', 'consent.s6', 'consent.s7'];
const APPROVALS: [StaffKey, StaffKey][] = [
  ['approval.wording', 'owner.health'],
  ['approval.policy', 'owner.it'],
  ['approval.ai', 'owner.it'],
  ['approval.students', 'owner.studentLife'],
  ['approval.thresholds', 'owner.clinician'],
];

export default function StaffData() {
  return (
    <StaffPage title={ts('data.title')} subtitle={ts('data.subtitle')} testID="staff-data">
      <Section title={ts('data.stored.title')}>
        <Panel style={{ padding: 0 }}>
          <Cell icon="checkin" title={ts('data.checkins')} />
          <Cell icon="camera" title={ts('data.meals')} />
          <Cell icon="sparkle" title={ts('data.ai')} last />
        </Panel>
      </Section>
      <Section title={ts('data.never.title')}>
        <Panel style={{ padding: 0 }}>
          <Cell icon="close" iconColor={colors.ink2} title={ts('data.never.body')} last />
        </Panel>
      </Section>
      <Section title={ts('data.retention.title')}>
        <Panel style={{ padding: 0 }}>
          <Cell icon="time" title={ts('data.retention.body')} last />
        </Panel>
      </Section>
      <Section title={ts('data.controls.title')}>
        <Panel>
          <Bullets keys={['data.controls.1', 'data.controls.2', 'data.controls.3', 'data.controls.4']} />
        </Panel>
      </Section>
      <Section title={ts('data.consent.title')} foot={ts('data.consent.foot')}>
        <Panel style={{ padding: 0 }} testID="staff-consent">
          {CONSENT.map((k, i) => (
            <Cell key={k} icon="checkCircle" iconColor={colors.green} title={t(k)} last={i === CONSENT.length - 1} />
          ))}
        </Panel>
      </Section>
      <Section title={ts('data.approvals.title')}>
        <DataTable columns={[{ label: ts('col.item'), flex: 2.5 }, { label: ts('col.owner'), flex: 1.2 }, { label: ts('col.status'), flex: 1 }]} rows={APPROVALS.map(([item, owner]) => [ts(item), ts(owner), ts('status.notStarted')])} />
      </Section>
    </StaffPage>
  );
}
