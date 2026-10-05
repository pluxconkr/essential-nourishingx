/**
 * Design tokens — the only file with colour and type literals.
 * Spec tokens (lines 14–55 of the prototype) with WCAG AA fixes for text on paper #FAF6F0.
 * Warm paper, crimson accent, green for good, amber for Watch. Flat surfaces, hairlines, no shadows.
 */
import { Platform, type TextStyle } from 'react-native';

import type { StateWord } from '@/domain/types';

export const colors = {
  paper: '#FAF6F0',
  surface: '#FFFFFF',
  surface2: '#F1EBE2',
  line: '#E8E1D6',
  ink: '#22201E', // ≈ 15:1 on paper
  ink2: '#4F4A45', // ≈ 8:1
  ink3: '#6B655E', // ≈ 5.3:1 (the spec's #8a837b is ≈ 3.5:1 and is not used for text)
  crimson: '#9B1B30', // ≈ 7.5:1 — the one accent; also the Needs-attention word
  crimsonSoft: '#FBE9EC',
  crimsonInk: '#5E0D1C',
  green: '#3F7D52', // ≈ 4.6:1 — large text and icons
  greenSoft: '#E8F2EA',
  greenInk: '#22462D',
  amber: '#8A5A00', // ≈ 5.5:1 — Watch as text (the spec's #c48420 fails AA for text)
  amberBar: '#C48420', // bars and dots only, always beside the word
  amberSoft: '#FDF1DD',
  grey: '#98918A', // dot only
  white: '#FFFFFF',
  onDark: 'rgba(255,255,255,0.80)',
} as const;

export const tint = colors.crimson;

/** State tones: text colour, dot/bar colour, soft surface. Never colour alone — always beside the word. */
export const stateTone: Record<StateWord, { text: string; dot: string; soft: string }> = {
  stable: { text: colors.green, dot: colors.green, soft: colors.greenSoft },
  watch: { text: colors.amber, dot: colors.amberBar, soft: colors.amberSoft },
  attention: { text: colors.crimson, dot: colors.crimson, soft: colors.crimsonSoft },
  nodata: { text: colors.ink2, dot: colors.grey, soft: colors.surface2 },
};

export const radius = { s: 8, m: 12, l: 18, xl: 26, pill: 999 } as const;

export const GUTTER = 16;
export const CELL_PAD = 16;
export const MIN_TAP = 44;

export const fonts = {
  sans: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  rounded: Platform.select({ ios: 'ui-rounded', android: 'sans-serif', default: 'System' }),
} as const;

export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** Text styles. Minimum 13 pt. Nothing outside this file sets fontSize / fontWeight / lineHeight / letterSpacing. */
export const text = {
  largeTitle: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.4, color: colors.ink },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const, letterSpacing: -0.2, color: colors.ink },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, letterSpacing: -0.3, color: colors.ink },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' as const, letterSpacing: -0.3, color: colors.ink },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const, letterSpacing: -0.2, color: colors.ink2 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const, color: colors.ink2 },
  sectionLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: colors.ink3 },
  /** The state word. */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.5 },
  /** The three 7-day averages. */
  score: { fontFamily: fonts.rounded, fontSize: 28, lineHeight: 32, fontWeight: '600' as const, letterSpacing: -0.5, color: colors.ink },
  /** 1–5 scale buttons. */
  scale: { fontSize: 20, lineHeight: 24, fontWeight: '700' as const },
  /** Timer pill. */
  pill: { fontSize: 13, lineHeight: 16, fontWeight: '700' as const, color: colors.crimsonInk },
  button: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  tabLabel: { fontSize: 11, fontWeight: '500' as const },
} as const;
