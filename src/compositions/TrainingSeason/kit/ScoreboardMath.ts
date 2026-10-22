import type { Camera, Vec3 } from "../../../lib/camera3d";

/**
 * Small vector / colour helpers shared by the Megaphone and Scoreboard
 * scenes (placing things relative to a camera, punches, flat shading).
 */

const DEG = Math.PI / 180;

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
};

// Same rotations as CSS rotateX / rotateY / rotateZ.
export const rotX = (v: Vec3, deg: number): Vec3 => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return v3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
};
export const rotY = (v: Vec3, deg: number): Vec3 => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return v3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
};
export const rotZ = (v: Vec3, deg: number): Vec3 => {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return v3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
};

/** Node3D orientation (ry, then rx, then rz) applied to a local vector. */
export const orient = (v: Vec3, rx: number, ry: number, rz = 0): Vec3 =>
  rotY(rotX(rotZ(v, rz), rx), ry);

/**
 * World point for a camera-space offset: x right, y down, and `-z` in
 * front of the lens (so `v3(0, 0, -d)` is `d` straight ahead).
 */
export const fromView = (cam: Camera, v: Vec3): Vec3 =>
  add(v3(cam.x, cam.y, cam.z), orient(v, cam.pitch, cam.yaw, cam.roll));

/** Unit vector the camera looks along. */
export const forwardOf = (cam: Camera): Vec3 =>
  orient(v3(0, 0, -1), cam.pitch, cam.yaw, cam.roll);

/** Move a camera along its own axes (x right, y down, z = forward). */
export const dollyCamera = (
  cam: Camera,
  right: number,
  down: number,
  forward: number,
): Camera => {
  const p = fromView(cam, v3(right, down, -forward));
  return { ...cam, x: p.x, y: p.y, z: p.z };
};

/** 0 before `t0`, 1 at `t0`, decaying with time constant `tau` (s). */
export const kick = (t: number, t0: number, tau = 0.08): number =>
  t >= t0 ? Math.exp(-(t - t0) / tau) : 0;

/** Blend two 6-digit hex colours. */
export const mixColor = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number) =>
    Math.round(
      ((pa >> shift) & 255) +
        (((pb >> shift) & 255) - ((pa >> shift) & 255)) * k,
    );
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
};

/** Pick along a list of hex stops with t in [0, 1]. */
export const ramp = (stops: readonly string[], t: number): string => {
  const k = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return mixColor(stops[i], stops[i + 1], k - i);
};

/**
 * Round away float noise from `cue - sceneStart` (23.3 - 22 is
 * 1.3000000000000007, which would push a hit one frame late).
 */
export const snapTime = (x: number): number => Math.round(x * 1e6) / 1e6;
