import { t } from '@/i18n';
import { Callout } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function PrivacyScreen() {
  return (
    <Screen title={t('privacy.title')} fallback="/" testID="privacy">
      <Callout icon="lock">{t('privacy.body1')}</Callout>
      <Callout icon="info">{t('privacy.body2')}</Callout>
      <Callout icon="download">{t('privacy.body3')}</Callout>
    </Screen>
  );
}
