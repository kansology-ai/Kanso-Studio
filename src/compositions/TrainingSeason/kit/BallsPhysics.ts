import { Easing, interpolate, random } from "remotion";
import { orbitCamera, type Camera, type Vec3 } from "../../../lib/camera3d";
import {
  BEAT_SECONDS,
  beatAt,
  sceneLength,
  sceneStart,
  TRAINING_SEASON_TIMING,
} from "../timing";

/**
 * Balls finale (scene 8): deterministic, analytic physics.
 *
 * Every ball gets launch parameters from `random(seed)` and a bounce
 * schedule built once (not per frame): its first landing is put on a beat,
 * and each bounce period is a whole or half number of beats, so the balls
 * hit the floor in time with the song. Any frame is then evaluated in closed
 * form: find the arc the time falls in and solve the parabola.
 *
 * World units are design px (+y down, the floor is y = 0). Times are scene
 * seconds (0 = the drop at 24.6 s).
 */

const START = sceneStart("balls");
export const SCENE_SECONDS = sceneLength("balls");
export const beatLocal = (n: number): number => beatAt(n) - START;
export const FINAL_BURST = TRAINING_SEASON_TIMING.accents.finalBurst - START;

/** Gravity in design px / s². A one-beat hop peaks at ~95 px. */
export const GRAVITY = 3200;

/** Where the scoreboard was when it exploded. */
export const BLAST: Vec3 = { x: 0, y: -520, z: 0 };

// ---------------------------------------------------------------------------
// 3x3 rotation helpers (row-major, column vectors, same as camera3d.ts)
// ---------------------------------------------------------------------------

export type M3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const DEG = Math.PI / 180;

