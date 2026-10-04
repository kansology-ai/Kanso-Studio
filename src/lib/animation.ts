import { Easing, interpolate, spring, type SpringConfig } from "remotion";

/**
 * Animation helpers. Everything here is a pure function of the frame, which
 * is what Remotion needs: CSS transitions/animations do not render.
 */

export const EASE = {
  /** Fast start, long soft landing. The default for entrances. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** Symmetric, for moves between two resting positions. */
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  /** Slow start, for exits. */
  in: Easing.bezier(0.7, 0, 0.84, 0),
} as const;

export const SPRING = {
  /** No overshoot. Good for text and UI. */
  smooth: { damping: 200 },
  /** Quick with a hint of overshoot. Good for cards and icons. */
  snappy: { damping: 18, stiffness: 180 },
  /** Visible bounce. Use sparingly for playful accents. */
  bouncy: { damping: 9, mass: 0.6 },
} as const satisfies Record<string, Partial<SpringConfig>>;

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** 0 → 1 between `start` and `start + duration` frames, eased and clamped. */
export const progress = (
  frame: number,
  start: number,
  duration: number,
  easing: (t: number) => number = EASE.out,
): number =>
  interpolate(frame, [start, start + Math.max(1, duration)], [0, 1], {
    ...CLAMP,
    easing,
  });

/** Spring from 0 → 1 that starts after `delay` frames. */
export const springIn = ({
  frame,
  fps,
  delay = 0,
  config = SPRING.smooth,
  durationInFrames,
}: {
  frame: number;
  fps: number;
  delay?: number;
  config?: Partial<SpringConfig>;
  durationInFrames?: number;
}): number => spring({ frame, fps, delay, config, durationInFrames });

/**
 * Opacity envelope: fades in over `fadeFrames`, holds, then fades out so it
 * reaches 0 at `durationInFrames`.
 */
export const fadeInOut = (
  frame: number,
  durationInFrames: number,
  fadeFrames: number,
): number => {
  const fade = Math.max(
    1,
    Math.min(fadeFrames, Math.floor(durationInFrames / 2) - 1),
  );
  return interpolate(
    frame,
    [0, fade, durationInFrames - fade, durationInFrames],
    [0, 1, 1, 0],
    CLAMP,
  );
};

/** Start frame for the `index`-th item in a staggered group. */
export const stagger = (
  index: number,
  stepFrames: number,
  offset = 0,
): number => offset + index * stepFrames;

/** Linear blend between two numbers by `t` (0 → `from`, 1 → `to`). */
export const mix = (t: number, from: number, to: number): number =>
  from + (to - from) * t;

/** Smooth, deterministic float for idle motion (seconds-based, fps-independent). */
export const drift = (
  frame: number,
  fps: number,
  { speed = 0.5, amplitude = 10, phase = 0 } = {},
): number => Math.sin((frame / fps) * speed * Math.PI * 2 + phase) * amplitude;
