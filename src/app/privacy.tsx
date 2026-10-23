import { t } from '@/i18n';
import { cloudEnabled } from '@/store/derived';
import { Callout } from '@/ui/primitives';
import { Screen } from '@/ui/Screen';

export default function PrivacyScreen() {
  return (
    <Screen title={t('privacy.title')} fallback="/" testID="privacy">
      {cloudEnabled ? (
        <>
          <Callout icon="lock">{t('privacy.cloud1')}</Callout>
          <Callout icon="info">{t('privacy.cloud2')}</Callout>
          <Callout icon="camera">{t('privacy.cloud3')}</Callout>
          <Callout icon="download">{t('privacy.cloud4')}</Callout>
        </>
      ) : (
        <>
          <Callout icon="lock">{t('privacy.body1')}</Callout>
          <Callout icon="info">{t('privacy.body2')}</Callout>
          <Callout icon="download">{t('privacy.body3')}</Callout>
        </>
      )}
    </Screen>
  );
}