export const m3mul = (a: M3, b: M3): M3 => [
  a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
  a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
  a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
  a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
  a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
  a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
  a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
  a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
  a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

export const m3apply = (m: M3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

const rx = (a: number): M3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const ry = (a: number): M3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rz = (a: number): M3 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/** Rodrigues rotation about a unit axis by `angle` radians. */
export const axisAngle = (axis: Vec3, angle: number): M3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const { x, y, z } = axis;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
};

/** World → view rotation of a camera (no translation), as in toView(). */
export const cameraMatrix = (cam: Camera): M3 =>
  m3mul(rz(-cam.roll * DEG), m3mul(rx(-cam.pitch * DEG), ry(-cam.yaw * DEG)));

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

// ---------------------------------------------------------------------------
// Camera (design units, focal = 1; the scene scales focal and adds punches)
// ---------------------------------------------------------------------------

const AZ0 = -30;
/** Orbit speed (deg/s) at the drop; it accelerates toward the finale. */
const AZ_SPEED = 13;
const AZ_ACCEL = 1.3;

/** Exit whip over the last ~0.22 s (degrees of extra orbit). */
export const exitWhip = (t: number): number =>
  interpolate(t, [SCENE_SECONDS - 0.24, SCENE_SECONDS], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

export const cameraAzimuth = (t: number): number =>
  AZ0 + AZ_SPEED * t + AZ_ACCEL * t * t + 34 * exitWhip(t);

export const baseCamera = (t: number): Camera => {
  const ease = Easing.bezier(0.65, 0, 0.35, 1);
  const k = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const elevation = interpolate(t, [0, SCENE_SECONDS], [7, 21], {
    ...k,
    easing: ease,
  });
  const distance = interpolate(t, [0, SCENE_SECONDS], [1600, 1150], {
    ...k,
    easing: ease,
  });
  const ty = interpolate(t, [0, 1.8, SCENE_SECONDS], [-440, -250, -190], {
    ...k,
    easing: ease,
  });
  return orbitCamera({
    target: { x: 0, y: ty, z: 0 },
    distance,
    azimuth: cameraAzimuth(t),
    elevation,
    focal: 1,
  });
};

/** Horizontal unit vector from the pile toward the camera at time t. */
export const towardCamera = (t: number): { x: number; z: number } => {
  const a = cameraAzimuth(t) * DEG;
  return { x: Math.sin(a), z: Math.cos(a) };
};

// ---------------------------------------------------------------------------
// Balls
// ---------------------------------------------------------------------------

export type BallKind =
  | "basket"
  | "soccer"
  | "tennis"
  | "volley"
  | "base"
  | "football";

const RADIUS: Record<BallKind, number> = {
  basket: 92,
  soccer: 86,
  volley: 84,
  tennis: 50,
  base: 52,
  football: 58, // short radius; the long axis is 1.65x
};

export type BallSpec = {
  readonly id: number;
  readonly kind: BallKind;
  readonly r: number;
  readonly hero: boolean;
  readonly t0: number;
  readonly p0: Vec3;
  /** Horizontal direction of travel (unit). */
  readonly dir: { readonly x: number; readonly z: number };
  /** Horizontal speed of the first flight. */
  readonly vh: number;
  /** Upward launch speed (positive = up). */
  readonly vy: number;
  /** Landing times; the first is on a beat, the others follow whole beats. */
  readonly land: readonly number[];
  /** Duration of the arc after each landing (shorter than land when it rests). */
  readonly per: readonly number[];
  /** Horizontal speed of each arc. */
  readonly hs: readonly number[];
  /** Distance travelled at each landing. */
  readonly s: readonly number[];
  readonly rollV: number;
  /** Extra tumble (rad/s) while in the first flight. */
  readonly tumble: number;
  readonly base: M3;
  /** Final-burst balls fly straight at the camera (no bounce schedule). */
  readonly final: boolean;
  readonly v3: Vec3;
};

const ROLL_DECAY = 1.6;
/** The pile's hop on the final burst lasts until the next beat. */
const KICK_PERIOD = beatLocal(61) - FINAL_BURST;

const pick = <T>(seed: string, items: readonly T[]): T =>
  items[Math.min(items.length - 1, Math.floor(random(seed) * items.length))];

const randomBase = (seed: string): M3 =>
  m3mul(
    rz(random(`${seed}-a`) * Math.PI * 2),
    m3mul(
      rx(random(`${seed}-b`) * Math.PI * 2),
      ry(random(`${seed}-c`) * Math.PI * 2),
    ),
  );

/** Round a bounce period (in beats) down the ladder 3 → 2 → 1 → ½. */
const nextPeriod = (beats: number, e: number): number => {
  const raw = beats * e;
  if (raw >= 3.5) return 4;
  if (raw >= 2.5) return 3;
  if (raw >= 1.5) return 2;
  if (raw >= 0.75) return 1;
  if (raw >= 0.4) return 0.5;
  return 0;
};

const KINDS: readonly BallKind[] = [
  "basket",
  "soccer",
  "tennis",
  "volley",
  "football",
  "base",
  "basket",
  "soccer",
  "volley",
  "tennis",
];

const MAIN_COUNT = 52;
const FINAL_COUNT = 18;

const buildMainBall = (i: number): BallSpec => {
  const seed = `ball-${i}`;
  const hero = i < 5;
  const kind: BallKind = hero
    ? (["basket", "soccer", "volley", "basket", "football"] as const)[i]
    : KINDS[i % KINDS.length];
  const r =
    RADIUS[kind] *
    (hero
      ? 1.3 + random(`${seed}-hr`) * 0.2
      : 0.85 + random(`${seed}-r`) * 0.35);

  // Burst out of the scoreboard rectangle, staggered over ~0.3 s.
  const t0 = hero ? 0.05 + i * 0.05 : -0.06 + random(`${seed}-t0`) * 0.3;
  const p0: Vec3 = {
    x: BLAST.x + (random(`${seed}-ox`) - 0.5) * 520,
    y: BLAST.y + (random(`${seed}-oy`) - 0.5) * 260,
    z: BLAST.z + (random(`${seed}-oz`) - 0.5) * 160,
  };

  // First landing on a beat: 51 is right after the drop, 54 is a high lob.
  const n1 = hero
    ? [53, 54, 53, 55, 54][i]
    : pick(`${seed}-n1`, [51, 52, 52, 53, 53, 54, 55, 56]);
  const T1 = beatLocal(n1);
  const T = T1 - t0;

  // Where it lands: heroes come down near the camera's path.
  let lx: number;
  let lz: number;
  if (hero) {
    const az = (cameraAzimuth(T1 + 0.6) + [-16, 13, -6, 20, -22][i]) * DEG;
    const rho = [560, 620, 470, 660, 520][i];
    lx = Math.sin(az) * rho;
    lz = Math.cos(az) * rho;
  } else {
    const towardCam = random(`${seed}-cam`) < 0.4;
    const az = towardCam
      ? (cameraAzimuth(T1) + (random(`${seed}-az`) - 0.5) * 100) * DEG
      : random(`${seed}-az`) * Math.PI * 2;
    const rho = 140 + Math.pow(random(`${seed}-rho`), 1.25) * 950;
    lx = Math.sin(az) * rho;
    lz = Math.cos(az) * rho;
  }
  const dx = lx - p0.x;
  const dz = lz - p0.z;
  const dist = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / dist, z: dz / dist };
  const vh = dist / T;
  const h0 = -p0.y;
  const vy = (r - h0 + 0.5 * GRAVITY * T * T) / T;

  // Bounce schedule: periods in beats, stepping down a ladder.
  const dribbler =
    !hero &&
    (kind === "basket" || kind === "tennis") &&
    random(`${seed}-dr`) < 0.6;
  let beats = hero
    ? pick(`${seed}-p1`, [2, 3])
    : pick(`${seed}-p1`, [1, 2, 2, 3, 3, 4]);
  const e = 0.5 + random(`${seed}-e`) * 0.2;
  const land: number[] = [T1];
  const per: number[] = [];
  const hs: number[] = [];
  const s: number[] = [dist];
  let speed = vh * (hero ? 0.1 : 0.3);
  while (land[land.length - 1] < SCENE_SECONDS + 0.6 && beats > 0) {
    const p = beats * BEAT_SECONDS;
    per.push(p);
    hs.push(speed);
    land.push(land[land.length - 1] + p);
    s.push(s[s.length - 1] + speed * p);
    speed *= 0.55;
    beats = dribbler && beats <= 1 ? 1 : nextPeriod(beats, e);
  }

  return {
    id: i,
    kind,
    r,
    hero,
    t0,
    p0,
    dir,
    vh,
    vy,
    land,
    per,
    hs,
    s,
    rollV: speed * 0.9,
    tumble: (random(`${seed}-tu`) - 0.5) * (hero ? 6 : 14),
    base: randomBase(seed),
    final: false,
    v3: { x: 0, y: 0, z: 0 },
  };
};

const buildFinalBall = (j: number): BallSpec => {
  const seed = `final-${j}`;
  const kind = KINDS[(j * 3 + 1) % KINDS.length];
  const r = RADIUS[kind] * (1.05 + random(`${seed}-r`) * 0.4);
  // The first ones leave a hair early so the burst is visible on its frame.
  const t0 = FINAL_BURST - 0.03 + j * 0.01 + random(`${seed}-t0`) * 0.025;
  const p0: Vec3 = {
    x: (random(`${seed}-x`) - 0.5) * 240,
    y: -r - 40,
    z: (random(`${seed}-z`) - 0.5) * 240,
  };
  const atCamera = j % 4 !== 3;
  let v3: Vec3;
  if (atCamera) {
    // Aim just around the lens at the moment it arrives.
    const T = 0.3 + random(`${seed}-T`) * 0.22;
    const cam = baseCamera(t0 + T);
    const toCam = normalize({
      x: cam.x - p0.x,
      y: cam.y - p0.y,
      z: cam.z - p0.z,
    });
    const right = normalize({ x: toCam.z, y: 0, z: -toCam.x });
    const ang = random(`${seed}-ang`) * Math.PI * 2;
    const off = 170 + random(`${seed}-off`) * 260;
    const target: Vec3 = {
      x: cam.x - toCam.x * 120 + right.x * Math.cos(ang) * off,
      y: cam.y - toCam.y * 120 + Math.sin(ang) * off * 0.8,
      z: cam.z - toCam.z * 120 + right.z * Math.cos(ang) * off,
    };
    v3 = {
      x: (target.x - p0.x) / T,
      y: (target.y - p0.y - 0.5 * GRAVITY * T * T) / T,
      z: (target.z - p0.z) / T,
    };
  } else {
    // Fountain: straight up and out.
    const a = random(`${seed}-a`) * Math.PI * 2;
    const sp = 300 + random(`${seed}-sp`) * 500;
    v3 = {
      x: Math.sin(a) * sp,
      y: -(1900 + random(`${seed}-up`) * 700),
      z: Math.cos(a) * sp,
    };
  }
  const hl = Math.hypot(v3.x, v3.z) || 1;
  return {
    id: MAIN_COUNT + j,
    kind,
    r,
    hero: false,
    t0,
    p0,
    dir: { x: v3.x / hl, z: v3.z / hl },
    vh: hl,
    vy: -v3.y,
    land: [Infinity],
    per: [],
    hs: [],
    s: [0],
    rollV: 0,
    tumble: (random(`${seed}-tu`) - 0.5) * 18,
    base: randomBase(seed),
    final: true,
    v3,
  };
};

export const BALLS: readonly BallSpec[] = [
  ...new Array(MAIN_COUNT).fill(0).map((_, i) => buildMainBall(i)),
  ...new Array(FINAL_COUNT).fill(0).map((_, j) => buildFinalBall(j)),
];

export type BallState = {
  readonly pos: Vec3;
  /** Rotation from ball-local to world. */
  readonly rot: M3;
  /** Height of the ball's bottom above the floor. */
  readonly height: number;
  /** 0..1 squash at floor contact. */
  readonly squash: number;
};

/** Closed-form state of a ball at scene time t (null before launch). */
export const ballAt = (b: BallSpec, t: number): BallState | null => {
  if (t < b.t0) return null;
  let s: number;
  let h: number;
  let squash = 0;

  if (b.final) {
    const tau = t - b.t0;
    const pos = {
      x: b.p0.x + b.v3.x * tau,
      y: Math.min(-b.r, b.p0.y + b.v3.y * tau + 0.5 * GRAVITY * tau * tau),
      z: b.p0.z + b.v3.z * tau,
    };
    const axis = normalize({ x: -b.dir.z, y: 0, z: b.dir.x });
    const angle = (b.vh * tau) / b.r + b.tumble * tau;
    return {
      pos,
      rot: m3mul(axisAngle(axis, angle), b.base),
      height: -pos.y - b.r,
      squash: 0,
    };
  }

  const T1 = b.land[0];
  if (t < T1) {
    const tau = t - b.t0;
    s = b.vh * tau;
    h = -b.p0.y + b.vy * tau - 0.5 * GRAVITY * tau * tau;
  } else {
    let k = 0;
    for (let i = 0; i < b.land.length; i++) {
      if (t >= b.land[i]) k = i;
    }
    const tau = t - b.land[k];
    if (k < b.per.length) {
      const p = b.per[k];
      h = b.r + 0.5 * GRAVITY * p * tau - 0.5 * GRAVITY * tau * tau;
      s = b.s[k] + b.hs[k] * tau;
    } else {
      h = b.r;
      s = b.s[k] + (b.rollV / ROLL_DECAY) * (1 - Math.exp(-ROLL_DECAY * tau));
    }
    // Squash on contact, stronger for big drops.
    for (let i = 0; i < b.land.length; i++) {
      const dt = Math.abs(t - b.land[i]);
      if (dt < 0.08) {
        const drop = i === 0 ? 1 : Math.min(1, b.per[i - 1] / BEAT_SECONDS / 2);
        squash = Math.max(squash, 0.22 * drop * Math.exp(-dt / 0.03));
      }
    }
  }

  // The final burst kicks the whole pile into one hop that lands on beat 61.
  const kick = t - FINAL_BURST;
  if (kick > 0 && kick < KICK_PERIOD) {
    h += 0.5 * GRAVITY * KICK_PERIOD * kick - 0.5 * GRAVITY * kick * kick;
  }
  if (Math.abs(t - FINAL_BURST - KICK_PERIOD) < 0.08) {
    squash = Math.max(
      squash,
      0.14 * Math.exp(-Math.abs(t - FINAL_BURST - KICK_PERIOD) / 0.03),
    );
  }

  const pos: Vec3 = {
    x: b.p0.x + b.dir.x * s,
    y: -h,
    z: b.p0.z + b.dir.z * s,
  };
  // Rolling axis: up × direction (world up is -y).
  const axis = { x: -b.dir.z, y: 0, z: b.dir.x };
  const angle = s / b.r + b.tumble * (Math.min(t, T1) - b.t0);
  return {
    pos,
    rot: m3mul(axisAngle(axis, angle), b.base),
    height: h - b.r,
    squash,
  };
};

// ---------------------------------------------------------------------------
// Scoreboard shards and sparks (linear drag, closed form)
// ---------------------------------------------------------------------------

const DRAG = 2.1;
const SHARD_G = GRAVITY * 0.75;
const SHARD_T0 = -0.07;

export type ShardSpec = {
  readonly id: number;
  readonly p0: Vec3;
  readonly v: Vec3;
  readonly axis: Vec3;
  readonly spin: number;
  readonly base: M3;
  /** Polygon corners in the shard's plane (local x/y). */
  readonly corners: readonly { x: number; y: number }[];
  readonly color: "navy" | "volt" | "flood" | "navyMid" | "signal";
  readonly landAt: number;
  readonly yaw: number;
};

const dragPos = (p0: Vec3, v: Vec3, g: number, tau: number): Vec3 => {
  const f = (1 - Math.exp(-DRAG * tau)) / DRAG;
  return {
    x: p0.x + v.x * f,
    y: p0.y + (v.y - g / DRAG) * f + (g / DRAG) * tau,
    z: p0.z + v.z * f,
  };
};

const SHARD_COUNT = 46;

const buildShard = (i: number): ShardSpec => {
  const seed = `shard-${i}`;
  const cam = towardCamera(0);
  const right = { x: cam.z, z: -cam.x };
  const u = (random(`${seed}-u`) - 0.5) * 1000;
  const w = (random(`${seed}-w`) - 0.5) * 460;
  const p0: Vec3 = {
    x: BLAST.x + right.x * u + cam.x * 40,
    y: BLAST.y + w,
    z: BLAST.z + right.z * u + cam.z * 40,
  };
  const out = normalize({
    x: right.x * u + cam.x * (120 + random(`${seed}-c`) * 900),
    y: w - 260,
    z: right.z * u + cam.z * (120 + random(`${seed}-c`) * 900),
  });
  const speed = 1500 + random(`${seed}-s`) * 2600;
  const v = { x: out.x * speed, y: out.y * speed, z: out.z * speed };
  const size = 34 + Math.pow(random(`${seed}-size`), 1.8) * 130;
  const tri = random(`${seed}-tri`) < 0.45;
  const jit = (k: string) => (random(`${seed}-${k}`) - 0.5) * size * 0.35;
  const corners = tri
    ? [
        { x: -size * 0.6 + jit("a"), y: size * 0.4 + jit("b") },
        { x: size * 0.55 + jit("c"), y: size * 0.45 + jit("d") },
        { x: jit("e"), y: -size * 0.55 + jit("f") },
      ]
    : [
        { x: -size * 0.6 + jit("a"), y: -size * 0.35 + jit("b") },
        { x: size * 0.6 + jit("c"), y: -size * 0.4 + jit("d") },
        { x: size * 0.55 + jit("e"), y: size * 0.38 + jit("f") },
        { x: -size * 0.5 + jit("g"), y: size * 0.36 + jit("h") },
      ];
  const cr = random(`${seed}-col`);
  const color: ShardSpec["color"] =
    cr < 0.38
      ? "navy"
      : cr < 0.6
        ? "volt"
        : cr < 0.84
          ? "flood"
          : cr < 0.94
            ? "navyMid"
            : "signal";
  // Landing time: bisection on the closed-form height (done once).
  let lo = 0;
  let hi = 8;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (dragPos(p0, v, SHARD_G, mid).y < 0) lo = mid;
    else hi = mid;
  }
  return {
    id: i,
    p0,
    v,
    axis: normalize({
      x: random(`${seed}-ax`) - 0.5,
      y: random(`${seed}-ay`) - 0.5,
      z: random(`${seed}-az`) - 0.5,
    }),
    spin: 6 + random(`${seed}-spin`) * 12,
    base: randomBase(seed),
    corners,
    color,
    landAt: SHARD_T0 + hi,
    yaw: random(`${seed}-yaw`) * Math.PI * 2,
  };
};

