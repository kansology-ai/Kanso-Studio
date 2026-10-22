import { useCurrentFrame, useVideoConfig } from "remotion";
import { BEAT_SECONDS, SONG, sceneStart, type SceneKey } from "../timing";

/**
 * Song-clock helpers. Scenes only see their local frame, so these add the
 * scene's start time back to get the reel time the beat grid is based on.
 */

/** 1 on the beat, decaying to ~0 before the next one. */
export const beatPulse = (reelSeconds: number, sharpness = 6): number => {
  const sinceFirst = reelSeconds - SONG.firstBeatSeconds;
  if (sinceFirst < 0) return 0;
  const phase = (sinceFirst % BEAT_SECONDS) / BEAT_SECONDS;
  return Math.exp(-phase * sharpness);
};

/** Index of the beat at `reelSeconds` (0 = first beat, -1 before it). */
export const beatIndex = (reelSeconds: number): number =>
  Math.floor((reelSeconds - SONG.firstBeatSeconds) / BEAT_SECONDS);

/** 0 → 1 progress through the current beat. */
export const beatPhase = (reelSeconds: number): number => {
  const sinceFirst = reelSeconds - SONG.firstBeatSeconds;
  return (
    (((sinceFirst % BEAT_SECONDS) + BEAT_SECONDS) % BEAT_SECONDS) / BEAT_SECONDS
  );
};

/**
 * Clock for a scene: local seconds (0 at scene start), reel seconds, and
 * the beat pulse. Works the same in the reel and in the scene's own preview.
 */
export const useSceneClock = (scene: SceneKey) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const reel = t + sceneStart(scene);
  return {
    frame,
    fps,
    /** Seconds since the scene started. */
    t,
    /** Seconds since the reel started (what the cue sheet uses). */
    reel,
    pulse: beatPulse(reel),
    beat: beatIndex(reel),
    phase: beatPhase(reel),
  };
};

/** Seconds since `cue` (negative before it). */
export const since = (t: number, cue: number): number => t - cue;

/** Index of the last cue that has started at time `t` (-1 if none). */
export const activeCue = (t: number, cues: readonly number[]): number => {
  let idx = -1;
  for (let i = 0; i < cues.length; i++) {
    if (t >= cues[i]) idx = i;
  }
  return idx;
};
