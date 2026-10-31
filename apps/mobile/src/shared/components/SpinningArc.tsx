import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReducedMotion } from '../motion';

interface Props {
  size: number;
  color: string;
  strokeWidth?: number;
  /** Rotation only runs while active; otherwise nothing is drawn. */
  active: boolean;
}

/**
 * An indeterminate "live" indicator: a short arc circling the edge of a ring chart while a set records.
 * It shows activity, not progress — there is no target to progress toward.
 */
export function SpinningArc({ size, color, strokeWidth = 4, active }: Props) {
  const reduced = useReducedMotion();
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduced) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduced, spin]);

  if (!active) return null;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
      ]}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * 0.18} ${circumference}`}
        />
      </Svg>
    </Animated.View>
  );
}
