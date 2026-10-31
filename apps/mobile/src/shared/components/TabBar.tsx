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
}

/** A floating, rounded bottom navigation bar with a sliding highlight behind the active tab. */
export function TabBar({ state, descriptors, navigation, insets, icons, liveRoute = null }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduced = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const slide = useRef(new Animated.Value(state.index)).current;
  const tabWidth = state.routes.length > 0 ? (barWidth - BAR_PADDING * 2) / state.routes.length : 0;

  useEffect(() => {
    if (reduced) {
      slide.setValue(state.index);
      return;
    }
    Animated.spring(slide, { toValue: state.index, speed: 18, bounciness: 7, useNativeDriver: true }).start();
  }, [reduced, slide, state.index]);

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
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const title = descriptors[route.key]?.options.title ?? route.name;
          const color = focused ? colors.primaryText : colors.textMuted;
          const live = liveRoute === route.name;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={live ? `${title}, recording` : title}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
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
