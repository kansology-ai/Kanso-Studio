import type React from "react";
import { useMemo } from "react";
import {
  AbsoluteFill,
  Interactive,
  interpolate,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Box3D, ExtrudedText } from "../../../components/Solids3D";
import { Node3D, Plane3D, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE } from "../../../lib/animation";
import {
  mixCamera,
  orbitCamera,
  project,
  shake,
  type Camera,
  type Vec3,
} from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { BroadcastFinish, FieldFloor, Flash, WhipBlur } from "../kit/fx";
import {
  charAdvances,
  useFontReady,
  type FontSpec,
} from "../kit/JerseyMeasure";
import { StadiumSky } from "../kit/StadiumSky";
import { localCues, splitSlots, TRAINING_SEASON_TIMING } from "../timing";

/**
 * Scene 1, JERSEY (reel 0.0-1.8 s). Each lyric slot is the arched name on
 * the back of a giant jersey: varsity letters with a volt outline and a
 * navy extrusion, set on an arc, standing in front of a split-flap jersey
 * number that flips 07 → 12 → 23 on the cues. Night field, low camera.
 *
 * Slot 1 is already slamming in on frame 0. Slot 2: the camera whips down
 * and sideways to the second jersey. Slot 3 lands on top of slot 2 and the
 * camera orbits the stack, then whips up into the sky.
 */

const DEG = Math.PI / 180;
const CUES = localCues("jersey", TRAINING_SEASON_TIMING.cues.jersey);
const VARSITY: FontSpec = { family: fonts.varsity, weight: 400 };

/** Jersey number shown after each cue (the boards flip through these). */
const NUMBERS = ["07", "12", "23"] as const;

// World layout in design px (wrapped in px() where used). +y is down.
const FLOOR = 1180;
const S1: Vec3 = { x: 0, y: 0, z: 0 };
const S2: Vec3 = { x: 1450, y: 330, z: -760 };
/** Arched names are fitted to this chord width. */
const WORD_CHORD = 940;
const FS_MAX = 500;
const FS_MIN = 56;
const CARD_W = 420;
const CARD_H = 600;
const CARD_GAP = 26;
const BOARD_PAD = 30;
const BOARD_DEPTH = 70;
/** Board centre below the bottom of the name / behind it. */
const BOARD_DROP = 285;
const BOARD_BACK = 300;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------
// Arched name layout
// ---------------------------------------------------------------------------

type ArcGlyph = {
  readonly ch: string;
  /** Baseline point of the glyph (relative to the word's baseline centre). */
  readonly x: number;
  readonly y: number;
  /** Tangent rotation in degrees. */
  readonly rot: number;
};

type ArcLine = {
  readonly glyphs: ArcGlyph[];
  /** Baseline centre of the line within the block (block centred on 0). */
  readonly y: number;
};

type ArcLayout = {
  readonly lines: ArcLine[];
  readonly fs: number;
  /** Visual height of the whole block. */
  readonly height: number;
};

const TRACKING = 0.035;
/** Below this single-line size, a multi-word slot splits onto two arches. */
const TWO_LINE_BELOW = 250;
const CAP = 0.78;

const sweepFor = (n: number) => (n <= 1 ? 0 : Math.min(36, 4 + n * 5.2)) * DEG;

/** Font size that fits a line of these advances to WORD_CHORD. */
const fitLine = (adv: number[]): number => {
  const sweep = sweepFor(adv.length);
  const L1 = adv.reduce((s, a) => s + a + TRACKING, 0) - TRACKING;
  const sinc = sweep > 0.001 ? Math.sin(sweep / 2) / (sweep / 2) : 1;
  return WORD_CHORD / Math.max(0.01, L1 * sinc);
};