export const SHARDS: readonly ShardSpec[] = new Array(SHARD_COUNT)
  .fill(0)
  .map((_, i) => buildShard(i));

const shardCornersAt = (sh: ShardSpec, t: number): Vec3[] => {
  const tau = Math.max(0, t - SHARD_T0);
  const pos = dragPos(sh.p0, sh.v, SHARD_G, tau);
  const rot = m3mul(axisAngle(sh.axis, sh.spin * tau), sh.base);
  return sh.corners.map((c) => {
    const d = m3apply(rot, { x: c.x, y: c.y, z: 0 });
    return {
      x: pos.x + d.x,
      y: Math.min(-1, pos.y + d.y),
      z: pos.z + d.z,
    };
  });
};

/**
 * World corners of a shard at time t. After it lands it settles flat on
 * the floor over 0.1 s and slides to a stop.
 */
export const shardAt = (
  sh: ShardSpec,
  t: number,
): { corners: Vec3[]; normal: Vec3; landed: number } => {
  if (t < sh.landAt) {
    const corners = shardCornersAt(sh, t);
    const rot = m3mul(
      axisAngle(sh.axis, sh.spin * Math.max(0, t - SHARD_T0)),
      sh.base,
    );
    return { corners, normal: m3apply(rot, { x: 0, y: 0, z: 1 }), landed: 0 };
  }
  const tauL = sh.landAt - SHARD_T0;
  const at = dragPos(sh.p0, sh.v, SHARD_G, tauL);
  const e = Math.exp(-DRAG * tauL);
  const vx = sh.v.x * e;
  const vz = sh.v.z * e;
  const since = t - sh.landAt;
  const slide = (1 - Math.exp(-4 * since)) / 4;
  const cx = at.x + vx * 0.35 * slide;
  const cz = at.z + vz * 0.35 * slide;
  const cy = Math.cos(sh.yaw);
  const sy = Math.sin(sh.yaw);
  const flat = sh.corners.map((c) => ({
    x: cx + c.x * cy - c.y * sy,
    y: -1,
    z: cz + c.x * sy + c.y * cy,
  }));
  const settle = Math.min(1, since / 0.1);
  const from = shardCornersAt(sh, sh.landAt);
  const corners = flat.map((f, k) => ({
    x: from[k].x + (f.x - from[k].x) * settle,
    y: from[k].y + (f.y - from[k].y) * settle,
    z: from[k].z + (f.z - from[k].z) * settle,
  }));
  return { corners, normal: { x: 0, y: -1, z: 0 }, landed: settle };
};

