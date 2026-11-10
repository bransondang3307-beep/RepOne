import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '../motion';
import { useTheme, useThemedStyles, type Theme } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { PulseDot } from './PulseDot';

interface Props extends BottomTabBarProps {
  /** Icon per route name. */
  icons: Record<string, IconName>;
  /** Route whose tab shows a pulsing "live" dot (e.g. while a set is recording on it). */
  liveRoute?: string | null;
  /** Routes without a tab, each mapped to the tab shown as selected while it is open. */
  hiddenRoutes?: Readonly<Record<string, string>>;
}

/** A floating, rounded bottom navigation bar with a sliding highlight behind the active tab. */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets, icons, liveRoute = null, hiddenRoutes = {} }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const routes = state.routes.filter((route) => !(route.name in hiddenRoutes));
  const current = state.routes[state.index]?.name;
  const selectedName = current !== undefined && current in hiddenRoutes ? hiddenRoutes[current] : current;
  const selected = Math.max(0, routes.findIndex((route) => route.name === selectedName));
  const slide = useRef(new Animated.Value(selected)).current;
  const tabWidth = routes.length > 0 ? (barWidth - BAR_PADDING * 2) / routes.length : 0;

  useEffect(() => {
    if (reduced) {
      slide.setValue(selected);
      return;
    }
    Animated.spring(slide, { toValue: selected, speed: 18, bounciness: 7, useNativeDriver: true }).start();
  }, [reduced, slide, selected]);

  return (
    <View style={[styles.outer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar} accessibilityRole="tablist" onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
        {tabWidth > 0 && (
          <Animated.View
            style={[
              styles.indicator,
              {
                width: tabWidth,
                transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, tabWidth] }) }],
              },
            ]}
          />
        )}
        {routes.map((route, index) => {
          const focused = selected === index;
          const title = descriptors[route.key]?.options.title ?? route.name;
          const color = focused ? colors.primaryText : colors.textMuted;
          const live = liveRoute === route.name;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (state.routes[state.index]?.key !== route.key && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={live ? `${title}, recording` : title}
              onPress={onPress}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.tab}
            >
              <View>
                <Icon name={icons[route.name] ?? 'home'} color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
                {live && (
                  <View style={styles.live}>
                    <PulseDot color={colors.danger} active size={7} />
                  </View>
                )}
              </View>
              <Text style={[styles.label, { color }, focused && styles.labelFocused]}>{title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const BAR_PADDING = 6;

const makeStyles = ({ colors, radius, spacing, typography, elevation }: Theme) =>
  StyleSheet.create({
    outer: { backgroundColor: colors.background, paddingHorizontal: spacing.md + 4, paddingTop: spacing.sm },
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.tabBar,
      borderRadius: radius.lg + 4,
      padding: BAR_PADDING,
      ...elevation,
    },
    indicator: {
      position: 'absolute',
      top: BAR_PADDING,
      bottom: BAR_PADDING,
      left: BAR_PADDING,
      borderRadius: radius.lg,
      backgroundColor: colors.primarySoft,
    },
    tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, gap: 3, minHeight: 52 },
    live: { position: 'absolute', top: -8, right: -12 },
    label: { ...typography.caption, fontSize: 11 },
    labelFocused: { fontWeight: '800' },
  });
