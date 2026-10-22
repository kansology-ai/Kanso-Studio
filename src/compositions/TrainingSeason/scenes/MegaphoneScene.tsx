import type React from "react";
import {
  AbsoluteFill,
  Interactive,
  interpolate,
  random,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Box3D } from "../../../components/Solids3D";
import { Node3D, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE, SPRING } from "../../../lib/animation";
import { project, shake, type Camera, type Vec3 } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { BroadcastFinish, Flash, LedText, WhipBlur } from "../kit/fx";
import {
  fitSize,
  inkMetrics,
  textWidth,
  useFontsReady,
  type FontSpec,
} from "../kit/ScoreboardFit";
import {
  add,
  dollyCamera,
  dot,
  forwardOf,
  fromView,
  kick,
  mixColor,
  mul,
  norm,
  orient,
  ramp,
  snapTime,
  v3,
} from "../kit/ScoreboardMath";
import { StadiumSky } from "../kit/StadiumSky";
import {
  BEAT_SECONDS,
  beatAt,
  localCues,
  sceneLength,
  sceneStart,
  splitSlots,
  TRAINING_SEASON_TIMING,
} from "../timing";

/**
 * Scene 6, MEGAPHONE (20.2–22.0 s): crowd noise overload.
 * Slot 1 is blasted out of a 3D megaphone on a volt chat pill, then
 * multiplies on the beats into a storm of pennants, foam fingers, burst
 * stickers, LED tickers and megaphones flying around the camera. A typing
 * bubble swings in, and slot 2 slams onto a jumbotron. Exit: white flash.
 */

const KEY = "megaphone" as const;
const START = sceneStart(KEY);
const LEN = sceneLength(KEY);
const [CUE_A, CUE_B] = localCues(
  KEY,
  TRAINING_SEASON_TIMING.cues.megaphone,
).map(snapTime);
const DOTS = snapTime(TRAINING_SEASON_TIMING.accents.megaphoneDots - START);

/** Half-beat grid inside the scene (local seconds). */
const EIGHTHS: number[] = (() => {
  const out: number[] = [];
  for (let n = 0; n < 160; n++) {
    const t = beatAt(n / 2) - START;
    if (t > 0.05 && t < LEN) out.push(t);
  }
  return out;
})();
/** The storm multiplies on these (beat / half-beat) hits. */
const WAVES = EIGHTHS.filter((t) => t > 0.3 && t < 1.3);
/** Sound-wave rings leave the megaphone on these. */
const RING_EMITS = [CUE_A, ...EIGHTHS.filter((t) => t < 0.3)];

const PILL_FONT: FontSpec = {
  family: fonts.broadcast,
  weight: 900,
  style: "italic",
};
const JUMBO_FONT: FontSpec = { family: fonts.stadium, weight: 900 };
const VARSITY_FONT: FontSpec = { family: fonts.varsity, weight: 400 };
const LED_FONT: FontSpec = { family: fonts.led, weight: 900 };
const FONT_SPECS = [PILL_FONT, JUMBO_FONT, VARSITY_FONT, LED_FONT];

const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const FOCAL = 900;

/** The camera path without punches or shake (design px, × unit). */
const camPath = (t: number, u: number): Camera => {
  // Rushes in out of the previous scene's push, then keeps dollying.
  const z = 1000 - 480 * t + 820 * Math.exp(-t / 0.075);
  const x = -20 + 60 * t;
  const y = -10 - 30 * t;
  const io = { ...CLAMP, easing: EASE.inOut };
  const yaw = interpolate(
    t,
    [0, 0.44, 0.95, 1.45, 1.8],
    [1.5, 0, -9, 1, 0.5],
    io,
  );
  const pitch = interpolate(
    t,
    [0, 0.44, 0.95, 1.45, 1.8],
    [2, 1, -2, -1, -1],
    io,
  );
  const roll = interpolate(
    t,
    [0, 0.44, 0.7, 0.95, 1.2, 1.45, 1.8],
    [-6, -2, 5, -5, 3, 0, 0.5],
    io,
  );
  return { x: x * u, y: y * u, z: z * u, yaw, pitch, roll, focal: FOCAL * u };
};

const camAt = (t: number, reel: number, u: number): Camera => {
  const base = camPath(t, u);
  const k1 = WAVES[0] !== undefined ? kick(t, WAVES[0]) : 0;
  const k2 = WAVES[2] !== undefined ? kick(t, WAVES[2]) : 0;
  const kd = kick(t, DOTS);
  const kb = kick(t, CUE_B, 0.1);
  const push = 90 * k1 + 90 * k2 + 60 * kd + 240 * kb;
  const punched = dollyCamera(base, 0, 0, push * u);
  return shake(
    {
      ...punched,
      roll: punched.roll + 4 * k1 - 4 * k2 + 2 * kd - 4 * kb,
      focal: punched.focal * (1 + 0.05 * kb),
    },
    reel,
    { amount: 0.9 + 0.6 * (t / LEN) + 1.6 * kb, speed: 5, seed: "mega" },
  );
};

/* ------------------------------------------------------------------ */
/* SVG shape helpers                                                   */
/* ------------------------------------------------------------------ */

