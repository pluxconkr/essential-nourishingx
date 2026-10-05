/**
 * Screen 3 · Energy Balance. One of three words (plus the honest fourth), four evidence lines, up to three
 * actions, the disclaimer pinned. No numbers that read as a score: integer day counts and the phone only.
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { t, tn } from '@/i18n';
import { school, useBalance, useToday } from '@/store/derived';
import { ActionRow, AttentionCard, EvidenceRow, StateWordView, WeekStrip, stateWord } from '@/ui/balance-widgets';
import { Button, Callout, Card, Cell, Footnote, SectionHeader, SectionLabel, Subhead } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function BalanceScreen() {
  const router = useRouter();
  const today = useToday();
  const b = useBalance();
  const word = stateWord(b.state);
  const nodata = b.state === 'nodata';

  return (
    <Screen largeTitle={t('balance.title')} subtitle={t('balance.subtitle', { word, n: b.derived.n })} testID="balance">
      <Card testID="state-card">
        <SectionLabel>{t('balance.card.label')}</SectionLabel>
        <View style={{ marginTop: 6 }}>
          <StateWordView state={b.state} testID="state-word" />
        </View>
        <Footnote style={{ marginTop: 6 }}>{tn(b.derived.n, 'balance.card.basedOn')}</Footnote>
        <WeekStrip window={b.window} today={today} />
        <Footnote style={{ marginTop: 10 }}>{t(nodata ? 'balance.card.grey' : 'balance.card.bars')}</Footnote>
        {b.held ? <Footnote style={{ marginTop: 4 }}>{t('balance.held', { word: word.toLowerCase() })}</Footnote> : null}
      </Card>

      {nodata ? (
        <Callout icon="info">{t('balance.nodata')}</Callout>
      ) : (
        <>
          <SectionHeader>{t('balance.why', { word: word.toLowerCase() })}</SectionHeader>
          <View style={{ marginBottom: 4 }}>
            {b.evidence.map((e) => (
              <EvidenceRow key={e.category} evidence={e} />
            ))}
          </View>

          <SectionHeader>{b.state === 'stable' ? t('balance.keep') : t('balance.try')}</SectionHeader>
          <View style={{ marginBottom: 4 }}>
            {b.actions.map((a, k) => (
              <ActionRow key={a} n={k + 1} action={a} />
            ))}
          </View>
        </>
      )}

      {b.state === 'attention' ? (
        <AttentionCard phoneDisplay={school.healthCenter.phoneDisplay} phone={school.healthCenter.phone} firm={b.attentionStreak >= 3} onReach={() => router.push('/health')} messageText={t('attention.messageText')} />
      ) : null}

      <SectionHeader>{t('balance.from.title')}</SectionHeader>
      <Card padded={false}>
        <View style={{ padding: 16 }}>
          <Subhead>{t('balance.from.body', { clause: t(`clause.${b.clause}`) })}</Subhead>
        </View>
        <Cell icon="info" title={t('balance.how')} accessory="chevron" onPress={() => router.push('/how')} last />
      </Card>

      <Button title={t('balance.update')} variant="ghost" onPress={() => router.navigate('/checkin')} style={{ marginTop: 4 }} />
    </Screen>
  );
}
