/**
 * Cue sheet for the TrainingSeason reel. All times are seconds from the
 * start of the video. They were measured from the 30 s reference cut of the
 * song section (122.95 BPM), so every word lands where the vocal does once
 * the song is lined up with frame 0 (see `audioStartSeconds`).
 *
 * Scenes receive their own start time so beat helpers stay in sync whether
 * a scene plays inside the full reel or alone in its connected composition.
 */

export const SONG = {
  bpm: 122.95,
  /** First downbeat-grid beat after the video starts. */
  firstBeatSeconds: 0.145,
} as const;

export const BEAT_SECONDS = 60 / SONG.bpm;

/** Time of beat `n` (0-based) from the video start. */
export const beatAt = (n: number): number =>
  SONG.firstBeatSeconds + n * BEAT_SECONDS;

export type SceneKey =
  | "jersey"
  | "vault"
  | "ribbon"
  | "tickets"
  | "chalk"
  | "megaphone"
  | "scoreboard"
  | "balls";

export const TRAINING_SEASON_TIMING = {
  durationSeconds: 30,
  /** Hard cuts between scenes; each scene animates its own whip in/out. */
  scenes: {
    jersey: { from: 0, to: 1.8 },
    vault: { from: 1.8, to: 4.55 },
    ribbon: { from: 4.55, to: 16.55 },
    tickets: { from: 16.55, to: 18.45 },
    chalk: { from: 18.45, to: 20.2 },
    megaphone: { from: 20.2, to: 22.0 },
    scoreboard: { from: 22.0, to: 24.6 },
    balls: { from: 24.6, to: 30 },
  },
  /**
   * When each lyric slot hits, in seconds from the video start. Slot i of a
   * scene's lyric line (split on " / ") appears at cues[scene][i].
   */
  cues: {
    jersey: [0.0, 0.55, 0.9],
    vault: [1.85],
    /** Four lines on the ribbon boards. */
    ribbonA: [8.65, 9.25, 9.65, 10.2],
    ribbonB: [10.65, 11.3, 11.55, 11.85, 12.1],
    ribbonC: [12.6, 13.1],
    ribbonD: [14.6, 15.1, 15.6, 16.3],
    /** Last slot is split into syllables on "-", landing 17.65 → 18.0. */
    tickets: [16.75, 17.45, 17.65],
    ticketSyllables: [17.65, 17.78, 17.9, 18.0],
    chalk: [18.65, 19.0, 19.3, 19.7, 19.95],
    megaphone: [20.2, 21.65],
    scoreboard: [22.2, 22.5, 23.2, 23.3],
    balls: [24.6],
  },
  /** Non-lyric hits worth animating to. */
  accents: {
    /** Pole-vault bar steps up on these beats. */
    vaultSteps: [2.1, 2.585, 3.073, 3.561, 4.049],
    /** Ribbon boards power on one by one before the vocal returns. */
    ribbonBoot: [4.537, 5.025, 5.513, 6.001, 6.489, 6.977, 7.465, 7.953],
    /** Camera pulls back to show the whole ribbon stack. */
    ribbonReveal: [13.6, 14.4],
    /** Typing-dots burst before the last megaphone word. */
    megaphoneDots: 21.25,
    /** Scoreboard stat line types on. */
    scoreboardStats: 23.8,
    /** The drop: scoreboard explodes into balls. */
    drop: 24.55,
    /** Final burst of new balls. */
    finalBurst: 29.5,
  },
} as const;

/** Start time (s) of a scene in the full reel. */
export const sceneStart = (key: SceneKey): number =>
  TRAINING_SEASON_TIMING.scenes[key].from;

/** Length (s) of a scene. */
export const sceneLength = (key: SceneKey): number =>
  TRAINING_SEASON_TIMING.scenes[key].to -
  TRAINING_SEASON_TIMING.scenes[key].from;

/**
 * Convert absolute cue times to seconds relative to a scene's start.
 * Rounded to the microsecond so float noise (23.3 - 22 = 1.3000000000000007)
 * never pushes a `t >= cue` hit one frame late.
 */
export const localCues = (scene: SceneKey, cues: readonly number[]): number[] =>
  cues.map((t) => Math.round((t - sceneStart(scene)) * 1e6) / 1e6);

/** Split a lyric line into slots: "READY / SET / GO" → ["READY","SET","GO"]. */
export const splitSlots = (line: string): string[] =>
  line
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * Sequence timing for a scene in the full reel. Both ends are rounded to
 * frames from the cue sheet, so consecutive scenes never gap or overlap.
 */
export const sceneFrames = (
  key: SceneKey,
  fps: number,
): { from: number; durationInFrames: number } => {
  const from = Math.round(TRAINING_SEASON_TIMING.scenes[key].from * fps);
  const to = Math.round(TRAINING_SEASON_TIMING.scenes[key].to * fps);
  return { from, durationInFrames: Math.max(1, to - from) };
};
