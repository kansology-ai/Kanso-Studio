import type React from "react";
import type { Vec3 } from "../../../lib/camera3d";
import { stadium } from "../../../theme";
import { m3apply, type BallKind, type M3 } from "./BallsPhysics";

/**
 * Sports-ball billboards for the Balls finale. Each ball is drawn in unit
 * coordinates (radius 1) inside `translate(x y) scale(r)`, so one shared
 * clip path and one set of shading gradients serve every ball.
 *
 * Seams and panels are real curves on a unit sphere: they are rotated by the
 * ball's orientation (in view space) and projected orthographically, and
 * only the half facing the camera is drawn, so the pattern turns as the
 * ball spins. Shading is screen-space: key light from the upper left, a
 * terminator to the lower right and a cool rim light.
 */

type Pt = Vec3;

const norm = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const add = (a: Pt, b: Pt): Pt => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const scl = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const lerp = (a: Pt, b: Pt, t: number): Pt =>
  add(a, scl(add(b, scl(a, -1)), t));
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Pt, b: Pt): Pt => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

const circle = (f: (a: number) => Pt, n = 40): Pt[] =>
  new Array(n).fill(0).map((_, i) => f((i / n) * Math.PI * 2));

/** Tennis/baseball seam: a+b = 1 keeps the curve on the unit sphere. */
const seamCurve = (a: number, n = 64): Pt[] => {
  const b = 1 - a;
  const c = 2 * Math.sqrt(a * b);
  return circle(
    (t) => ({
      x: a * Math.cos(t) + b * Math.cos(3 * t),
      y: a * Math.sin(t) - b * Math.sin(3 * t),
      z: c * Math.sin(2 * t),
    }),
    n,
  );
};

// --- Basketball: two great circles + two curved side seams -----------------
const BASKET: Pt[][] = [
  circle((a) => ({ x: Math.cos(a), y: Math.sin(a), z: 0 })),
  circle((a) => ({ x: 0, y: Math.cos(a), z: Math.sin(a) })),
  circle(
    (a) => ({ x: 0.64, y: 0.77 * Math.cos(a), z: 0.77 * Math.sin(a) }),
    32,
  ),
  circle(
    (a) => ({ x: -0.64, y: 0.77 * Math.cos(a), z: 0.77 * Math.sin(a) }),
    32,
  ),
];

const TENNIS: Pt[][] = [seamCurve(0.7)];
const BASEBALL: Pt[][] = [seamCurve(0.665), seamCurve(0.735)];

// --- Soccer: truncated icosahedron (12 pentagons + hex-hex seams) ---------
const PHI = (1 + Math.sqrt(5)) / 2;
const ICO: Pt[] = [
  [0, 1, PHI],
  [0, 1, -PHI],
  [0, -1, PHI],
  [0, -1, -PHI],
  [1, PHI, 0],
  [1, -PHI, 0],
  [-1, PHI, 0],
  [-1, -PHI, 0],
  [PHI, 0, 1],
  [PHI, 0, -1],
  [-PHI, 0, 1],
  [-PHI, 0, -1],
].map(([x, y, z]) => ({ x, y, z }));
const ICO_EDGES: [number, number][] = [];
for (let i = 0; i < ICO.length; i++) {
  for (let j = i + 1; j < ICO.length; j++) {
    const d = Math.hypot(
      ICO[i].x - ICO[j].x,
      ICO[i].y - ICO[j].y,
      ICO[i].z - ICO[j].z,
    );
    if (Math.abs(d - 2) < 1e-6) ICO_EDGES.push([i, j]);
  }
}
const SOCCER_PENTAGONS: Pt[][] = ICO.map((v, i) => {
  const vn = norm(v);
  const t1 = norm(
    cross(
      vn,
      Math.abs(vn.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 },
    ),
  );
  const t2 = cross(vn, t1);
  const corners = ICO_EDGES.filter(([a, b]) => a === i || b === i)
    .map(([a, b]) => lerp(v, ICO[a === i ? b : a], 1 / 3))
    .map(norm)
    .sort(
      (p, q) =>
        Math.atan2(dot(p, t2), dot(p, t1)) - Math.atan2(dot(q, t2), dot(q, t1)),
    );
  const out: Pt[] = [];
  corners.forEach((c, k) => {
    const nx = corners[(k + 1) % corners.length];
    out.push(c, norm(lerp(c, nx, 0.5)));
  });
  return out;
});
const SOCCER_SEAMS: Pt[][] = ICO_EDGES.map(([a, b]) => {
  const p = lerp(ICO[a], ICO[b], 1 / 3);
  const q = lerp(ICO[a], ICO[b], 2 / 3);
  return [norm(p), norm(lerp(p, q, 0.5)), norm(q)];
});

