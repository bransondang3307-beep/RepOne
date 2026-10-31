import { useEffect, useRef } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from '../motion';

/** A number that gives a small "pop" each time it goes up, e.g. when a rep is counted. */
export function PopNumber({ value, style }: { value: number; style?: StyleProp<TextStyle> }) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef(value);

  useEffect(() => {
    const increased = value > previous.current;
    previous.current = value;
    if (!increased || reduced) return;
    scale.setValue(1.18);
    Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: true }).start();
  }, [reduced, scale, value]);

  return <Animated.Text style={[style, { transform: [{ scale }] }]}>{value}</Animated.Text>;
}
