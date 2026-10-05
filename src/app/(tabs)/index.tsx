/**
 * Screen 1 · Home. Today's menu, 7-day averages, one suggestion, the check-in entry point, the week strip.
 * Dining content leads; the health framing stays quiet. Averages are the student's own inputs.
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { greeting, longDate } from '@/domain/format';
import { addDays } from '@/domain/time';
import { t } from '@/i18n';
import { menuForToday } from '@/services/menu';
import { school, useBalance, useCheckins, useToday, useTodayCheckin } from '@/store/derived';
import { MenuCard, ScoreBox, Suggestion, WeekStrip } from '@/ui/balance-widgets';
import { Badge, Button, Card, Footnote, SectionHeader, SectionFooter, Subhead } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function HomeScreen() {
  const router = useRouter();
  const today = useToday();
  const hour = new Date().getHours();
  const balance = useBalance();
  const checkins = useCheckins();
  const todayCheckin = useTodayCheckin();
  const menu = menuForToday(today, hour);
  const d = balance.derived;

  const mealName = menu ? t(`time.meal.${menu.meal}`) : '';
  const hours = menu ? school.dining[menu.meal] : '';
  const fullnessCaption = d.n === 0 ? t('common.outOfFive') : d.fullDelta < 0 ? t('home.score.down') : d.fullDelta > 0 ? t('home.score.up') : t('home.score.steady');
  const num = (x: number) => (d.n === 0 ? '–' : x.toFixed(1));

  const suggestLabel = balance.state === 'watch' || balance.state === 'attention' ? t('home.suggest.label.try') : t('home.suggest.label.today');
  const yesterdayMissing = checkins.length > 0 && !checkins.some((c) => c.date === addDays(today, -1));

  return (
    <Screen largeTitle={greeting(hour)} subtitle={menu ? t('home.subtitle', { date: longDate(today), meal: mealName.toLowerCase(), hours }) : longDate(today)} testID="home">
      {menu ? (
        <MenuCard
          meal={mealName}
          hours={hours}
          items={menu.items.map((i) => i.item)}
          footnote={t(menu.source === 'today' ? 'home.menu.footnote.today' : 'home.menu.footnote.template', { n: menu.totalItems })}
        />
      ) : null}

      <SectionHeader right={t('home.averages.coverage', { n: d.n })}>{t('home.averages.title')}</SectionHeader>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <ScoreBox label={t('home.score.energy')} value={num(d.energyMean)} caption={t('common.outOfFive')} testID="score-energy" />
        <ScoreBox label={t('home.score.focus')} value={num(d.focusMean)} caption={t('common.outOfFive')} />
        <ScoreBox label={t('home.score.fullness')} value={num(d.fullMean)} caption={fullnessCaption} />
      </View>

      <Suggestion label={suggestLabel} heading={t(`home.suggest.${balance.state}.h`)} body={t(`home.suggest.${balance.state}.p`, { dinner: school.dining.dinner })} />

      <SectionHeader>{t('home.today.title')}</SectionHeader>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Badge tone={todayCheckin ? 'green' : 'grey'}>{todayCheckin ? t('home.today.done') : t('home.today.notYet')}</Badge>
          <Subhead style={{ flex: 1 }}>
            {todayCheckin
              ? t('home.today.summary', { f: todayCheckin.fullness, e: todayCheckin.energy, fo: todayCheckin.focus, t: t(`training.word.${todayCheckin.training}`), s: t(`skipped.word.${todayCheckin.skipped}`) })
              : yesterdayMissing
                ? t('home.today.noYesterday')
                : t('home.today.first')}
          </Subhead>
        </View>
        <Button title={todayCheckin ? t('home.today.change') : t('home.today.start')} variant={todayCheckin ? 'ghost' : 'primary'} onPress={() => router.navigate('/checkin')} style={{ marginTop: 12 }} testID="home-start" />
      </Card>

      <SectionHeader>{t('home.week.title')}</SectionHeader>
      <Card>
        <WeekStrip window={balance.window} today={today} detailed />
        <Footnote style={{ marginTop: 10 }}>{t('home.week.footnote')}</Footnote>
        <Button title={t('home.week.open')} variant="ghost" onPress={() => router.navigate('/balance')} style={{ marginTop: 12 }} />
      </Card>
      <SectionFooter>{t('data.mode.local')}</SectionFooter>
    </Screen>
  );
}
