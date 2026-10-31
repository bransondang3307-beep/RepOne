// Shared, feature-agnostic UI building blocks: theme, motion and components.
export { BarChart, type BarDatum } from './components/BarChart';
export { Card } from './components/Card';
export { FadeIn } from './components/FadeIn';
export { Icon, type IconName } from './components/Icon';
export { PopNumber } from './components/PopNumber';
export { PressableScale } from './components/PressableScale';
export { PrimaryButton } from './components/PrimaryButton';
export { ProvenanceBadge } from './components/ProvenanceBadge';
export { PulseDot } from './components/PulseDot';
export { RingChart, type Ring, type RingSegment } from './components/RingChart';
export { Screen, ScreenHeader, useScreenContentStyle } from './components/Screen';
export { SpinningArc } from './components/SpinningArc';
export { StatTile } from './components/StatTile';
export { TabBar } from './components/TabBar';
export { motion, useReducedMotion } from './motion';
export { themeFor, useTheme, useThemedStyles, type ColorScheme, type Theme } from './theme/theme';
export { darkPalette, lightPalette, radius, spacing, typography, type Palette } from './theme/tokens';
