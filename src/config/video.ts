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

/** Cue points for the animated quote wallpaper, in seconds from the start. */
export const QUOTE_WALLPAPER_TIMING = {
  lineOneAt: 0.4,
  detailOneAt: 1.1,
  connectorAt: 1.8,
  lineTwoAt: 2.5,
  detailTwoAt: 3.2,
  /** Each text element takes this long to settle. */
  textRevealSeconds: 1.4,
  sparkAt: 4.1,
  /** The crack starts just after the spark and spreads for this long. */
  crackSeconds: 3,
  /** Breathing period of the light once everything has settled. */
  breathSeconds: 3.2,
  durationSeconds: 10,
} as const;

/**
 * Cue points for the 3 s Live Photo cut, in seconds. The text is already in
 * place; only the spark and crack move, and the clip ends on the finished
 * still so the Live Photo can rest on its last frame.
 */
export const LIVE_PHOTO_TIMING = {
  sparkAt: 0.15,
  crackAt: 0.3,
  crackSeconds: 2.2,
  durationSeconds: 3,
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