const capsulePath = (w: number, h: number): string => {
  const r = h / 2;
  return `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
};

/** Capsule with a chat tail at the bottom-left. */
const chatPillPath = (w: number, h: number): string => {
  const r = h / 2;
  return `${capsulePath(w, h)} M ${r * 0.75} ${h * 0.62} L ${r * 0.2} ${h * 1.32} L ${r * 1.7} ${h * 0.92} Z`;
};

/** Rounded speech bubble with a tail at the bottom-left. */
const bubblePath = (w: number, h: number): string => {
  const r = h * 0.34;
  return [
    `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${w * 0.3} L ${w * 0.1} ${h * 1.28} L ${w * 0.15} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`,
  ].join(" ");
};

const starPath = (
  cx: number,
  cy: number,
  ro: number,
  ri: number,
  n: number,
) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return `M ${pts.join(" L ")} Z`;
};

/* ------------------------------------------------------------------ */
/* Hero megaphone (real 3D: a shaded frustum of panels)                */
/* ------------------------------------------------------------------ */

const MEGA = { L: 600, r0: 72, r1: 235, N: 22 };
/** Orientation of the megaphone axis (local +z = blast direction). */
const MEGA_RX = 30;
const MEGA_RY = 70;
const MEGA_LIGHT = norm(v3(-0.55, -0.75, 0.35));
const BODY_STOPS = [
  stadium.night,
  stadium.navy,
  stadium.navyMid,
  stadium.navyLight,
  stadium.steel,
];

const Positioned: React.FC<{
  readonly transform: string;
  readonly children: React.ReactNode;
}> = ({ transform, children }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      transformStyle: "preserve-3d",
      transform,
    }}
  >
    {children}
  </div>
);

const Megaphone3D: React.FC<{
  readonly u: number;
  readonly t: number;
  readonly pulse: number;
}> = ({ u, t, pulse }) => {
  const L = MEGA.L * u;
  const r0 = MEGA.r0 * u;
  const r1 = MEGA.r1 * u;
  const N = MEGA.N;
  const cosN = Math.cos(Math.PI / N);
  const a0 = r0 * cosN;
  const a1 = r1 * cosN;
  const amid = (a0 + a1) / 2;
  const phi = Math.atan2(a1 - a0, L);
  const slant = Math.hypot(L, a1 - a0);
  const wTop = 2 * r0 * Math.sin(Math.PI / N) * 1.08 + 1;
  const wBot = 2 * r1 * Math.sin(Math.PI / N) * 1.08 + 1;
  const inset = ((wBot - wTop) / 2 / wBot) * 100;
  const panels = new Array(N).fill(0).map((_, i) => i);

  // Blast energy: high on each emission, decaying.
  const blast = Math.max(...RING_EMITS.map((e) => kick(t, e, 0.12)), 0);

  const rings = RING_EMITS.flatMap((e, i) =>
    [0, 1].map((k) => {
      const tau = t - e - k * 0.06;
      if (tau < 0 || tau > 0.34) return null;
      const p = tau / 0.34;
      const travel = interpolate(p, [0, 1], [0, 1], {
        ...CLAMP,
        easing: EASE.out,
      });
      const r = r1 * (1.02 + 0.62 * travel);
      const z = L + (30 + 260 * travel) * u;
      const width = (k === 0 ? 16 : 7) * u * (1 - 0.5 * p);
      return (
        <div
          key={`ring-${i}-${k}`}
          style={{
            position: "absolute",
            left: -r,
            top: -r,
            width: 2 * r,
            height: 2 * r,
            borderRadius: "50%",
            boxSizing: "border-box",
            border: `${width}px solid ${k === 0 ? stadium.volt : stadium.flood}`,
            opacity: (1 - p) ** 1.4 * (k === 0 ? 0.95 : 0.7),
            transform: `translateZ(${z}px)`,
            boxShadow:
              k === 0 ? `0 0 ${18 * u}px rgba(215,255,46,0.55)` : undefined,
          }}
        />
      );
    }),
  );

  return (
    <>
      {/* Cone */}
      {panels.map((i) => {
        const th = (i * 360) / N;
        const n = v3(
          Math.cos(phi) * Math.sin(th * DEG),
          -Math.cos(phi) * Math.cos(th * DEG),
          -Math.sin(phi),
        );
        const diff = Math.max(0, dot(n, MEGA_LIGHT));
        const spec = diff ** 12;
        const base = ramp(BODY_STOPS, 0.12 + diff * 0.62 + spec * 0.26);
        const band = mixColor(stadium.steel, stadium.flood, 0.25 + diff * 0.75);
        const pin = mixColor(stadium.voltDeep, stadium.volt, diff);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: -wBot / 2,
              top: -slant / 2,
              width: wBot,
              height: slant,
              clipPath: `polygon(${inset}% 0, ${100 - inset}% 0, 100% 100%, 0 100%)`,
              background: `linear-gradient(180deg, ${base} 0%, ${base} 62%, ${band} 62%, ${band} 76%, ${base} 76%, ${base} 84%, ${pin} 84%, ${pin} 87%, ${base} 87%)`,
              backfaceVisibility: "hidden",
              transform: `rotateZ(${th}deg) translate3d(0, ${-amid}px, ${L / 2}px) rotateX(${90 + phi / DEG}deg)`,
            }}
          />
        );
      })}
      {/* Back cap */}
      <div
        style={{
          position: "absolute",
          left: -r0 * 1.1,
          top: -r0 * 1.1,
          width: r0 * 2.2,
          height: r0 * 2.2,
          borderRadius: "50%",
          background: `radial-gradient(circle at 40% 35%, ${stadium.navyLight}, ${stadium.navy} 70%)`,
          border: `${6 * u}px solid ${stadium.volt}`,
          boxSizing: "border-box",
          transform: "rotateY(180deg) translateZ(1px)",
          backfaceVisibility: "hidden",
        }}
      />
      {/* Handle and trigger */}
      <Positioned
        transform={`translate3d(0, ${a0 + (a1 - a0) * 0.28 + 70 * u}px, ${L * 0.28}px) rotateX(-18deg)`}
      >
        <Box3D
          width={58 * u}
          height={180 * u}
          depth={70 * u}
          colors={{
            front: stadium.navyMid,
            side: stadium.navy,
            top: stadium.navyLight,
            bottom: stadium.night,
          }}
        />
      </Positioned>
      <Positioned
        transform={`translate3d(0, ${a0 + (a1 - a0) * 0.36 + 34 * u}px, ${L * 0.36 + 42 * u}px)`}
      >
        <Box3D
          width={24 * u}
          height={64 * u}
          depth={26 * u}
          colors={{
            front: stadium.volt,
            side: stadium.voltDeep,
            top: stadium.volt,
          }}
        />
      </Positioned>
      {/* Mouth: dark horn interior with a speaker, and a thick volt rim */}
      <div
        style={{
          position: "absolute",
          left: -r1,
          top: -r1,
          width: 2 * r1,
          height: 2 * r1,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 50%, ${stadium.steel} 0 7%, ${stadium.navyMid} 8% 15%, ${stadium.night} 17% 24%, ${stadium.navy} 26% 52%, ${stadium.night} 80%)`,
          transform: `translateZ(${L - 2 * u}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -r1 * 1.1,
          top: -r1 * 1.1,
          width: r1 * 2.2,
          height: r1 * 2.2,
          borderRadius: "50%",
          boxSizing: "border-box",
          border: `${22 * u}px solid ${stadium.voltDeep}`,
          transform: `translateZ(${L - 12 * u}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -r1 * 1.1,
          top: -r1 * 1.1,
          width: r1 * 2.2,
          height: r1 * 2.2,
          borderRadius: "50%",
          boxSizing: "border-box",
          border: `${22 * u}px solid ${stadium.volt}`,
          boxShadow: `0 0 ${30 * u * (0.4 + blast)}px rgba(215,255,46,${0.35 + 0.4 * blast})`,
          transform: `translateZ(${L + 1}px)`,
        }}
      />
      {/* Blast glow */}
      <div
        style={{
          position: "absolute",
          left: -r1 * 1.8,
          top: -r1 * 1.8,
          width: r1 * 3.6,
          height: r1 * 3.6,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(215,255,46,0) 0%, rgba(215,255,46,0) 52%, rgba(215,255,46,0.5) 60%, rgba(246,248,255,0.25) 66%, rgba(215,255,46,0) 100%)",
          opacity: 0.25 + 0.75 * Math.max(blast, pulse * 0.4),
          transform: `translateZ(${L + 8 * u}px)`,
        }}
      />
      {rings}
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Hero chat pill (slot 1)                                             */
/* ------------------------------------------------------------------ */

