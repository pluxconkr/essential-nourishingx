import { useRouter } from 'expo-router';

import { t } from '@/i18n';
import { Button, Callout } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen largeTitle={t('notfound.title')}>
      <Callout icon="info">{t('notfound.body')}</Callout>
      <Button title={t('notfound.button')} variant="ghost" onPress={() => router.replace('/')} />
    </Screen>
  );
}
