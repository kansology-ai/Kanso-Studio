/**
 * Single source of truth for video format and timing.
 *
 * Change resolution or frame rate here and every composition that spreads
 * `VIDEO` picks it up. Durations are written in seconds and converted to
 * frames with the active fps, so timing stays the same at 24, 30 or 60 fps.
 */

export const VIDEO = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

/** Common alternative formats. Swap one of these into `VIDEO` above. */
export const FORMATS = {
  landscape1080: { width: 1920, height: 1080 },
  landscape4k: { width: 3840, height: 2160 },
  portrait1080: { width: 1080, height: 1920 },
  square1080: { width: 1080, height: 1080 },
  /** Phone wallpaper (iPhone Pro Max native; crops cleanly on Android). */
  phoneWallpaper: { width: 1290, height: 2796 },
} as const;

/** Scene lengths for the Showcase composition, in seconds. */
export const SHOWCASE_TIMING = {
  introSeconds: 4,
  featuresSeconds: 4.5,
  outroSeconds: 4,
  transitionSeconds: 0.7,
} as const;

export const secondsToFrames = (seconds: number, fps: number): number =>
  Math.max(1, Math.round(seconds * fps));

/**
 * Total Showcase length. Transitions overlap neighbouring scenes, so each one
 * shortens the timeline by its own duration.
 */
export const getShowcaseDuration = (fps: number): number => {
  const t = SHOWCASE_TIMING;
  const transitions = 2;
  return (
    secondsToFrames(t.introSeconds, fps) +
    secondsToFrames(t.featuresSeconds, fps) +
    secondsToFrames(t.outroSeconds, fps) -
    transitions * secondsToFrames(t.transitionSeconds, fps)
  );
};
