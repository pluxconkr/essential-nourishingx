import { useRouter } from 'expo-router';

import { t } from '@/i18n';
import { Button, Callout } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function NotNowScreen() {
  const router = useRouter();
  return (
    <Screen largeTitle={t('notnow.title')} safety="text">
      <Callout icon="leaf">{t('notnow.body')}</Callout>
      <Button title={t('notnow.back')} variant="ghost" onPress={() => router.replace('/consent')} />
    </Screen>
  );
}