const ChatPill: React.FC<{
  readonly word: string;
  readonly fontSize: number;
  readonly textW: number;
  readonly u: number;
}> = ({ word, fontSize, textW, u }) => {
  const h = fontSize * 1.28;
  const w = textW + fontSize * 0.95;
  const layers = 8;
  const depth = 46 * u;
  const pad = h * 0.4;
  const svgBox = (fill: string, extra?: React.CSSProperties) => (
    <svg
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      style={{
        position: "absolute",
        left: -pad,
        top: -pad,
        overflow: "visible",
        ...extra,
      }}
    >
      <path d={chatPillPath(w, h)} fill={fill} />
    </svg>
  );
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        transformStyle: "preserve-3d",
      }}
    >
      {new Array(layers).fill(0).map((_, i) => {
        const k = (layers - i) / layers;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateZ(${-k * depth}px)`,
            }}
          >
            {svgBox(mixColor(stadium.voltDeep, stadium.night, 0.15 + 0.55 * k))}
          </div>
        );
      })}
      <div
        style={{ position: "absolute", inset: 0, transform: "translateZ(1px)" }}
      >
        <svg
          width={w + pad * 2}
          height={h + pad * 2}
          viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
          style={{
            position: "absolute",
            left: -pad,
            top: -pad,
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient id="mega-pill-face" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0"
                stopColor={mixColor(stadium.volt, stadium.flood, 0.55)}
              />
              <stop offset="0.45" stopColor={stadium.volt} />
              <stop offset="1" stopColor={stadium.voltDeep} />
            </linearGradient>
          </defs>
          <path d={chatPillPath(w, h)} fill="url(#mega-pill-face)" />
          <path
            d={capsulePath(w - h * 0.5, h * 0.22)}
            transform={`translate(${h * 0.25}, ${h * 0.1})`}
            fill="rgba(255,255,255,0.35)"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: fonts.broadcast,
            fontStyle: "italic",
            fontWeight: 900,
            fontSize,
            lineHeight: 1,
            color: stadium.navy,
            whiteSpace: "pre",
            paddingBottom: fontSize * 0.04,
          }}
        >
          {word}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Storm items (JS-projected sprites with depth of field)              */
/* ------------------------------------------------------------------ */

type StormKind = "pill" | "pennant" | "finger" | "burst" | "ticker" | "mega";
const KIND_ORDER: StormKind[] = [
  "pill",
  "pennant",
  "burst",
  "ticker",
  "finger",
  "pennant",
  "mega",
  "pill",
  "burst",
  "ticker",
];
const KIND_SIZE: Record<StormKind, [number, number]> = {
  pill: [380, 130],
  pennant: [440, 175],
  finger: [190, 300],
  burst: [290, 290],
  ticker: [460, 104],
  mega: [330, 220],
};

type StormSeed = {
  readonly kind: StormKind;
  readonly spawn: number;
  readonly angle: number;
  readonly radius: number;
  readonly z0: number;
  readonly vz: number;
  readonly swirl: number;
  readonly size: number;
  readonly rz0: number;
  readonly vrz: number;
  readonly rx0: number;
  readonly ry0: number;
  readonly wob: number;
  readonly variant: number;
};

const WAVE_SIZES = [8, 12, 12, 14, 12];
const STORM: StormSeed[] = (() => {
  const out: StormSeed[] = [];
  let i = 0;
  WAVE_SIZES.forEach((count, w) => {
    const at =
      w === 0
        ? CUE_A + 0.03
        : (WAVES[Math.min(w - 1, WAVES.length - 1)] ?? 0.45);
    const first = w === 0;
    for (let j = 0; j < count; j++, i++) {
      const r = (s: string) => random(`mega-storm-${s}-${i}`);
      out.push({
        kind: KIND_ORDER[Math.floor(r("k") * KIND_ORDER.length)],
        spawn: at + r("sp") * 0.045,
        angle: r("a") * Math.PI * 2,
        radius: first ? 300 + r("r") * 600 : 110 + r("r") ** 0.7 * 720,
        z0: first ? -2700 + r("z") * 1000 : -1900 + r("z") * 1900,
        vz: 300 + r("vz") * 700,
        swirl: 0.55 + r("sw") * 0.7,
        size: 1 + r("s") * 0.6,
        rz0: (r("rz") - 0.5) * 70,
        vrz: (r("vrz") - 0.5) * 300,
        rx0: (r("rx") - 0.5) * 40,
        ry0: (r("ry") - 0.5) * 60,
        wob: r("w") * Math.PI * 2,
        variant: r("v"),
      });
    }
  });
  return out;
})();

/** Axis the storm swirls around (design px). */
const STORM_AXIS = { x: 0, y: -60 };

type StormFits = Record<StormKind, number>;

const StormArt: React.FC<{
  readonly kind: StormKind;
  readonly w: number;
  readonly h: number;
  readonly word: string;
  readonly fs: number;
  readonly variant: number;
  readonly u: number;
  readonly t: number;
}> = ({ kind, w, h, word, fs, variant, u, t }) => {
  if (kind === "pill") {
    const flood = variant > 0.5;
    const body = flood ? stadium.flood : stadium.volt;
    const edge = flood ? stadium.steel : stadium.voltDeep;
    return (
      <svg width={w} height={h * 1.3} style={{ overflow: "visible" }}>
        <path
          d={chatPillPath(w, h)}
          fill={edge}
          transform={`translate(0, ${10 * u})`}
        />
        <path d={chatPillPath(w, h)} fill={body} />
        <text
          x={w / 2}
          y={h / 2}
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily={fonts.broadcast}
          fontStyle="italic"
          fontWeight={900}
          fontSize={fs}
          fill={stadium.navy}
        >
          {word}
        </text>
      </svg>
    );
  }
  if (kind === "pennant") {
    const volt = variant > 0.62;
    const body = volt ? stadium.volt : stadium.navy;
    const band = volt ? stadium.navy : stadium.volt;
    const ink = volt ? stadium.navy : stadium.flood;
    return (
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <rect
          x={-10 * u}
          y={-h * 0.18}
          width={12 * u}
          height={h * 1.45}
          rx={5 * u}
          fill={stadium.steel}
        />
        <path d={`M 0 0 L ${w} ${h / 2} L 0 ${h} Z`} fill={body} />
        <path
          d={`M 0 0 L ${w * 0.13} ${h * 0.065} L ${w * 0.13} ${h * 0.935} L 0 ${h} Z`}
          fill={band}
        />
        <path
          d={`M ${w * 0.17} ${h * 0.14} L ${w * 0.9} ${h / 2} L ${w * 0.17} ${h * 0.86}`}
          fill="none"
          stroke={volt ? "rgba(11,22,51,0.35)" : "rgba(246,248,255,0.35)"}
          strokeWidth={3 * u}
          strokeDasharray={`${10 * u} ${7 * u}`}
        />
        <text
          x={w * 0.19}
          y={h / 2}
          dominantBaseline="central"
          fontFamily={fonts.varsity}
          fontSize={fs}
          fill={ink}
        >
          {word}
        </text>
      </svg>
    );
  }
  if (kind === "finger") {
    return (
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <g fill={stadium.voltDeep} transform={`translate(${6 * u}, ${8 * u})`}>
          <rect
            x={w * 0.36}
            y={0}
            width={w * 0.3}
            height={h * 0.62}
            rx={w * 0.15}
          />
          <rect
            x={w * 0.08}
            y={h * 0.4}
            width={w * 0.86}
            height={h * 0.48}
            rx={w * 0.2}
          />
          <rect
            x={0}
            y={h * 0.42}
            width={w * 0.34}
            height={h * 0.2}
            rx={w * 0.1}
          />
        </g>
        <g fill={stadium.volt}>
          <rect
            x={w * 0.36}
            y={0}
            width={w * 0.3}
            height={h * 0.62}
            rx={w * 0.15}
          />
          <rect
            x={w * 0.08}
            y={h * 0.4}
            width={w * 0.86}
            height={h * 0.48}
            rx={w * 0.2}
          />
          <rect
            x={0}
            y={h * 0.42}
            width={w * 0.34}
            height={h * 0.2}
            rx={w * 0.1}
          />
        </g>
        <rect
          x={w * 0.14}
          y={h * 0.82}
          width={w * 0.74}
          height={h * 0.18}
          rx={8 * u}
          fill={stadium.navy}
        />
        <rect
          x={w * 0.14}
          y={h * 0.88}
          width={w * 0.74}
          height={h * 0.035}
          fill={stadium.flood}
        />
        <text
          x={w * 0.52}
          y={h * 0.64}
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily={fonts.varsity}
          fontSize={h * 0.24}
          fill={stadium.navy}
        >
          #1
        </text>
      </svg>
    );
  }
  if (kind === "burst") {
    const kindColor =
      variant < 0.3
        ? stadium.signal
        : variant < 0.65
          ? stadium.flood
          : stadium.volt;
    const ink = variant < 0.3 ? stadium.flood : stadium.navy;
    return (
      <svg width={w} height={h} style={{ overflow: "visible" }}>
        <path
          d={starPath(w / 2, h / 2, w * 0.5, w * 0.37, 14)}
          fill={kindColor}
          stroke={stadium.flood}
          strokeWidth={7 * u}
          strokeLinejoin="round"
        />
        <text
          x={w / 2}
          y={h / 2}
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily={fonts.broadcast}
          fontStyle="italic"
          fontWeight={900}
          fontSize={fs}
          fill={ink}
          transform={`rotate(-9 ${w / 2} ${h / 2})`}
        >
          {word}
        </text>
      </svg>
    );
  }
  if (kind === "ticker") {
    const unitW = textWidth(`${word}  ◆  `, LED_FONT, fs) || 1;
    const scroll = -((t * 260 * u) % unitW);
    return (
      <div
        style={{
          width: w,
          height: h,
          borderRadius: 10 * u,
          background: `radial-gradient(circle, rgba(135,150,192,0.18) 0 ${1.4 * u}px, rgba(0,0,0,0) ${1.8 * u}px) 0 0 / ${7 * u}px ${7 * u}px, ${stadium.night}`,
          border: `${4 * u}px solid ${stadium.navyLight}`,
          boxSizing: "border-box",
          overflow: "hidden",
          position: "relative",
          boxShadow: `0 ${8 * u}px 0 ${stadium.navy}`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: scroll,
            top: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
          }}
        >
          <LedText style={{ fontSize: fs }}>
            {`${word}  ◆  ${word}  ◆  ${word}  ◆  `}
          </LedText>
        </div>
      </div>
    );
  }
  // Mini megaphone, side view.
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id="mega-mini-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={stadium.navyLight} />
          <stop offset="0.5" stopColor={stadium.navyMid} />
          <stop offset="1" stopColor={stadium.night} />
        </linearGradient>
      </defs>
      <rect
        x={w * 0.22}
        y={h * 0.55}
        width={w * 0.13}
        height={h * 0.42}
        rx={8 * u}
        fill={stadium.navy}
        transform={`rotate(-12 ${w * 0.28} ${h * 0.55})`}
      />
      <path
        d={`M ${w * 0.04} ${h * 0.38} L ${w * 0.78} ${h * 0.06} L ${w * 0.78} ${h * 0.94} L ${w * 0.04} ${h * 0.62} Z`}
        fill="url(#mega-mini-body)"
      />
      <path
        d={`M ${w * 0.56} ${h * 0.16} L ${w * 0.66} ${h * 0.115} L ${w * 0.66} ${h * 0.885} L ${w * 0.56} ${h * 0.84} Z`}
        fill={stadium.flood}
      />
      <ellipse
        cx={w * 0.8}
        cy={h / 2}
        rx={w * 0.08}
        ry={h * 0.45}
        fill={stadium.night}
        stroke={stadium.volt}
        strokeWidth={10 * u}
      />
      <rect
        x={0}
        y={h * 0.36}
        width={w * 0.06}
        height={h * 0.28}
        rx={4 * u}
        fill={stadium.volt}
      />
    </svg>
  );
};

type StormSprite = {
  readonly key: number;
  readonly seed: StormSeed;
  readonly sx: number;
  readonly sy: number;
  readonly scale: number;
  readonly depth: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly blur: number;
  readonly dim: number;
  readonly fade: number;
};

const StormLayer: React.FC<{
  readonly sprites: StormSprite[];
  readonly word: string;
  readonly fits: StormFits;
  readonly u: number;
  readonly t: number;
}> = ({ sprites, word, fits, u, t }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {sprites.map((sp) => {
      const [bw, bh] = KIND_SIZE[sp.seed.kind];
      const w = bw * u * sp.seed.size;
      const h = bh * u * sp.seed.size;
      const filters = [
        sp.blur > 0.4 ? `blur(${(sp.blur / sp.scale).toFixed(2)}px)` : "",
        sp.dim < 0.98 ? `brightness(${sp.dim.toFixed(3)})` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return (
        <div
          key={sp.key}
          style={{
            position: "absolute",
            left: sp.sx - w / 2,
            top: sp.sy - h / 2,
            width: w,
            height: h,
            transform: `scale(${sp.scale}) perspective(${700 * u}px) rotateX(${sp.rx}deg) rotateY(${sp.ry}deg) rotateZ(${sp.rz}deg)`,
            filter: filters || undefined,
            opacity: sp.fade,
          }}
        >
          <StormArt
            kind={sp.seed.kind}
            w={w}
            h={h}
            word={sp.seed.kind === "finger" ? "#1" : word}
            fs={fits[sp.seed.kind] * sp.seed.size}
            variant={sp.seed.variant}
            u={u}
            t={t}
          />
        </div>
      );
    })}
  </AbsoluteFill>
);

/* ------------------------------------------------------------------ */
/* Typing bubble                                                       */
/* ------------------------------------------------------------------ */

const TypingBubble: React.FC<{
  readonly w: number;
  readonly h: number;
  readonly u: number;
  readonly reel: number;
  readonly t: number;
}> = ({ w, h, u, reel, t }) => {
  const layers = 6;
  const depth = 28 * u;
  const pad = h * 0.4;
  const half = BEAT_SECONDS / 2;
  const svg = (fill: string) => (
    <svg
      width={w + pad * 2}
      height={h + pad * 2}
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      style={{
        position: "absolute",
        left: -pad,
        top: -pad,
        overflow: "visible",
      }}
    >
      <path d={bubblePath(w, h)} fill={fill} />
    </svg>
  );
  const dotR = 46 * u;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        transformStyle: "preserve-3d",
      }}
    >
      {new Array(layers).fill(0).map((_, i) => {
        const k = (layers - i) / layers;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              transform: `translateZ(${-k * depth}px)`,
            }}
          >
            {svg(mixColor(stadium.steel, stadium.navyMid, k))}
          </div>
        );
      })}
      <div
        style={{ position: "absolute", inset: 0, transform: "translateZ(1px)" }}
      >
        <svg
          width={w + pad * 2}
          height={h + pad * 2}
          viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
          style={{
            position: "absolute",
            left: -pad,
            top: -pad,
            overflow: "visible",
          }}
        >
          <defs>
            <linearGradient id="mega-bubble-face" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop
                offset="1"
                stopColor={mixColor(stadium.flood, stadium.steel, 0.22)}
              />
            </linearGradient>
          </defs>
          <path d={bubblePath(w, h)} fill="url(#mega-bubble-face)" />
        </svg>
        {[0, 1, 2].map((k) => {
          // Each dot hops once per half-beat, landing on the grid.
          const ph =
            (((reel - beatAt(0) - k * half * 0.22) % half) + half) % half;
          const hop = Math.sin((ph / half) * Math.PI);
          const live = interpolate(t, [DOTS, DOTS + 0.08], [0, 1], CLAMP);
          const y = -hop * 46 * u * live;
          const squash = 1 + (1 - hop) * 0.12 * live;
          return (
            <div
              key={k}
              style={{
                position: "absolute",
                left: w / 2 + (k - 1) * dotR * 2.7 - dotR,
                top: h / 2 - dotR + y,
                width: dotR * 2,
                height: dotR * 2,
                borderRadius: "50%",
                background: `radial-gradient(circle at 36% 30%, ${mixColor(stadium.volt, stadium.flood, 0.7)} 0%, ${stadium.volt} 32%, ${stadium.voltDeep} 78%, ${mixColor(stadium.voltDeep, stadium.navy, 0.35)} 100%)`,
                scale: `${squash} ${2 - squash}`,
                boxShadow: `0 ${6 * u}px ${14 * u}px rgba(11,22,51,0.35)`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Jumbotron (slot 2)                                                  */
/* ------------------------------------------------------------------ */

const JW = 900;
const JH = 580;
const JD = 110;
const J_BORDER = 46;

const Jumbotron: React.FC<{
  readonly word: string;
  readonly fs: number;
  readonly squeeze: number;
  readonly u: number;
  readonly t: number;
  readonly reel: number;
  readonly pulse: number;
}> = ({ word, fs, squeeze, u, t, reel, pulse }) => {
  const w = JW * u;
  const h = JH * u;
  const band = J_BORDER * u;
  const sixteenth = BEAT_SECONDS / 4;
  const step = Math.floor((reel - beatAt(0)) / sixteenth);
  const landed = t - CUE_B;
  const allOn = landed < 0.14;
  const bulbs: { x: number; y: number }[] = [];
  const nx = 16;
  const ny = 9;
  for (let i = 0; i < nx; i++)
    bulbs.push({ x: band / 2 + ((w - band) * i) / nx, y: band / 2 });
  for (let i = 0; i < ny; i++)
    bulbs.push({ x: w - band / 2, y: band / 2 + ((h - band) * i) / ny });
  for (let i = 0; i < nx; i++)
    bulbs.push({ x: w - band / 2 - ((w - band) * i) / nx, y: h - band / 2 });
  for (let i = 0; i < ny; i++)
    bulbs.push({ x: band / 2, y: h - band / 2 - ((h - band) * i) / ny });
  const screenFlash = kick(t, CUE_B, 0.07);
  const scan = interpolate(landed, [0, 0.3], [-0.2, 1.2], CLAMP);
  const front = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(180deg, ${stadium.navyLight} 0%, ${stadium.navyMid} 22%, ${stadium.navy} 100%)`,
      }}
    >
      {bulbs.map((b, i) => {
        const on = allOn ? true : (i + step) % 3 === 0;
        const r = 9 * u;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x - r,
              top: b.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              background: on
                ? `radial-gradient(circle at 40% 35%, #FFFFFF 0%, ${stadium.flood} 30%, ${stadium.volt} 80%)`
                : `radial-gradient(circle at 40% 35%, ${stadium.navyLight}, ${stadium.night} 80%)`,
              boxShadow: on
                ? `0 0 ${(10 + 10 * pulse) * u}px ${4 * u}px rgba(215,255,46,0.7)`
                : undefined,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: band,
          borderRadius: 8 * u,
          overflow: "hidden",
          background: `radial-gradient(120% 90% at 50% 40%, ${stadium.navyMid} 0%, ${stadium.night} 75%)`,
          boxShadow: `inset 0 0 ${30 * u}px rgba(0,0,0,0.8)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingTop: fs * 0.04,
          }}
        >
          <div
            style={{
              fontFamily: fonts.stadium,
              fontWeight: 900,
              fontSize: fs,
              lineHeight: 1,
              color: stadium.flood,
              whiteSpace: "pre",
              scale: `${squeeze} 1`,
              textShadow: `0 0 ${0.04 * fs}px ${stadium.volt}, 0 0 ${0.2 * fs}px rgba(215,255,46,${0.45 + 0.3 * pulse})`,
            }}
          >
            {word}
          </div>
        </div>
        {/* LED dot mask */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(circle, rgba(0,0,0,0) 0 ${2.1 * u}px, rgba(5,10,24,0.55) ${3.1 * u}px) 0 0 / ${6 * u}px ${6 * u}px`,
          }}
        />
        {/* Scan sweep on landing */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${scan * 100 - 15}%`,
            height: "15%",
            background:
              "linear-gradient(180deg, rgba(246,248,255,0) 0%, rgba(246,248,255,0.28) 50%, rgba(246,248,255,0) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: stadium.flood,
            opacity: 0.5 * screenFlash,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 18 * u,
            top: 14 * u,
            display: "flex",
            alignItems: "center",
            gap: 8 * u,
          }}
        >
          <div
            style={{
              width: 14 * u,
              height: 14 * u,
              borderRadius: "50%",
              background: stadium.signal,
              opacity: 0.5 + 0.5 * pulse,
            }}
          />
          <LedText
            color={stadium.signal}
            glow={0.6}
            style={{ fontSize: 30 * u }}
          >
            LIVE
          </LedText>
        </div>
      </div>
    </div>
  );
  return (
    <div
      style={{
        position: "relative",
        width: 0,
        height: 0,
        transformStyle: "preserve-3d",
      }}
    >
      {/* Hanging struts */}
      {[-1, 1].map((s) => (
        <Positioned
          key={s}
          transform={`translate3d(${s * 300 * u}px, ${-h / 2 - 520 * u}px, ${-20 * u}px)`}
        >
          <Box3D
            width={26 * u}
            height={1040 * u}
            depth={26 * u}
            colors={{
              front: stadium.navyMid,
              side: stadium.navy,
              top: stadium.navyLight,
            }}
          />
        </Positioned>
      ))}
      <Box3D
        width={w}
        height={h}
        depth={JD * u}
        colors={{
          front: stadium.navyMid,
          side: stadium.navy,
          top: stadium.navyLight,
          bottom: stadium.night,
        }}
        faces={{ front }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type MegaphoneSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const MegaphoneSceneInner: React.FC<MegaphoneSceneProps> = ({
  words,
  style,
}) => {
  const { t, reel, fps, frame, pulse } = useSceneClock(KEY);
  const { width, height, px, unit: u } = useLayout();
  useFontsReady(FONT_SPECS);
  const slots = splitSlots(words);
  const wordA = slots[0] ?? "";
  const wordB = slots[1] ?? "";

  const cam = camAt(t, reel, u);

  /* --- Megaphone placement --- */
  const axis = orient(v3(0, 0, 1), MEGA_RX, MEGA_RY);
  const mouth = v3(px(-80), px(250), px(-60));
  const recoil = interpolate(t, [0.4, 0.74], [0, 1], {
    ...CLAMP,
    easing: EASE.in,
  });
  const back = add(
    add(mouth, mul(axis, -MEGA.L * u)),
    v3(px(-260) * recoil, px(1150) * recoil, px(-250) * recoil),
  );

  /* --- Hero pill (slot 1) --- */
  const pillFs = wordA
    ? fitSize(wordA, PILL_FONT, px(600), { max: px(200), min: px(70) })
    : 0;
  const pillTextW = wordA ? textWidth(wordA, PILL_FONT, pillFs) : 0;
  const pillRest = v3(px(-20), px(-190), 0);
  const shot = spring({
    frame: frame - CUE_A * fps,
    fps,
    config: SPRING.snappy,
  });
  const shotLin = interpolate(t - CUE_A, [0, 0.16], [0, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  // Flies out of the mouth, then gets carried off by the storm.
  const away = interpolate(t, [0.6, 0.82], [0, 1], {
    ...CLAMP,
    easing: EASE.in,
  });
  const pillPos = add(
    add(mouth, mul(add(pillRest, mul(mouth, -1)), shot)),
    v3(px(-700) * away, px(-520) * away, px(420) * away),
  );
  const pillScale = interpolate(shotLin, [0, 1], [0.6, 1]);
  const pillVisible = wordA !== "" && t >= CUE_A && away < 0.999;

  /* --- Typing bubble --- */
  const bubbleCam = camPath(1.2, u);
  const bubbleAnchor = fromView(bubbleCam, v3(px(-20), px(70), -px(640)));
  const bubbleW = px(600);
  const bubbleH = px(330);
  const swingStart = DOTS - 1 / fps;
  const swing = spring({
    frame: frame - swingStart * fps,
    fps,
    config: SPRING.snappy,
  });
  const pop = interpolate(t, [CUE_B - 0.06, CUE_B], [0, 1], CLAMP);
  const bubbleOn = t >= swingStart && pop < 1;

  /* --- Jumbotron (slot 2) --- */
  const jumboCam = camPath(1.62, u);
  const jumboAnchor = fromView(jumboCam, v3(px(-28), px(-10), -px(1010)));
  const jumboInner = px(JW - 2 * J_BORDER - 70);
  let jumboFs = 0;
  let squeeze = 1;
  if (wordB) {
    const fitted = fitSize(wordB, JUMBO_FONT, jumboInner, { max: px(330) });
    const capRatio = inkMetrics("H", JUMBO_FONT, 100).ascent / 100 || 0.72;
    const minFs = px(178) / capRatio;
    if (fitted >= minFs) {
      jumboFs = fitted;
    } else {
      jumboFs = minFs;
      squeeze = jumboInner / Math.max(1, textWidth(wordB, JUMBO_FONT, minFs));
      if (squeeze < 0.55) {
        jumboFs = minFs * (squeeze / 0.55);
        squeeze = 0.55;
      }
    }
  }
  const slam = spring({
    frame: frame - CUE_B * fps,
    fps,
    config: SPRING.snappy,
  });
  const jumboOn = wordB !== "" && t >= CUE_B;
  const jumboFwd = forwardOf(jumboCam);
  const jumboPos = add(jumboAnchor, mul(jumboFwd, -px(150) * (1 - slam)));

  /* --- Storm --- */
  const fits: StormFits = {
    pill: wordA ? fitSize(wordA, PILL_FONT, px(380 - 110), { max: px(84) }) : 0,
    pennant: wordA
      ? fitSize(wordA, VARSITY_FONT, px(440 * 0.56), { max: px(60) })
      : 0,
    burst: wordA
      ? fitSize(wordA, PILL_FONT, px(290 * 0.66), { max: px(70) })
      : 0,
    ticker: wordA
      ? fitSize(wordA, LED_FONT, px(460 * 0.62), { max: px(54) })
      : 0,
    finger: 0,
    mega: 0,
  };
  const blastOut = interpolate(t - CUE_B, [0, 0.3], [0, 1], {
    ...CLAMP,
    easing: EASE.out,
  });

  const heroPoint: Vec3 | null =
    t < 0.8
      ? pillPos
      : t < CUE_B - 0.02
        ? bubbleAnchor
        : jumboOn
          ? jumboPos
          : null;
  const heroProj = heroPoint ? project(heroPoint, cam) : null;
  const heroDepth = heroProj && heroProj.visible ? heroProj.depth : Infinity;
  const clearR =
    t >= swingStart && t < CUE_B
      ? {
          rx: px(380),
          ry: px(260),
          on: interpolate(t, [swingStart, swingStart + 0.15], [0, 1], CLAMP),
        }
      : jumboOn
        ? {
            rx: px(540),
            ry: px(430),
            on: interpolate(t - CUE_B, [0, 0.12], [0.4, 1], CLAMP),
          }
        : null;

  const sprites: StormSprite[] = [];
  if (wordA) {
    STORM.forEach((s, i) => {
      if (t < s.spawn) return;
      const age = t - s.spawn;
      const burst = interpolate(age, [0, 0.35], [0.22, 1], {
        ...CLAMP,
        easing: EASE.out,
      });
      const rad = s.radius * burst * (1 + 0.7 * blastOut) * u;
      const ang = s.angle + s.swirl * age + 0.6 * blastOut;
      const p = v3(
        STORM_AXIS.x * u + Math.cos(ang) * rad,
        STORM_AXIS.y * u + Math.sin(ang) * rad,
        (s.z0 + s.vz * age + 500 * blastOut) * u,
      );
      const pr = project(p, cam);
      if (!pr.visible || pr.depth < px(140)) return;
      const popK = spring({
        frame: frame - s.spawn * fps,
        fps,
        config: SPRING.snappy,
      });
      const scale = pr.scale * popK;
      if (scale < 0.02 || scale > 4.5) return;
      let sx = pr.x;
      let sy = pr.y;
      const near = pr.depth < heroDepth;
      const [bw, bh] = KIND_SIZE[s.kind];
      const halfSize = (Math.max(bw, bh) * s.size * u * scale) / 2;
      if (near && clearR && heroProj && heroProj.visible) {
        const dx = sx - heroProj.x;
        const dy = sy - heroProj.y;
        const e = Math.hypot(dx / clearR.rx, dy / clearR.ry);
        // Keep the whole sprite (not just its centre) off the hero.
        const edge = 1.05 + (halfSize * 0.8) / clearR.rx;
        if (e < edge) {
          const target = edge + 0.15 * e;
          const k = 1 + (target / Math.max(0.05, e) - 1) * clearR.on;
          sx = heroProj.x + dx * k;
          sy = heroProj.y + dy * k;
        }
      }
      if (Math.abs(sx) - halfSize > width * 0.55) return;
      if (Math.abs(sy) - halfSize > height * 0.55) return;
      const focus = px(900);
      const blur =
        Math.min(
          pr.depth < focus ? 12 : 5,
          Math.abs(1 / pr.depth - 1 / focus) *
            focus *
            (pr.depth < focus ? 7 : 4.2),
        ) * u;
      const dim = interpolate(pr.depth, [px(900), px(3200)], [1, 0.55], CLAMP);
      sprites.push({
        key: i,
        seed: s,
        sx: width / 2 + sx,
        sy: height / 2 + sy,
        scale,
        depth: pr.depth,
        rx: s.rx0 + 22 * Math.sin(age * 5 + s.wob),
        ry: s.ry0 + 30 * Math.sin(age * 4 + s.wob * 1.3),
        rz: s.rz0 + s.vrz * age - cam.roll,
        blur: px(0.5) + blur,
        dim,
        // Whoosh past: fade out the last stretch before the lens.
        fade: interpolate(pr.depth, [px(170), px(360)], [0, 1], CLAMP),
      });
    });
  }
  sprites.sort((a, b) => b.depth - a.depth);
  const farSprites = sprites.filter((s) => s.depth >= heroDepth);
  const nearSprites = sprites.filter((s) => s.depth < heroDepth);

  /* --- Cut treatment --- */
  const zoomBlur = interpolate(t, [0, 0.1], [px(18), 0], {
    ...CLAMP,
    easing: EASE.out,
  });
  const openScale = interpolate(t, [0, 0.16], [1.22, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const speedLines = interpolate(t, [0, 0.16], [1, 0], CLAMP);
  const exitFlash = interpolate(t, [LEN - 0.12, LEN - 0.02], [0, 1], {
    ...CLAMP,
    easing: EASE.in,
  });
  const signalFlash = 0.6 * kick(t, CUE_B, 0.05);

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur x={zoomBlur} y={zoomBlur}>
        <AbsoluteFill style={{ scale: String(openScale) }}>
          <StadiumSky camera={cam} seconds={reel} pulse={pulse} />
          <StormLayer
            sprites={farSprites}
            word={wordA}
            fits={fits}
            u={u}
            t={t}
          />
          <Stage3D camera={cam}>
            {/* Megaphone */}
            <Node3D
              x={back.x}
              y={back.y}
              z={back.z}
              rx={MEGA_RX + 30 * recoil}
              ry={MEGA_RY}
              rz={-20 * recoil}
            >
              <div
                style={{
                  position: "relative",
                  width: 0,
                  height: 0,
                  transformStyle: "preserve-3d",
                }}
              >
                <Megaphone3D u={u} t={t} pulse={pulse} />
              </div>
            </Node3D>
            {/* Slot 1 */}
            {pillVisible ? (
              <Node3D
                x={pillPos.x}
                y={pillPos.y}
                z={pillPos.z}
                rx={cam.pitch}
                ry={cam.yaw + interpolate(shot, [0, 1], [55, -6]) - 25 * away}
                rz={cam.roll + interpolate(shot, [0, 1], [-24, -5]) + 40 * away}
                scale={pillScale}
              >
                <ChatPill
                  word={wordA}
                  fontSize={pillFs}
                  textW={pillTextW}
                  u={u}
                />
              </Node3D>
            ) : null}
            {/* Typing bubble swinging in on its left edge */}
            {bubbleOn ? (
              <Node3D
                x={bubbleAnchor.x}
                y={bubbleAnchor.y}
                z={bubbleAnchor.z}
                rx={bubbleCam.pitch}
                ry={bubbleCam.yaw}
                rz={bubbleCam.roll}
                scale={1 + 0.3 * pop}
              >
                <div
                  style={{
                    position: "relative",
                    width: 0,
                    height: 0,
                    transformStyle: "preserve-3d",
                  }}
                >
                  <Node3D
                    x={-bubbleW / 2}
                    ry={interpolate(swing, [0, 1], [-72, 0])}
                    rz={interpolate(swing, [0, 1], [8, -3])}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: 0,
                        height: 0,
                        transformStyle: "preserve-3d",
                      }}
                    >
                      <Node3D x={bubbleW / 2}>
                        <TypingBubble
                          w={bubbleW}
                          h={bubbleH}
                          u={u}
                          reel={reel}
                          t={t}
                        />
                      </Node3D>
                    </div>
                  </Node3D>
                </div>
              </Node3D>
            ) : null}
            {/* Slot 2 on the jumbotron */}
            {jumboOn ? (
              <Node3D
                x={jumboPos.x}
                y={jumboPos.y}
                z={jumboPos.z}
                rx={jumboCam.pitch + interpolate(slam, [0, 1], [22, 0])}
                ry={jumboCam.yaw}
                rz={jumboCam.roll + interpolate(slam, [0, 1], [-7, 0])}
              >
                <Jumbotron
                  word={wordB}
                  fs={jumboFs}
                  squeeze={squeeze}
                  u={u}
                  t={t}
                  reel={reel}
                  pulse={pulse}
                />
              </Node3D>
            ) : null}
          </Stage3D>
          <StormLayer
            sprites={nearSprites}
            word={wordA}
            fits={fits}
            u={u}
            t={t}
          />
        </AbsoluteFill>
      </WhipBlur>
      {/* Zoom-blur speed lines out of the previous scene's push */}
      {speedLines > 0.01 ? (
        <svg
          width={width}
          height={height}
          style={{
            position: "absolute",
            inset: 0,
            opacity: speedLines,
            mixBlendMode: "screen",
          }}
        >
          {new Array(44).fill(0).map((_, i) => {
            const a = (i / 44) * Math.PI * 2 + random(`mega-sl-${i}`) * 0.1;
            const r0 = height * (0.22 + random(`mega-sl-r-${i}`) * 0.2);
            const r1 = r0 + height * (0.25 + random(`mega-sl-l-${i}`) * 0.35);
            return (
              <line
                key={i}
                x1={width / 2 + Math.cos(a) * r0}
                y1={height / 2 + Math.sin(a) * r0}
                x2={width / 2 + Math.cos(a) * r1}
                y2={height / 2 + Math.sin(a) * r1}
                stroke={i % 5 === 0 ? stadium.volt : stadium.flood}
                strokeOpacity={0.55}
                strokeWidth={px(3 + random(`mega-sl-w-${i}`) * 5)}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
      ) : null}
      {/* Signal flash on the jumbotron hit (edges only, the word stays clean) */}
      {signalFlash > 0.01 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(80% 62% at 50% 48%, rgba(255,90,54,0) 55%, rgba(255,90,54,0.75) 100%)`,
            opacity: signalFlash,
          }}
        />
      ) : null}
      <Flash opacity={exitFlash} />
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const megaphoneSceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const MegaphoneScene = Interactive.withSchema({
  Component: MegaphoneSceneInner,
  componentName: "<MegaphoneScene>",
  schema: megaphoneSceneSchema,
  wrapInSequence: true,
});
