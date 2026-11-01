import { useRef } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../motion';

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; pressedScale?: number };

/** A Pressable that gently shrinks while pressed, so every tappable surface gives the same feedback. */
export function PressableScale({ style, pressedScale = 0.97, onPressIn, onPressOut, children, ...rest }: Props) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (value: number) =>
    Animated.spring(scale, { toValue: value, speed: 40, bounciness: 6, useNativeDriver: true }).start();

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (!reduced) to(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) to(1);
        onPressOut?.(e);
      }}
    >
      {(state) => (
        <Animated.View style={[style, { transform: [{ scale }] }]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
