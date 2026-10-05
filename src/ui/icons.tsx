/** Icons: Ionicons, inline, tinted, never on a background shape. Decorative by default (hidden from the screen reader). */
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

type IonName = ComponentProps<typeof Ionicons>['name'];

const ICONS = {
  home: 'home',
  homeOutline: 'home-outline',
  checkin: 'timer',
  checkinOutline: 'timer-outline',
  balance: 'scale',
  balanceOutline: 'scale-outline',
  meals: 'restaurant-outline',
  training: 'walk-outline',
  energy: 'flash-outline',
  fullness: 'pizza-outline',
  focus: 'book-outline',
  check: 'checkmark',
  checkCircle: 'checkmark-circle',
  chevron: 'chevron-forward',
  back: 'chevron-back',
  close: 'close',
  info: 'information-circle-outline',
  health: 'medkit-outline',
  call: 'call-outline',
  bell: 'notifications-outline',
  download: 'download-outline',
  trash: 'trash-outline',
  sparkle: 'sparkles-outline',
  leaf: 'leaf-outline',
  message: 'chatbubble-ellipses-outline',
  time: 'time-outline',
  lock: 'lock-closed-outline',
} as const satisfies Record<string, IonName>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color, style, label }: { name: IconName; size?: number; color: string; style?: StyleProp<TextStyle>; label?: string }) {
  return (
    <Ionicons
      name={ICONS[name]}
      size={size}
      color={color}
      style={style}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      accessibilityLabel={label}
    />
  );
}
