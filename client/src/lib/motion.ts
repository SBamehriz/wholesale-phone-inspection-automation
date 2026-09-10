import { useReducedMotion, type Transition, type Variants } from "framer-motion";

/**
 * The motion vocabulary.
 *
 * Springs rather than durations. A spring animates from wherever the element
 * currently sits, which is what lets you grab a transition and reverse it
 * halfway through. In Framer Motion, `bounce` lines up with the damping ratio
 * and `duration` with the response. Neither one is a fixed play length.
 */

/** Critically damped. The default for anything you did not throw. */
export const spring: Transition = { type: "spring", bounce: 0, duration: 0.4 };

/**
 * A little overshoot. Only for motion that follows a gesture or an action you
 * committed to, like a toast arriving or a scan landing in the queue.
 */
export const springLively: Transition = { type: "spring", bounce: 0.22, duration: 0.42 };

/** Reduced motion keeps the feedback and drops the travel. */
const crossFade: Transition = { duration: 0.16, ease: "easeOut" };

export function useSpring(base: Transition = spring): Transition {
  return useReducedMotion() ? crossFade : base;
}

/**
 * Enter and exit along the same path, so a panel leaves the way it arrived.
 * Under reduced motion the offsets collapse and only opacity moves.
 */
export function useRise(distance = 8): Variants {
  const still = useReducedMotion();
  return {
    hidden: { opacity: 0, y: still ? 0 : distance },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: still ? 0 : distance },
  };
}

/** Staggers children so a list arrives as a sequence rather than a flash. */
export function useStagger(step = 0.035): Variants {
  const still = useReducedMotion();
  return {
    hidden: {},
    visible: { transition: { staggerChildren: still ? 0 : step } },
  };
}
