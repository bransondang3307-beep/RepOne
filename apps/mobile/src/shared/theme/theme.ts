import { useMemo } from 'react';
import { useColorScheme, type ViewStyle } from 'react-native';
import { darkPalette, lightPalette, radius, spacing, typography, type Palette } from './tokens';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  readonly scheme: ColorScheme;
  readonly colors: Palette;
  readonly spacing: typeof spacing;
  readonly radius: typeof radius;
  readonly typography: typeof typography;
  /** Subtle depth for cards: a soft shadow in light mode, a hairline border in dark mode (shadows vanish there). */
  readonly elevation: ViewStyle;
}

export function themeFor(scheme: ColorScheme): Theme {
  const colors = scheme === 'dark' ? darkPalette : lightPalette;
  const elevation: ViewStyle =
    scheme === 'dark'
      ? { borderWidth: 1, borderColor: colors.border }
      : {
          shadowColor: colors.shadow,
          shadowOpacity: 0.07,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 3,
        };
  return { scheme, colors, spacing, radius, typography, elevation };
}

const THEMES: Record<ColorScheme, Theme> = { light: themeFor('light'), dark: themeFor('dark') };

/** The theme for the phone's current appearance setting (light unless the system asks for dark). */
export function useTheme(): Theme {
  return THEMES[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

/** Builds a component's styles from the theme, once per theme. */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  // The factory is a module-level constant in every caller, so the theme is the only real dependency.
  return useMemo(() => factory(theme), [theme]);
}