/** One line on a gentle upward arch (ends lower than the middle). */
const arcLine = (
  text: string,
  adv: number[],
  fs: number,
): { glyphs: ArcGlyph[]; sag: number } => {
  const chars = Array.from(text);
  const sweep = sweepFor(chars.length);
  const L = (adv.reduce((s, a) => s + a + TRACKING, 0) - TRACKING) * fs;
  const R = sweep > 0.001 ? L / sweep : 0;
  let s = -L / 2;
  const glyphs = chars.map((ch, i) => {
    const w = adv[i] * fs;
    const mid = s + w / 2;
    s += (adv[i] + TRACKING) * fs;
    if (R === 0) {
      return { ch, x: mid, y: 0, rot: 0 };
    }
    const th = mid / R;
    return {
      ch,
      x: R * Math.sin(th),
      y: R * (1 - Math.cos(th)),
      rot: th / DEG,
    };
  });
  return { glyphs, sag: R === 0 ? 0 : R * (1 - Math.cos(sweep / 2)) };
};

/**
 * Lay a slot out as an arched jersey name fitted to WORD_CHORD. Long
 * multi-word slots split at the most balanced space onto two arches so the
 * letters stay big.
 */
const layoutName = (
  text: string,
  advOf: (s: string) => number[],
): ArcLayout => {
  let rows = [text];
  const single = fitLine(advOf(text));
  const words = text.split(/\s+/).filter(Boolean);
  if (single < TWO_LINE_BELOW && words.length > 1) {
    let best = rows;
    let bestFs = single;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(" ");
      const b = words.slice(k).join(" ");
      const f = Math.min(fitLine(advOf(a)), fitLine(advOf(b)));
      if (f > bestFs) {
        bestFs = f;
        best = [a, b];
      }
    }
    rows = best;
  }
  const cap = rows.length > 1 ? FS_MAX * 0.72 : FS_MAX;
  const fs = clamp(
    Math.min(...rows.map((r) => fitLine(advOf(r)))),
    FS_MIN,
    cap,
  );
  const gap = fs * 0.9;
  const arcs = rows.map((r) => arcLine(r, advOf(r), fs));
  const top = -CAP * fs;
  const bottom = (rows.length - 1) * gap + arcs[arcs.length - 1].sag;
  const centre = (top + bottom) / 2;
  return {
    lines: arcs.map((a, i) => ({ glyphs: a.glyphs, y: i * gap - centre })),
    fs,
    height: bottom - top,
  };
};

type LetterMotion = (i: number, n: number) => { flip: number; lift: number };