// --- Volleyball: 6 cube faces x 3 strips, interlocking ----------------------
const AXES: Pt[] = [
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 },
];
type Strip = { pts: Pt[]; color: "navy" | "volt" };
const VOLLEY_STRIPS: Strip[] = [];
const VOLLEY_SEAMS: Pt[][] = [];
for (let k = 0; k < 3; k++) {
  for (const sign of [1, -1]) {
    const n = scl(AXES[k], sign);
    const U = AXES[(k + 1) % 3];
    const W = AXES[(k + 2) % 3];
    const at = (u: number, w: number) =>
      norm(add(n, add(scl(U, u), scl(W, w))));
    const line = (
      from: [number, number],
      to: [number, number],
      steps: number,
    ) =>
      new Array(steps + 1)
        .fill(0)
        .map((_, i) =>
          at(
            from[0] + ((to[0] - from[0]) * i) / steps,
            from[1] + ((to[1] - from[1]) * i) / steps,
          ),
        );
    const w0 = -1 / 3;
    const w1 = 1 / 3;
    const strip = (wa: number, wb: number): Pt[] => [
      ...line([-1, wa], [1, wa], 6),
      ...line([1, wa], [1, wb], 2).slice(1),
      ...line([1, wb], [-1, wb], 6).slice(1),
      ...line([-1, wb], [-1, wa], 2).slice(1, -1),
    ];
    if (k === 1) {
      VOLLEY_STRIPS.push({ pts: strip(w0, w1), color: "volt" });
    } else if (k === 0) {
      VOLLEY_STRIPS.push({ pts: strip(w0, w1), color: "navy" });
    } else {
      VOLLEY_STRIPS.push({ pts: strip(-1, w0), color: "volt" });
      VOLLEY_STRIPS.push({ pts: strip(w1, 1), color: "navy" });
    }
    for (const w of [-1, w0, w1]) {
      VOLLEY_SEAMS.push(line([-1, w], [1, w], 8));
    }
  }
}

// ---------------------------------------------------------------------------
// Projection of patterns
// ---------------------------------------------------------------------------

const f2 = (n: number) => n.toFixed(3);

/** Front-facing runs of a polyline on the sphere, as an SVG path. */
const curvePath = (pts: readonly Pt[], m: M3, closed: boolean): string => {
  const v = pts.map((p) => m3apply(m, p));
  let d = "";
  let pen = false;
  const n = closed ? v.length : v.length - 1;
  for (let i = 0; i < n; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    if (a.z <= 0 && b.z <= 0) {
      pen = false;
      continue;
    }
    let p = a;
    let q = b;
    if (a.z <= 0) p = lerp(a, b, a.z / (a.z - b.z));
    if (b.z <= 0) q = lerp(a, b, a.z / (a.z - b.z));
    if (!pen || a.z <= 0) {
      d += `M${f2(p.x)} ${f2(p.y)}`;
    }
    d += `L${f2(q.x)} ${f2(q.y)}`;
    pen = b.z > 0;
  }
  return d;
};

/** A filled patch on the sphere; back-facing points are pushed to the limb. */
const patchPath = (pts: readonly Pt[], m: M3): string => {
  const v = pts.map((p) => m3apply(m, p));
  if (Math.max(...v.map((p) => p.z)) < 0.02) return "";
  return (
    v
      .map((p, i) => {
        let { x, y } = p;
        if (p.z < 0) {
          const l = Math.hypot(x, y) || 1;
          x /= l;
          y /= l;
        }
        return `${i === 0 ? "M" : "L"}${f2(x)} ${f2(y)}`;
      })
      .join("") + "Z"
  );
};

// ---------------------------------------------------------------------------
// Shared SVG defs
// ---------------------------------------------------------------------------

export const ballIds = (prefix: string) => ({
  clip: `${prefix}-clip`,
  hl: `${prefix}-hl`,
  sh: `${prefix}-sh`,
  rim: `${prefix}-rim`,
  cs: `${prefix}-cs`,
  glow: `${prefix}-glow`,
});

