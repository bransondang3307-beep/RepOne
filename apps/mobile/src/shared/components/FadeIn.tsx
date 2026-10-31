import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { motion, useReducedMotion } from '../motion';

interface Props {
  children: ReactNode;
  /** Position in a list: each step delays the entrance a little, so cards arrive in sequence. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/** Entrance animation: content rises slightly and fades in once, when it first mounts. */
export function FadeIn({ children, index = 0, style }: Props) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: motion.slow,
      delay: Math.min(index, 8) * motion.stagger,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, index]);

  const animated = reduced
    ? null
    : {
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      };
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
