import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Durations (ms) shared by every animation, so motion feels consistent across screens. */
export const motion = { fast: 160, base: 280, slow: 520, stagger: 60 } as const;

/**
 * True when the phone's "Reduce Motion" setting is on. Components then jump to their end state instead of
 * animating (decorative loops such as the recording indicator stop).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => mounted && setReduced(value),
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
