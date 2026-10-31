import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../motion';

interface Props {
  color: string;
  /** When true a soft halo pulses around the dot (e.g. "connected" or "recording"). */
  active?: boolean;
  size?: number;
}

/** A status dot. Its pulse marks something live; it is decorative, so screen readers skip it. */
export function PulseDot({ color, active = false, size = 10 }: Props) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduced) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse, reduced]);

  const halo = size * 2.4;
  return (
    <View style={[styles.box, { width: halo, height: halo }]} accessible={false} importantForAccessibility="no-hide-descendants">
      {active && !reduced && (
        <Animated.View
          style={{
            position: 'absolute',
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            backgroundColor: color,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
