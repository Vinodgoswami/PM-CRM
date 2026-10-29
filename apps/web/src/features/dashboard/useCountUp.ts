import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/** Animates a displayed number towards `target` (display only; money maths stays in integers elsewhere). */
export function useCountUp(target: number, duration = 0.8): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) return setValue(target);
    const controls = animate(0, target, { duration, ease: [0.2, 0, 0, 1], onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [target, duration, reduce]);
  return value;
}