const SPARK_COUNT = 34;

export type SparkSpec = {
  readonly id: number;
  readonly p0: Vec3;
  readonly v: Vec3;
  readonly color: "volt" | "flood" | "signal";
  readonly life: number;
};

export const SPARKS: readonly SparkSpec[] = new Array(SPARK_COUNT)
  .fill(0)
  .map((_, i) => {
    const seed = `spark-${i}`;
    const a = random(`${seed}-a`) * Math.PI * 2;
    const el = (random(`${seed}-e`) - 0.35) * Math.PI * 0.8;
    const sp = 2600 + random(`${seed}-s`) * 3000;
    const cr = random(`${seed}-c`);
    return {
      id: i,
      p0: BLAST,
      v: {
        x: Math.cos(el) * Math.sin(a) * sp,
        y: -Math.sin(el) * sp,
        z: Math.cos(el) * Math.cos(a) * sp,
      },
      color: cr < 0.5 ? "volt" : cr < 0.85 ? "flood" : "signal",
      life: 0.45 + random(`${seed}-l`) * 0.5,
    };
  });

/**
 * Head and tail of a spark streak at time t (tail lags 40 ms). `at` and
 * `origin` re-fire the same sparks for the final burst.
 */
export const sparkAt = (
  sp: SparkSpec,
  t: number,
  at = SHARD_T0,
  origin: Vec3 = sp.p0,
): { head: Vec3; tail: Vec3; alpha: number } | null => {
  const tau = t - at;
  if (tau < 0 || tau > sp.life) return null;
  const head = dragPos(origin, sp.v, SHARD_G * 0.4, tau);
  const tail = dragPos(origin, sp.v, SHARD_G * 0.4, Math.max(0, tau - 0.04));
  if (head.y > 0) return null;
  return { head, tail, alpha: 1 - tau / sp.life };
};