const ArchedName: React.FC<{
  readonly layout: ArcLayout;
  readonly motion?: LetterMotion;
  readonly glow: number;
}> = ({ layout, motion, glow }) => {
  const { px } = useLayout();
  const { lines, fs } = layout;
  const all = lines.flatMap((line) =>
    line.glyphs.map((g) => ({ ...g, y: g.y + line.y })),
  );
  const n = all.length;
  return (
    <>
      {all.map((g, i) => {
        if (g.ch.trim() === "") {
          return null;
        }
        const m = motion ? motion(i, n) : { flip: 0, lift: 0 };
        return (
          <Node3D key={i} x={px(g.x)} y={px(g.y + m.lift)} rz={g.rot}>
            <Node3D rx={m.flip}>
              <Node3D y={-px(fs) * (CAP / 2)}>
                <ExtrudedText
                  depth={px(fs * 0.24)}
                  layers={12}
                  face={stadium.flood}
                  sideLight={stadium.navyLight}
                  sideDark={stadium.night}
                  stroke={{ color: stadium.volt, width: px(fs * 0.075) }}
                  textStyle={{
                    fontFamily: fonts.varsity,
                    fontSize: px(fs),
                    lineHeight: 1,
                  }}
                  faceStyle={{
                    filter: `drop-shadow(0 0 ${px(fs * 0.05)}px rgba(215,255,46,${0.12 + 0.3 * glow}))`,
                  }}
                >
                  {g.ch}
                </ExtrudedText>
              </Node3D>
            </Node3D>
          </Node3D>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// Split-flap jersey number
// ---------------------------------------------------------------------------

type Flip = { readonly at: number; readonly from: string; readonly to: string };

const FLIP_SECONDS = 0.2;

/** Flap angle: falls toward the viewer (0 → -180°), then a small rebound. */
const flapAngle = (t: number, at: number): number => {
  const p = (t - at) / FLIP_SECONDS;
  if (p <= 0) return 0;
  if (p < 1) return -180 * p * p;
  const u = t - at - FLIP_SECONDS;
  return -180 + 18 * Math.exp(-u * 16) * Math.abs(Math.sin(u * 28));
};

const HalfCard: React.FC<{
  readonly digit: string;
  readonly half: "top" | "bottom";
  readonly at?: "top" | "bottom";
  readonly shade?: number;
}> = ({ digit, half, at = half, shade = 0 }) => {
  const { px } = useLayout();
  const w = px(CARD_W);
  const h = px(CARD_H);
  const r = px(26);
  const isTop = half === "top";
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: at === "top" ? 0 : h / 2,
        width: w,
        height: h / 2,
        overflow: "hidden",
        borderRadius: isTop ? `${r}px ${r}px 0 0` : `0 0 ${r}px ${r}px`,
        background: isTop
          ? `linear-gradient(180deg, ${stadium.navyMid} 0%, ${stadium.navy} 100%)`
          : `linear-gradient(180deg, ${stadium.navy} 0%, ${stadium.night} 100%)`,
        boxShadow: `inset 0 0 0 ${px(3)}px rgba(135,150,192,0.35)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: isTop ? 0 : -h / 2,
          width: w,
          height: h,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.varsity,
          fontSize: px(CARD_H * 0.74),
          lineHeight: 1,
          color: stadium.flood,
          paddingTop: px(CARD_H * 0.04),
        }}
      >
        {digit}
      </div>
      {shade !== 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              shade > 0
                ? `rgba(2,5,14,${shade})`
                : `rgba(246,248,255,${-shade})`,
          }}
        />
      ) : null}
    </div>
  );
};

const FlapCard: React.FC<{
  readonly flips: Flip[];
  readonly t: number;
}> = ({ flips, t }) => {
  const { px } = useLayout();
  const w = px(CARD_W);
  const h = px(CARD_H);
  let active: Flip | null = null;
  for (const f of flips) {
    if (t >= f.at) active = f;
  }
  const first = flips[0];
  const cur = active ? active.from : first.from;
  const next = active ? active.to : first.from;
  const angle = active ? flapAngle(t, active.at) : 0;
  const landed = active ? t - active.at >= FLIP_SECONDS : true;
  const moving = active !== null && Math.abs(angle) > 0.5 && !(landed && angle <= -179.5);
  const fall = Math.sin(-angle * DEG);
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        transformStyle: "preserve-3d",
      }}
    >
      <HalfCard digit={next} half="top" />
      <HalfCard
        digit={landed ? next : cur}
        half="bottom"
        shade={moving && !landed ? 0.45 * Math.sqrt(fall) : 0}
      />
      {moving ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: w,
            height: h / 2,
            transformOrigin: "50% 100%",
            transform: `translateZ(${px(2)}px) rotateX(${angle}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          {angle > -90 ? (
            <HalfCard digit={cur} half="top" shade={0.6 * fall} />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: "scaleY(-1)",
              }}
            >
              <HalfCard
                digit={next}
                half="bottom"
                at="top"
                shade={-0.18 * fall}
              />
            </div>
          )}
        </div>
      ) : null}
      {/* Hinge line and pins */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: h / 2 - px(4),
          width: w,
          height: px(8),
          background: stadium.night,
          transform: `translateZ(${px(1)}px)`,
          boxShadow: `0 ${px(3)}px 0 rgba(246,248,255,0.10)`,
        }}
      />
      {[0, 1].map((k) => (
        <div
          key={k}
          style={{
            position: "absolute",
            left: k === 0 ? -px(8) : w - px(10),
            top: h / 2 - px(22),
            width: px(18),
            height: px(44),
            borderRadius: px(5),
            background: `linear-gradient(90deg, ${stadium.steel}, ${stadium.navyLight})`,
            transform: `translateZ(${px(3)}px)`,
          }}
        />
      ))}
    </div>
  );
};

/** Per-digit flips from a list of whole-number flips (unchanged digits stay). */
const digitFlips = (flips: Flip[], index: number, delay: number): Flip[] => {
  const out = flips
    .filter((f) => f.from[index] !== f.to[index])
    .map((f) => ({
      at: f.at + delay,
      from: f.from[index] ?? "",
      to: f.to[index] ?? "",
    }));
  if (out.length === 0) {
    const d = flips[flips.length - 1]?.to[index] ?? "";
    return [{ at: Infinity, from: d, to: d }];
  }
  return out;
};

const FlapBoard: React.FC<{
  readonly flips: Flip[];
  readonly t: number;
  readonly pulse: number;
}> = ({ flips, t, pulse }) => {
  const { px } = useLayout();
  const bw = CARD_W * 2 + CARD_GAP + BOARD_PAD * 2;
  const bh = CARD_H + BOARD_PAD * 2;
  const edge = `inset 0 0 0 ${px(3)}px rgba(246,248,255,0.55)`;
  return (
    <>
      <Box3D
        width={px(bw)}
        height={px(bh)}
        depth={px(BOARD_DEPTH)}
        colors={{
          front: `linear-gradient(180deg, ${stadium.navy} 0%, ${stadium.night} 100%)`,
          side: `linear-gradient(180deg, ${stadium.navyMid} 0%, ${stadium.night} 100%)`,
          top: stadium.navyLight,
          bottom: stadium.night,
        }}
        faceStyle={{ boxShadow: edge }}
      />
      {/* Volt varsity trim under the cards */}
      {[0, 1].map((k) => (
        <Node3D
          key={k}
          y={px(bh / 2 - 12 - k * 16)}
          z={px(BOARD_DEPTH / 2 + 1)}
        >
          <div
            style={{
              width: px(bw - 80),
              height: px(7),
              background: stadium.volt,
              opacity: 0.75 + 0.25 * pulse,
              boxShadow: `0 0 ${px(12)}px rgba(215,255,46,${0.35 + 0.4 * pulse})`,
            }}
          />
        </Node3D>
      ))}
      {[0, 1].map((k) => (
        <Node3D
          key={k}
          x={px((k === 0 ? -1 : 1) * (CARD_W + CARD_GAP) * 0.5)}
          z={px(BOARD_DEPTH / 2 + 2)}
        >
          <FlapCard flips={digitFlips(flips, k, k * 0.045)} t={t} />
        </Node3D>
      ))}
    </>
  );
};

/** A jersey board on two posts, standing on the turf. */
const NumberStand: React.FC<{
  readonly at: Vec3;
  readonly flips: Flip[];
  readonly t: number;
  readonly pulse: number;
  readonly jolt?: number;
}> = ({ at, flips, t, pulse, jolt = 0 }) => {
  const { px } = useLayout();
  const bh = CARD_H + BOARD_PAD * 2;
  const bottom = at.y + bh / 2;
  const postH = FLOOR - bottom;
  return (
    <>
      <Node3D x={px(at.x)} y={px(at.y + jolt)} z={px(at.z)}>
        <FlapBoard flips={flips} t={t} pulse={pulse} />
      </Node3D>
      {postH > 0
        ? [-1, 1].map((k) => (
            <Node3D
              key={k}
              x={px(at.x + k * 230)}
              y={px(bottom + postH / 2)}
              z={px(at.z - 4)}
            >
              <Box3D
                width={px(26)}
                height={px(postH)}
                depth={px(26)}
                colors={{
                  front: `linear-gradient(90deg, ${stadium.steel}, ${stadium.navyLight})`,
                  side: stadium.navyMid,
                  top: stadium.steel,
                }}
              />
            </Node3D>
          ))
        : null}
      {/* Contact shadow + light pool on the turf */}
      <Plane3D
        x={px(at.x)}
        y={px(FLOOR - 2)}
        z={px(at.z + 120)}
        rx={90}
        width={px(1500)}
        height={px(900)}
        background="radial-gradient(closest-side, rgba(246,248,255,0.16) 0%, rgba(246,248,255,0.05) 55%, rgba(246,248,255,0) 100%)"
      />
      <Plane3D
        x={px(at.x)}
        y={px(FLOOR - 3)}
        z={px(at.z)}
        rx={90}
        width={px(820)}
        height={px(180)}
        background="radial-gradient(closest-side, rgba(2,5,14,0.65) 0%, rgba(2,5,14,0) 100%)"
      />
    </>
  );
};

/** Anamorphic light streak through a word on its hit. */
const HitStreak: React.FC<{
  readonly y: number;
  readonly x: number;
  readonly amount: number;
}> = ({ y, x, amount }) => {
  const { px, width, height } = useLayout();
  if (amount < 0.01) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      <div
        style={{
          position: "absolute",
          left: -width * 0.25 + x * 0.5,
          width: width * 1.5,
          top: height / 2 + y - px(12),
          height: px(24),
          background: `linear-gradient(90deg, rgba(215,255,46,0) 0%, rgba(215,255,46,${0.7 * amount}) 35%, rgba(255,255,255,${amount}) 50%, rgba(215,255,46,${0.7 * amount}) 65%, rgba(215,255,46,0) 100%)`,
          filter: `blur(${px(5)}px)`,
          scale: `${0.6 + 0.6 * (1 - amount)} 1`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: width / 2 + x - px(260),
          top: height / 2 + y - px(260),
          width: px(520),
          height: px(520),
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(246,248,255,${0.5 * amount}) 0%, rgba(215,255,46,${0.18 * amount}) 40%, rgba(215,255,46,0) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Screen-space motion (px per frame) of the view centre between two cameras. */
const viewMotion = (prev: Camera, cur: Camera, depth: number) => {
  const yaw = prev.yaw * DEG;
  const pitch = prev.pitch * DEG;
  const p = {
    x: prev.x - Math.sin(yaw) * Math.cos(pitch) * depth,
    y: prev.y + Math.sin(pitch) * depth,
    z: prev.z - Math.cos(yaw) * Math.cos(pitch) * depth,
  };
  const pr = project(p, cur);
  return { x: Math.abs(pr.x), y: Math.abs(pr.y) };
};

/** Quick punch envelope: up in ~1 frame, settled by ~0.3 s. */
const punch = (x: number) => (x < 0 ? 0 : Math.min(1, x * 30) * Math.exp(-x * 10));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

type JerseySceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const JerseySceneInner: React.FC<JerseySceneProps> = ({ words, style }) => {
  const { t, reel, fps, frame, pulse } = useSceneClock("jersey");
  const { px } = useLayout();
  const ready = useFontReady(VARSITY);

  const slots = useMemo(() => splitSlots(words).slice(0, 3), [words]);
  const layouts = useMemo(
    () =>
slots.map((s) =>
        layoutName(s, (x) =>
          ready ? charAdvances(x, VARSITY) : Array.from(x).map(() => 0.7),
        ),
      ),
    [slots, ready],
  );

  const [c1, c2, c3] = CUES;
  const h1 = layouts[0]?.height ?? FS_MAX * CAP;
  const h2 = layouts[1]?.height ?? FS_MAX * CAP;
  const h3 = layouts[2]?.height ?? FS_MAX * CAP;
  /** Slot 3 sits this far above slot 2. */
  const stackGap = (h2 + h3) / 2 + 24;
  const S3: Vec3 = { x: S2.x, y: S2.y - stackGap, z: S2.z + 40 };

  const board1: Vec3 = { x: S1.x, y: S1.y + h1 / 2 + BOARD_DROP, z: S1.z - BOARD_BACK };
  const board2: Vec3 = { x: S2.x, y: S2.y + h2 / 2 + BOARD_DROP, z: S2.z - BOARD_BACK };
  const flips1: Flip[] = [{ at: -0.12, from: "00", to: NUMBERS[0] }];
  const flips2: Flip[] = [
    { at: c2, from: NUMBERS[0], to: NUMBERS[1] },
    { at: c3, from: NUMBERS[1], to: NUMBERS[2] },
  ];

  // --- Camera ------------------------------------------------------------
  const stackTop = S3.y - h3 / 2;
  const stackBottom = board2.y + (CARD_H + BOARD_PAD * 2) / 2;
  const stackExtent = stackBottom - stackTop;
  const F = px(940);
  const camAt = (time: number): Camera => {
    const toPx = (v: Vec3): Vec3 => ({ x: px(v.x), y: px(v.y), z: px(v.z) });
    // A: slot 1, slow push and orbit.
    const a = clamp(time / 0.5, 0, 1);
    const camA = orbitCamera({
      target: toPx({ x: S1.x + 30, y: S1.y + 230, z: S1.z - 60 }),
      distance: px(lerp(1220, 1120, a)),
      azimuth: lerp(-13, -5, a),
      elevation: -17,
      roll: lerp(-1.5, 0.5, a),
      focal: F,
    });
    // Opening: the reel starts mid-whip (yaw settling in from the left).
    const open = interpolate(time, [-0.05, 0.14], [1, 0], {
      ...CLAMP,
      easing: EASE.out,
    });
    camA.yaw += 10 * open;
    // B: slot 2, low and to the right.
    const b = clamp((time - c2) / 0.35, 0, 1);
    const camB = orbitCamera({
      target: toPx({ x: S2.x + 30, y: S2.y + 210, z: S2.z - 60 }),
      distance: px(lerp(1240, 1180, b)),
      azimuth: lerp(15, 19, b),
      elevation: -21,
      roll: -2.5,
      focal: F,
    });
    // C: the slot 2 + 3 stack, orbiting with a slight roll.
    const c = clamp((time - c3) / (1.55 - c3), 0, 1);
    const camC = orbitCamera({
      target: toPx({
        x: S2.x,
        y: (stackTop + stackBottom) / 2 - 20,
        z: S2.z - 120,
      }),
      distance: px(lerp(1420, 1330, c) * Math.max(1, stackExtent / 1380)),
      azimuth: lerp(21, 40, c),
      elevation: lerp(-15, -9, c),
      roll: lerp(-1, 5, c),
      focal: F,
    });
    const w1 = spring({
      frame: (time - (c2 - 0.13)) * fps,
      fps,
      config: { damping: 20, stiffness: 400, mass: 0.42 },
    });
    const w2 = spring({
      frame: (time - (c3 - 0.03)) * fps,
      fps,
      config: { damping: 18, stiffness: 240, mass: 0.6 },
    });
    let cam = mixCamera(mixCamera(camA, camB, w1), camC, w2);
    // Exit: whip-pan up into the sky.
    const ex = interpolate(time, [1.52, 1.77], [0, 1], {
      ...CLAMP,
      easing: EASE.in,
    });
    cam = { ...cam, pitch: cam.pitch - 88 * ex, y: cam.y - px(420) * ex };
    // Cue punches: push in + roll kick, settled within ~0.25 s.
    const k =
      punch(time - c1 + 0.02) * 0.6 + punch(time - c2) + punch(time - c3) * 1.1;
    cam = {
      ...cam,
      focal: cam.focal * (1 + 0.075 * k),
      roll: cam.roll + 2.2 * k * (time > c3 ? -1 : 1),
    };
    return shake(cam, time + 0.3, { amount: 0.7 + 1.6 * k, speed: 3.2, seed: "jersey" });
  };

  const cam = camAt(t);
  const prevCam = camAt(t - 1 / fps);
  const motion = viewMotion(prevCam, cam, px(1300));
  const exitBlur = interpolate(t, [1.52, 1.77], [0, px(40)], {
    ...CLAMP,
    easing: EASE.in,
  });
  const openBlur = interpolate(frame, [0, 4], [px(26), 0], CLAMP);
  const blurX = Math.max(openBlur, Math.min(px(45), motion.x * 0.25));
  const blurY = Math.max(exitBlur, Math.min(px(45), motion.y * 0.25));

  // --- Slot motion --------------------------------------------------------
  const slam1 = interpolate(frame, [0, 4], [1.35, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const f2 = Math.ceil(c2 * fps - 1e-6);
  const f3 = Math.ceil(c3 * fps - 1e-6);
  const show2 = frame >= f2;
  const show3 = frame >= f3;
  const scale2 = interpolate(frame, [f2, f2 + 5], [1.16, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const motion2: LetterMotion = (i) => {
    const s = spring({
      frame: frame - f2 - i * 0.7 + 1,
      fps,
      config: { damping: 14, stiffness: 220, mass: 0.6 },
    });
    return { flip: -78 * (1 - s), lift: 0 };
  };
  const land3 = spring({
    frame: frame - f3 + 1.4,
    fps,
    config: { damping: 17, stiffness: 300, mass: 0.5 },
  });
  const drop3 = -460 * (1 - land3);
  const motion3: LetterMotion = (i, n) => {
    const s = spring({
      frame: frame - f3 + 1.4 - Math.abs(i - (n - 1) / 2) * 0.6,
      fps,
      config: { damping: 17, stiffness: 300, mass: 0.5 },
    });
    return { flip: 0, lift: -460 * (1 - s) - drop3 };
  };
  // Slot 2 gets knocked down a touch when slot 3 lands on it.
  const hitX = t - (c3 + 0.07);
  const jolt =
    hitX > 0 ? 30 * Math.exp(-hitX * 14) * Math.sin(hitX * 34) : 0;

  const glowFor = (cue: number) => Math.max(pulse * 0.6, Math.exp(-Math.max(0, t - cue) * 6));

  const flash =
    0.22 * Math.exp(-Math.max(0, t - c2) * 16) * (t >= c2 ? 1 : 0) +
    0.2 * Math.exp(-Math.max(0, t - c3) * 16) * (t >= c3 ? 1 : 0) +
    interpolate(t, [1.66, 1.8], [0, 0.12], CLAMP);

  const streakAt = (p: Vec3, cue: number, on: boolean) => {
    const pr = project({ x: px(p.x), y: px(p.y), z: px(p.z) }, cam);
    const x = t - cue;
    return {
      x: pr.x,
      y: pr.y,
      amount: on && pr.visible && x >= 0 ? Math.exp(-x * 9) : 0,
    };
  };
  const streaks = [
    streakAt(S1, c1, Boolean(layouts[0])),
    streakAt({ ...S2, y: S2.y + jolt }, c2, Boolean(layouts[1])),
    streakAt({ ...S3, y: S3.y + drop3 }, c3, Boolean(layouts[2])),
  ];

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur x={blurX} y={blurY}>
        <StadiumSky camera={cam} seconds={reel} pulse={pulse} horizon={0.5} />
        <Stage3D camera={cam}>
          <FieldFloor variant="turf" y={px(FLOOR)} x={px(700)} z={px(-400)} />
          <NumberStand at={board1} flips={flips1} t={t} pulse={pulse} />
          <NumberStand
            at={board2}
            flips={flips2}
            t={t}
            pulse={pulse}
            jolt={jolt * 0.4}
          />
          {layouts[0] && t < 0.85 ? (
            <Node3D x={px(S1.x)} y={px(S1.y)} z={px(S1.z)} scale={slam1}>
              <ArchedName layout={layouts[0]} glow={glowFor(c1)} />
            </Node3D>
          ) : null}
          {layouts[1] && show2 ? (
            <Node3D
              x={px(S2.x)}
              y={px(S2.y + jolt)}
              z={px(S2.z)}
              scale={scale2}
            >
              <ArchedName layout={layouts[1]} motion={motion2} glow={glowFor(c2)} />
            </Node3D>
          ) : null}
          {layouts[2] && show3 ? (
            <Node3D x={px(S3.x)} y={px(S3.y + drop3)} z={px(S3.z)}>
              <ArchedName layout={layouts[2]} motion={motion3} glow={glowFor(c3)} />
            </Node3D>
          ) : null}
        </Stage3D>
      </WhipBlur>
      {streaks.map((st, i) => (
        <HitStreak key={i} x={st.x} y={st.y} amount={st.amount} />
      ))}
      <Flash opacity={flash} />
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const jerseySceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const JerseyScene = Interactive.withSchema({
  Component: JerseySceneInner,
  componentName: "<JerseyScene>",
  schema: jerseySceneSchema,
  wrapInSequence: true,
});
