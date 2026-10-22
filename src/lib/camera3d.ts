import { random } from "remotion";

/**
 * A tiny pinhole-camera model that matches CSS 3D transforms exactly, so
 * DOM planes (rendered by <Stage3D>) and JS-projected points (balls,
 * particles, SVG lines) line up in the same world.
 *
 * World axes follow CSS: +x right, +y DOWN, +z toward the viewer.
 * The camera looks along -z when yaw = pitch = roll = 0.
 * Angles are in degrees. Positive pitch looks down, positive yaw turns left.
 * Distances are in design pixels: wrap them in px() before passing them in.
 */

export type Vec3 = { x: number; y: number; z: number };

export type Camera = {
  /** Camera position in world space. */
  x: number;
  y: number;
  z: number;
  /** Rotation about the world Y axis (degrees). */
  yaw: number;
  /** Rotation about the camera X axis (degrees). Positive looks down. */
  pitch: number;
  /** Rotation about the view axis (degrees). */
  roll: number;
  /**
   * Focal length in px (the CSS `perspective` value). Smaller = wider lens.
   * At 1080x1920, ~900 is a punchy wide angle, ~1600 is a natural lens.
   */
  focal: number;
};

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

const DEG = Math.PI / 180;

type Mat3 = [
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

// Same matrices as CSS rotateX/rotateY/rotateZ (row-major, column vectors).
const rotX = (deg: number): Mat3 => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
const rotY = (deg: number): Mat3 => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
const rotZ = (deg: number): Mat3 => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
const apply = (m: Mat3, v: Vec3): Vec3 => ({
  x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
  y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
  z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
});

/** World point → view space (eye at origin, looking down -z). */
export const toView = (p: Vec3, cam: Camera): Vec3 => {
  let v = { x: p.x - cam.x, y: p.y - cam.y, z: p.z - cam.z };
  v = apply(rotY(-cam.yaw), v);
  v = apply(rotX(-cam.pitch), v);
  v = apply(rotZ(-cam.roll), v);
  return v;
};

export type Projected = {
  /** Screen position relative to the frame centre, in px. */
  x: number;
  y: number;
  /** How much a 1px object at this point is magnified (focal / distance). */
  scale: number;
  /** Distance in front of the camera. Sort far-to-near by descending depth. */
  depth: number;
  /** False when the point is behind (or too close to) the camera. */
  visible: boolean;
};

/** Project a world point to the screen, identical to what <Stage3D> draws. */
export const project = (p: Vec3, cam: Camera, near = 10): Projected => {
  const v = toView(p, cam);
  const depth = -v.z;
  if (depth <= near) {
    return { x: 0, y: 0, scale: 0, depth, visible: false };
  }
  const scale = cam.focal / depth;
  return { x: v.x * scale, y: v.y * scale, scale, depth, visible: true };
};

/**
 * Project a 3D segment, clipped against the near plane. Returns null when
 * the whole segment is behind the camera. Use for SVG floor grids and beams.
 */
export const projectSegment = (
  a: Vec3,
  b: Vec3,
  cam: Camera,
  near = 10,
): [Projected, Projected] | null => {
  const va = toView(a, cam);
  const vb = toView(b, cam);
  const da = -va.z;
  const db = -vb.z;
  if (da <= near && db <= near) {
    return null;
  }
  const clip = (from: Vec3, to: Vec3, dFrom: number, dTo: number): Vec3 => {
    const t = (near - dFrom) / (dTo - dFrom);
    return {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      z: from.z + (to.z - from.z) * t,
    };
  };
  const pa = da <= near ? clip(va, vb, da, db) : va;
  const pb = db <= near ? clip(vb, va, db, da) : vb;
  const toScreen = (v: Vec3): Projected => {
    const depth = Math.max(near, -v.z);
    const scale = cam.focal / depth;
    return { x: v.x * scale, y: v.y * scale, scale, depth, visible: true };
  };
  return [toScreen(pa), toScreen(pb)];
};

/** Yaw/pitch that point a camera at `pos` toward `target` (roll untouched). */
export const lookAt = (
  pos: Vec3,
  target: Vec3,
): { yaw: number; pitch: number } => {
  const d = { x: target.x - pos.x, y: target.y - pos.y, z: target.z - pos.z };
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  return {
    yaw: Math.atan2(-d.x, -d.z) / DEG,
    pitch: Math.asin(d.y / len) / DEG,
  };
};

/**
 * Camera orbiting `target` at `distance`. `azimuth` 0 puts the camera on
 * +z looking toward -z; positive azimuth swings it to the right (+x).
 * `elevation` > 0 raises the camera (world y is down, so it moves to -y).
 */
export const orbitCamera = ({
  target,
  distance,
  azimuth,
  elevation,
  roll = 0,
  focal,
}: {
  target: Vec3;
  distance: number;
  azimuth: number;
  elevation: number;
  roll?: number;
  focal: number;
}): Camera => {
  const az = azimuth * DEG;
  const el = elevation * DEG;
  const pos = {
    x: target.x + distance * Math.cos(el) * Math.sin(az),
    y: target.y - distance * Math.sin(el),
    z: target.z + distance * Math.cos(el) * Math.cos(az),
  };
  const { yaw, pitch } = lookAt(pos, target);
  return { ...pos, yaw, pitch, roll, focal };
};

/** Camera at `pos` aimed at `target`. */
export const aimCamera = (
  pos: Vec3,
  target: Vec3,
  focal: number,
  roll = 0,
): Camera => ({ ...pos, ...lookAt(pos, target), roll, focal });

/** Blend two cameras. Angles take the short way round. */
export const mixCamera = (a: Camera, b: Camera, t: number): Camera => {
  const m = (u: number, v: number) => u + (v - u) * t;
  const ma = (u: number, v: number) => {
    let d = ((v - u + 540) % 360) - 180;
    if (d === -180) d = 180;
    return u + d * t;
  };
  return {
    x: m(a.x, b.x),
    y: m(a.y, b.y),
    z: m(a.z, b.z),
    yaw: ma(a.yaw, b.yaw),
    pitch: m(a.pitch, b.pitch),
    roll: m(a.roll, b.roll),
    focal: m(a.focal, b.focal),
  };
};

/**
 * CSS transform for the world container inside a `perspective: focal`
 * parent. This is the inverse camera transform; <Stage3D> applies it.
 */
export const cameraTransform = (cam: Camera): string =>
  `translateZ(${cam.focal}px) rotateZ(${-cam.roll}deg) rotateX(${-cam.pitch}deg) rotateY(${-cam.yaw}deg) translate3d(${-cam.x}px, ${-cam.y}px, ${-cam.z}px)`;

/**
 * Orientation that makes a node face the camera (a billboard). Spread into
 * <Node3D rx ry rz> or use <Billboard>.
 */
export const facing = (cam: Camera) => ({
  ry: cam.yaw,
  rx: cam.pitch,
  rz: cam.roll,
});

/**
 * Smooth deterministic 1D noise in [-1, 1]. `t` in any unit (seconds work
 * well with frequency ~1-8). Use for handheld camera shake and flicker.
 */
export const noise1 = (seed: string, t: number): number => {
  const i = Math.floor(t);
  const f = t - i;
  const a = random(`${seed}-${i}`) * 2 - 1;
  const b = random(`${seed}-${i + 1}`) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (b - a) * s;
};

/** Handheld shake to add onto a camera. `amount` scales everything. */
export const shake = (
  cam: Camera,
  seconds: number,
  { amount = 1, speed = 3, seed = "shake" } = {},
): Camera => ({
  ...cam,
  yaw: cam.yaw + noise1(`${seed}-yaw`, seconds * speed) * 0.6 * amount,
  pitch:
    cam.pitch + noise1(`${seed}-pitch`, seconds * speed + 7) * 0.5 * amount,
  roll:
    cam.roll + noise1(`${seed}-roll`, seconds * speed * 0.7 + 3) * 0.8 * amount,
});
