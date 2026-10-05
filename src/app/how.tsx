/** How this works — the rules in plain words, from the student's side. */
import { t } from '@/i18n';
import { Callout, Card, Cell, SectionHeader } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function HowScreen() {
  return (
    <Screen title={t('how.title')} fallback="/balance" testID="how">
      <SectionHeader>{t('how.rules.title')}</SectionHeader>
      <Callout icon="info">{t('how.rules.body')}</Callout>
      <SectionHeader>{t('how.words.title')}</SectionHeader>
      <Callout icon="balance">{t('how.words.body')}</Callout>
      <SectionHeader>{t('how.evidence.title')}</SectionHeader>
      <Callout icon="checkCircle">{t('how.evidence.body')}</Callout>
      <SectionHeader>{t('how.hold.title')}</SectionHeader>
      <Callout icon="time">{t('how.hold.body')}</Callout>
      <SectionHeader>{t('how.states.title')}</SectionHeader>
      <Card padded={false}>
        <Cell title={t('state.nodata')} subtitle={t('how.state.nodata')} />
        <Cell title={t('state.stable')} subtitle={t('how.state.stable')} />
        <Cell title={t('state.watch')} subtitle={t('how.state.watch')} />
        <Cell title={t('state.attention')} subtitle={t('how.state.attention')} />
        <Cell title={t('how.hold.title')} subtitle={t('how.state.three')} last />
      </Card>
      <Callout icon="lock">{t('how.nobody')}</Callout>
    </Screen>
  );
}