export const BallDefs: React.FC<{ readonly prefix: string }> = ({ prefix }) => {
  const id = ballIds(prefix);
  return (
    <defs>
      <clipPath id={id.clip} clipPathUnits="userSpaceOnUse">
        <circle r={1} />
      </clipPath>
      <radialGradient id={id.hl} cx={0.34} cy={0.29} r={0.5}>
        <stop offset={0} stopColor="#FFFFFF" stopOpacity={0.8} />
        <stop offset={0.22} stopColor="#FFFFFF" stopOpacity={0.3} />
        <stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
      </radialGradient>
      <radialGradient id={id.sh} cx={0.4} cy={0.36} r={0.72}>
        <stop offset={0.42} stopColor={stadium.night} stopOpacity={0} />
        <stop offset={0.8} stopColor={stadium.night} stopOpacity={0.38} />
        <stop offset={1} stopColor={stadium.night} stopOpacity={0.66} />
      </radialGradient>
      <linearGradient id={id.rim} x1={0.1} y1={0.05} x2={0.9} y2={0.95}>
        <stop offset={0.5} stopColor={stadium.flood} stopOpacity={0} />
        <stop offset={0.85} stopColor={stadium.flood} stopOpacity={0.55} />
        <stop offset={1} stopColor={stadium.flood} stopOpacity={0.9} />
      </linearGradient>
      <radialGradient id={id.cs}>
        <stop offset={0} stopColor={stadium.night} stopOpacity={0.62} />
        <stop offset={0.45} stopColor={stadium.night} stopOpacity={0.32} />
        <stop offset={1} stopColor={stadium.night} stopOpacity={0} />
      </radialGradient>
      <radialGradient id={id.glow}>
        <stop offset={0} stopColor={stadium.flood} stopOpacity={0.9} />
        <stop offset={0.35} stopColor={stadium.volt} stopOpacity={0.35} />
        <stop offset={1} stopColor={stadium.volt} stopOpacity={0} />
      </radialGradient>
    </defs>
  );
};

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

/** Football brown: the leather darkened toward night. */
const FOOTBALL_BROWN = (() => {
  const a = parseInt(stadium.leather.slice(1), 16);
  const b = parseInt(stadium.night.slice(1), 16);
  const ch = (sh: number) =>
    Math.round(((a >> sh) & 255) * 0.62 + ((b >> sh) & 255) * 0.38);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
})();

const BASE_COLOR: Record<BallKind, string> = {
  basket: stadium.leather,
  soccer: stadium.flood,
  tennis: stadium.volt,
  volley: stadium.flood,
  base: stadium.flood,
  football: FOOTBALL_BROWN,
};

const Shading: React.FC<{
  readonly prefix: string;
  readonly d?: string;
}> = ({ prefix, d }) => {
  const id = ballIds(prefix);
  if (d) {
    return (
      <>
        <path d={d} fill={`url(#${id.hl})`} />
        <path d={d} fill={`url(#${id.sh})`} />
        <path d={d} fill="none" stroke={`url(#${id.rim})`} strokeWidth={0.07} />
      </>
    );
  }
  return (
    <>
      <circle r={1} fill={`url(#${id.hl})`} />
      <circle r={1} fill={`url(#${id.sh})`} />
      <circle
        r={0.955}
        fill="none"
        stroke={`url(#${id.rim})`}
        strokeWidth={0.07}
      />
    </>
  );
};

const SpherePattern: React.FC<{
  readonly kind: BallKind;
  readonly m: M3;
}> = ({ kind, m }) => {
  switch (kind) {
    case "basket":
      return (
        <path
          d={BASKET.map((c) => curvePath(c, m, true)).join("")}
          fill="none"
          stroke={stadium.night}
          strokeWidth={0.055}
          strokeLinecap="round"
        />
      );
    case "tennis":
      return (
        <path
          d={curvePath(TENNIS[0], m, true)}
          fill="none"
          stroke={stadium.flood}
          strokeWidth={0.09}
          strokeLinecap="round"
        />
      );
    case "base":
      return (
        <path
          d={BASEBALL.map((c) => curvePath(c, m, true)).join("")}
          fill="none"
          stroke={stadium.signal}
          strokeWidth={0.075}
          strokeDasharray="0.045 0.05"
        />
      );
    case "soccer":
      return (
        <>
          <path
            d={SOCCER_SEAMS.map((c) => curvePath(c, m, false)).join("")}
            fill="none"
            stroke={stadium.steel}
            strokeWidth={0.03}
          />
          <path
            d={SOCCER_PENTAGONS.map((p) => patchPath(p, m)).join("")}
            fill={stadium.navy}
            stroke={stadium.navy}
            strokeWidth={0.02}
            strokeLinejoin="round"
          />
        </>
      );
    case "volley":
      return (
        <>
          <path
            d={VOLLEY_STRIPS.filter((s) => s.color === "navy")
              .map((s) => patchPath(s.pts, m))
              .join("")}
            fill={stadium.navyMid}
          />
          <path
            d={VOLLEY_STRIPS.filter((s) => s.color === "volt")
              .map((s) => patchPath(s.pts, m))
              .join("")}
            fill={stadium.volt}
          />
          <path
            d={VOLLEY_SEAMS.map((c) => curvePath(c, m, false)).join("")}
            fill="none"
            stroke={stadium.navy}
            strokeOpacity={0.45}
            strokeWidth={0.03}
          />
        </>
      );
    default:
      return null;
  }
};

