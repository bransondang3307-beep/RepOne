import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { motion, useReducedMotion } from '../motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RingSegment {
  /** Share of the full circle, 0…1. Segments of one ring are drawn one after another, clockwise from the top. */
  readonly fraction: number;
  readonly color: string;
}

export interface Ring {
  readonly segments: readonly RingSegment[];
}

interface Props {
  /** Outermost ring first. */
  rings: readonly Ring[];
  size: number;
  strokeWidth?: number;
  gap?: number;
  trackColor: string;
  /** Shown in the middle (e.g. the main number). */
  children?: ReactNode;
  /** Ring charts are drawings; this sentence carries their numbers for screen readers. */
  accessibilityLabel: string;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Where each segment ends, as a running total: [0.6, 0.9] for segments 0.6 and 0.3. */
export function cumulativeEnds(segments: readonly RingSegment[]): number[] {
  let total = 0;
  return segments.map((s) => (total = clamp01(total + clamp01(s.fraction))));
}

/** Concentric progress rings. Arcs animate smoothly from their previous values to new ones. */
export function RingChart({ rings, size, strokeWidth = 14, gap = 6, trackColor, children, accessibilityLabel }: Props) {
  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {rings.map((ring, i) => (
            <RingArcs
              key={i}
              ring={ring}
              radius={(size - strokeWidth) / 2 - i * (strokeWidth + gap)}
              center={size / 2}
              strokeWidth={strokeWidth}
              trackColor={trackColor}
            />
          ))}
        </G>
      </Svg>
      {children && <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>}
    </View>
  );
}

function RingArcs({
  ring,
  radius,
  center,
  strokeWidth,
  trackColor,
}: {
  ring: Ring;
  radius: number;
  center: number;
  strokeWidth: number;
  trackColor: string;
}) {
  const circumference = 2 * Math.PI * Math.max(radius, 0);
  const ends = cumulativeEnds(ring.segments);
  return (
    <>
      <Circle cx={center} cy={center} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {/* Drawn last-to-first: each arc runs from the top to its segment's end, and earlier segments cover the start. */}
      {ends
        .map((end, i) => (
          <AnimatedArc
            key={i}
            end={end}
            color={ring.segments[i]!.color}
            radius={radius}
            center={center}
            strokeWidth={strokeWidth}
            circumference={circumference}
          />
        ))
        .reverse()}
    </>
  );
}

function AnimatedArc({
  end,
  color,
  radius,
  center,
  strokeWidth,
  circumference,
}: {
  end: number;
  color: string;
  radius: number;
  center: number;
  strokeWidth: number;
  circumference: number;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(end);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: end,
      duration: motion.slow + 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [end, progress, reduced]);

  return (
    <AnimatedCircle
      cx={center}
      cy={center}
      r={radius}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      fill="none"
      // A zero-length arc with round caps would still draw a dot.
      strokeOpacity={end > 0 ? 1 : 0}
      strokeDasharray={`${circumference} ${circumference}`}
      strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
