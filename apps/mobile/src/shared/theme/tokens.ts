/**
 * Design tokens. Two palettes with the same keys, so every component works in light and dark mode. Colors are
 * semantic: `full` and `partial` always mean those rep classifications, so charts and counters stay consistent.
 */
export interface Palette {
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly text: string;
  readonly textMuted: string;
  readonly border: string;
  readonly primary: string;
  readonly primarySoft: string;
  /** Primary-colored text and icons, readable on `background`, `surface` and `primarySoft`. */
  readonly primaryText: string;
  readonly onPrimary: string;
  readonly full: string;
  readonly fullSoft: string;
  /** Full-rep green for text, readable on `fullSoft` and `surface`. */
  readonly fullText: string;
  readonly partial: string;
  readonly danger: string;
  readonly onDanger: string;
  readonly success: string;
  readonly warningBg: string;
  readonly warningText: string;
  readonly track: string;
  readonly shadow: string;
  readonly tabBar: string;
}

export const lightPalette: Palette = {
  background: '#F4F3F9',
  surface: '#FFFFFF',
  surfaceAlt: '#EEECF6',
  text: '#16141F',
  textMuted: '#686579',
  border: '#E3E1EC',
  primary: '#5A3CF0',
  primarySoft: '#ECE8FF',
  primaryText: '#5A3CF0',
  onPrimary: '#FFFFFF',
  full: '#14A46C',
  fullSoft: '#DDF5EA',
  fullText: '#0B6E47',
  partial: '#E58A00',
  danger: '#C42B30',
  onDanger: '#FFFFFF',
  success: '#14A46C',
  warningBg: '#FFF4DB',
  warningText: '#7A5200',
  track: '#E9E7F1',
  shadow: '#2B1D80',
  tabBar: '#FFFFFF',
};

export const darkPalette: Palette = {
  background: '#0F0E15',
  surface: '#1A1823',
  surfaceAlt: '#24212F',
  text: '#F3F1FA',
  textMuted: '#A3A0B6',
  border: '#2E2B3B',
  primary: '#6C52FF',
  primarySoft: '#2A2453',
  primaryText: '#BCB0FF',
  onPrimary: '#FFFFFF',
  full: '#34D399',
  fullSoft: '#123B2C',
  fullText: '#6EE7B7',
  partial: '#FBBF24',
  danger: '#F06A6E',
  onDanger: '#1A0607',
  success: '#34D399',
  warningBg: '#3A2D0B',
  warningText: '#FCD58A',
  track: '#2C2938',
  shadow: '#000000',
  tabBar: '#1E1C28',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

export const typography = {
  display: { fontSize: 64, fontWeight: '800', letterSpacing: -2 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  stat: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '500' },
} as const;