/** Lemon-shaped football outline in unit coords (short radius 1). */
const footballGeometry = (m: M3) => {
  const a = m3apply(m, { x: 1, y: 0, z: 0 });
  const L = Math.min(1, Math.hypot(a.x, a.y));
  const ang = Math.atan2(a.y, a.x);
  const A = 1 + 0.65 * L;
  const ex = 0.5 + 0.35 * L;
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const rot = (x: number, y: number) => ({
    x: x * c - y * s,
    y: x * s + y * c,
  });
  const half = (u: number) => Math.pow(Math.max(0, 1 - u * u), ex);
  const pts: { x: number; y: number }[] = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const u = -1 + (2 * i) / N;
    pts.push(rot(u * A, -half(u)));
  }
  for (let i = N - 1; i > 0; i--) {
    const u = -1 + (2 * i) / N;
    pts.push(rot(u * A, half(u)));
  }
  const d =
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${f2(p.x)} ${f2(p.y)}`).join("") +
    "Z";

  // Laces sit on the local -y side; stripes ring the ball near the tips.
  const n = m3apply(m, { x: 0, y: -1, z: 0 });
  let laces = "";
  if (n.z > 0.05) {
    const cx = n.x * 0.82;
    const cy = n.y * 0.82;
    const ux = c * A * 0.42;
    const uy = s * A * 0.42;
    laces += `M${f2(cx - ux)} ${f2(cy - uy)}L${f2(cx + ux)} ${f2(cy + uy)}`;
    const tick = 0.2 * Math.min(1, n.z * 1.6);
    for (let k = 0; k < 6; k++) {
      const u = -0.8 + (1.6 * k) / 5;
      const px = cx + ux * u;
      const py = cy + uy * u;
      laces += `M${f2(px + s * tick)} ${f2(py - c * tick)}L${f2(px - s * tick)} ${f2(py + c * tick)}`;
    }
  }
  let stripes = "";
  if (L > 0.35) {
    for (const u of [-0.66, 0.66]) {
      const w = half(u) * 0.96;
      const p = rot(u * A, -w);
      const q = rot(u * A, w);
      stripes += `M${f2(p.x)} ${f2(p.y)}L${f2(q.x)} ${f2(q.y)}`;
    }
  }
  return { d, laces, laceAlpha: Math.min(1, n.z * 3), stripes, A };
};

export type BallSpriteProps = {
  readonly prefix: string;
  readonly kind: BallKind;
  /** Screen position (px, from the SVG's top-left). */
  readonly x: number;
  readonly y: number;
  /** Screen radius in px (short radius for a football). */
  readonly r: number;
  /** Ball-local → view rotation (camera matrix × ball rotation). */
  readonly m: M3;
  readonly squash?: number;
  readonly opacity?: number;
};

export const BallSprite: React.FC<BallSpriteProps> = ({
  prefix,
  kind,
  x,
  y,
  r,
  m,
  squash = 0,
  opacity = 1,
}) => {
  const id = ballIds(prefix);
  const detailed = r > 9;
  const sx = r * (1 + squash * 0.6);
  const sy = r * (1 - squash);
  const transform = `translate(${x.toFixed(1)} ${(y + r * squash).toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`;

  if (kind === "football") {
    const g = footballGeometry(m);
    return (
      <g transform={transform} opacity={opacity}>
        <path d={g.d} fill={BASE_COLOR.football} />
        {detailed && g.stripes ? (
          <path
            d={g.stripes}
            stroke={stadium.flood}
            strokeWidth={0.13}
            strokeOpacity={0.9}
          />
        ) : null}
        {detailed && g.laces ? (
          <path
            d={g.laces}
            stroke={stadium.flood}
            strokeWidth={0.08}
            strokeLinecap="round"
            strokeOpacity={g.laceAlpha}
          />
        ) : null}
        <Shading prefix={prefix} d={g.d} />
      </g>
    );
  }

  return (
    <g transform={transform} opacity={opacity}>
      <circle r={1} fill={BASE_COLOR[kind]} />
      {detailed ? (
        <g clipPath={`url(#${id.clip})`}>
          <SpherePattern kind={kind} m={m} />
        </g>
      ) : null}
      <Shading prefix={prefix} />
    </g>
  );
};
