import type React from "react";
import { useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  random,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Billboard, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE } from "../../../lib/animation";
import { aimCamera, project, shake, type Camera } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { BroadcastFinish, FieldFloor, LedText, WhipBlur } from "../kit/fx";
import {
  RibbonBand,
  measureRibbonText,
  useRibbonFontsReady,
  type BandItem,
  type BandPanel,
  type PanelLook,
  type RibbonFont,
} from "../kit/RibbonBand";
import { StadiumSky } from "../kit/StadiumSky";
import {
  SONG,
  TRAINING_SEASON_TIMING,
  sceneLength,
  sceneStart,
  splitSlots,
} from "../timing";

/**
 * Scene 3: RIBBON BOARDS. A stack of arena LED ribbon boards spinning
 * around a vertical axis in the dark stadium. The boards power on one per
 * beat while the camera descends from above; then each lyric line is
 * written onto its own board, slot by slot, with the board turned so the
 * new slot faces the camera on its cue. The camera pulls back to show the
 * full stack of scrolling lyrics, dives back in for the last line, and
 * whips out.
 */

const T = TRAINING_SEASON_TIMING;
const START = sceneStart("ribbon");
const LENGTH = sceneLength("ribbon");
const local = (reel: number) => reel - START;
const BOOT = T.accents.ribbonBoot.map(local);
const REVEAL = T.accents.ribbonReveal.map(local);
const BPM = SONG.bpm.toFixed(2);
const DEG = Math.PI / 180;

type LineKey = "A" | "B" | "C" | "D";
const LINE_KEYS: LineKey[] = ["A", "B", "C", "D"];
const CUES: Record<LineKey, number[]> = {
  A: T.cues.ribbonA.map(local),
  B: T.cues.ribbonB.map(local),
  C: T.cues.ribbonC.map(local),
  D: T.cues.ribbonD.map(local),
};

/* ------------------------------------------------------------------ */
/* The stack                                                            */
/* ------------------------------------------------------------------ */

type Surface = "black" | "navy";
type RingDef = {
  readonly role: "ticker" | "chevron" | LineKey;
  readonly h: number;
  readonly r: number;
  readonly seg: number;
  /** Free spin in deg/s (alternating directions). */
  readonly spin: number;
  readonly phase: number;
  readonly surface: Surface;
  /** Small LED filler text, repeated around the board. */
  readonly filler: string;
  readonly fillerColor: string;
  /** Filler size as a fraction of the band height. */
  readonly fillerSize: number;
};

const RINGS: RingDef[] = [
  {
    role: "ticker",
    h: 104,
    r: 860,
    seg: 48,
    spin: 13,
    phase: 30,
    surface: "navy",
    filler: `LAP 03 · ${BPM} BPM · TRAINING DAY · NO DAYS OFF ·`,
    fillerColor: stadium.volt,
    fillerSize: 0.5,
  },
  {
    role: "A",
    h: 220,
    r: 940,
    seg: 64,
    spin: -10,
    phase: 0,
    surface: "black",
    filler: "RING 02 > > > >",
    fillerColor: stadium.volt,
    fillerSize: 0.28,
  },
  {
    role: "B",
    h: 220,
    r: 950,
    seg: 64,
    spin: 9,
    phase: 0,
    surface: "navy",
    filler: "RING 03 > > > >",
    fillerColor: stadium.flood,
    fillerSize: 0.28,
  },
  {
    role: "chevron",
    h: 84,
    r: 880,
    seg: 48,
    spin: -34,
    phase: 70,
    surface: "black",
    filler: "> > > > > > >",
    fillerColor: stadium.volt,
    fillerSize: 0.62,
  },
  {
    role: "C",
    h: 220,
    r: 945,
    seg: 64,
    spin: 11,
    phase: 0,
    surface: "black",
    filler: "RING 05 > > > >",
    fillerColor: stadium.volt,
    fillerSize: 0.28,
  },
  {
    role: "D",
    h: 220,
    r: 935,
    seg: 64,
    spin: -9,
    phase: 0,
    surface: "navy",
    filler: "RING 06 > > > >",
    fillerColor: stadium.flood,
    fillerSize: 0.28,
  },
  {
    role: "ticker",
    h: 104,
    r: 840,
    seg: 48,
    spin: 15,
    phase: 200,
    surface: "navy",
    filler: `NIGHT SESSION · VARSITY · ${BPM} BPM · RING 07 ·`,
    fillerColor: stadium.flood,
    fillerSize: 0.5,
  },
];
const GAP = 60;
const RING_OF: Record<LineKey, number> = { A: 1, B: 2, C: 4, D: 5 };

/** Lyric treatments: font, size (fraction of band height). */
const LINE_FONT: Record<LineKey, RibbonFont> = {
  A: { family: fonts.led, weight: 900, tracking: 0.02 },
  B: { family: fonts.stadium, weight: 900, tracking: 0.01 },
  C: { family: fonts.broadcast, weight: 900, italic: true, tracking: 0.01 },
  D: { family: fonts.broadcast, weight: 800, italic: true, tracking: 0.01 },
};
const LINE_SIZE: Record<LineKey, number> = {
  A: 0.84,
  B: 0.9,
  C: 0.88,
  D: 0.94,
};
/** Camera height over the band (deg of look-down) and roll per line. */
const LINE_FRAMING: Record<
  LineKey,
  { pitch: number; roll: number; aim: number }
> = {
  // aim: look-at height relative to the band centre, in band heights
  // (negative looks above it, so lower boards show more stack, less floor).
  A: { pitch: 8, roll: -3, aim: 0 },
  B: { pitch: -6, roll: 3.5, aim: 0 },
  C: { pitch: 5, roll: -4.5, aim: -0.25 },
  D: { pitch: -7, roll: 2.5, aim: -0.45 },
};

const LED_FONT: RibbonFont = { family: fonts.led, weight: 900 };
const FONT_LIST: RibbonFont[] = [
  LED_FONT,
  LINE_FONT.B,
  LINE_FONT.C,
  LINE_FONT.D,
];

/* ------------------------------------------------------------------ */
/* Camera                                                               */
/* ------------------------------------------------------------------ */

const FOCAL = 1000;
/** Lyric words must fit this on-screen width (inside x 80…940). */
const MAX_SCREEN_W = 820;
const MAX_SCALE = 1.38;
const MIN_SCALE = 0.62;

type Shot = {
  az: number;
  rho: number;
  y: number;
  /** Look-at point: radius from the axis (along az) and height. */
  tr: number;
  ty: number;
  f: number;
  roll: number;
};

const mixShot = (a: Shot, b: Shot, k: number): Shot => ({
  az: a.az + (b.az - a.az) * k,
  rho: a.rho + (b.rho - a.rho) * k,
  y: a.y + (b.y - a.y) * k,
  tr: a.tr + (b.tr - a.tr) * k,
  ty: a.ty + (b.ty - a.ty) * k,
  f: a.f + (b.f - a.f) * k,
  roll: a.roll + (b.roll - a.roll) * k,
});

const shotCamera = (s: Shot): Camera => {
  const a = s.az * DEG;
  return aimCamera(
    { x: s.rho * Math.sin(a), y: s.y, z: s.rho * Math.cos(a) },
    { x: s.tr * Math.sin(a), y: s.ty, z: s.tr * Math.cos(a) },
    s.f,
    s.roll,
  );
};

/** Smooth path through keyed shots (Hermite, keeps moving through keys). */
const spline = (keys: { t: number; s: Shot }[], t: number): Shot => {
  const last = keys.length - 1;
  const tc = Math.max(keys[0].t, Math.min(keys[last].t, t));
  let i = 0;
  while (i < last - 1 && tc > keys[i + 1].t) i++;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const dt = k1.t - k0.t;
  const u = (tc - k0.t) / dt;
  const fields: (keyof Shot)[] = ["az", "rho", "y", "tr", "ty", "f", "roll"];
  const tangent = (j: number, key: keyof Shot) => {
    const a = keys[Math.max(0, j - 1)];
    const b = keys[Math.min(last, j + 1)];
    return (b.s[key] - a.s[key]) / (b.t - a.t);
  };
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  const out = {} as Shot;
  for (const key of fields) {
    out[key] =
      h00 * k0.s[key] +
      h10 * dt * tangent(i, key) +
      h01 * k1.s[key] +
      h11 * dt * tangent(i + 1, key);
  }
  return out;
};

/** Base orbit of the camera around the stack (deg). */
const AZ = (t: number) => -24 + 5.5 * t;

/* ------------------------------------------------------------------ */
/* Lyric layout                                                         */
/* ------------------------------------------------------------------ */

type SlotLayout = {
  readonly text: string;
  readonly x: number;
  readonly w: number;
  /** Angle of the slot centre along the band (deg). */
  readonly theta: number;
  readonly cue: number;
  /** First frame on or after the cue. */
  readonly hit: number;
  /** Camera distance from the band front that frames this slot. */
  readonly d: number;
  /** Font size of this slot. */
  readonly fs: number;
  /** Horizontal squeeze of the slot's text (LED boards only, else 1). */
  readonly squeeze: number;
};

type LineLayout = {
  readonly key: LineKey;
  readonly fs: number;
  readonly slots: SlotLayout[];
  /** Angle of the whole line's centre (deg). */
  readonly centre: number;
  readonly end: number;
};

type RingGeo = RingDef & { readonly y: number; readonly c: number };

/** On-screen width of an arc `w` on radius `r` seen head-on from `d`. */
const arcScreenWidth = (w: number, r: number, d: number, f: number) => {
  const phi = Math.min(Math.PI * 0.9, w / (2 * r));
  return (2 * r * Math.sin(phi) * f) / (d + r * (1 - Math.cos(phi)));
};

const distanceFor = (w: number, r: number, f: number, target: number) => {
  let lo = f / MAX_SCALE;
  const hi = f / MIN_SCALE;
  if (arcScreenWidth(w, r, lo, f) <= target) return lo;
  let top = hi;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + top) / 2;
    if (arcScreenWidth(w, r, mid, f) > target) lo = mid;
    else top = mid;
  }
  return top;
};

const layoutLine = (
  key: LineKey,
  text: string,
  ring: RingGeo,
  fps: number,
  unit: number,
): LineLayout => {
  const cues = CUES[key];
  const all = splitSlots(text);
  const words = all.slice(0, Math.min(all.length, cues.length));
  const font = LINE_FONT[key];
  const f = FOCAL * unit;
  const padEm = font.italic ? 0.22 : 0.1;
  const gapEm = 0.5;
  const raw = words.map((w) => measureRibbonText(w, font, 1) + padEm);
  const fsMax = LINE_SIZE[key] * ring.h;
  const target = MAX_SCREEN_W * unit;
  const far = f / MIN_SCALE;
  // Each slot keeps the full board size unless it is too long to fit the
  // screen even at the farthest framing; then only that slot shrinks.
  // LED boards may run a long slot condensed before shrinking it.
  const squeezeMin = key === "A" ? 0.72 : 1;
  // Condense first (so a long slot keeps the camera close), down to the
  // limit; only then pull the camera back or shrink the type.
  const squeezes = raw.map((em) => {
    const atComfort = arcScreenWidth(em * fsMax, ring.r, f, f);
    return atComfort > target
      ? Math.max(squeezeMin, (target / atComfort) * 0.995)
      : 1;
  });
  let sizes = raw.map((em, i) => {
    let size = fsMax;
    for (let k = 0; k < 4; k++) {
      const atFar = arcScreenWidth(em * size * squeezes[i], ring.r, far, f);
      if (atFar <= target) break;
      const want = squeezes[i] * (target / atFar) * 0.995;
      const sq = Math.max(squeezeMin, want);
      size *= want / sq;
      squeezes[i] = sq;
    }
    return size;
  });
  // The whole line must fit around the board.
  const lineLength = () =>
    raw.reduce((a, em, i) => a + em * sizes[i] * squeezes[i], 0) +
    Math.max(0, words.length - 1) * gapEm * fsMax;
  if (lineLength() > ring.c * 0.92) {
    const k = (ring.c * 0.92) / lineLength();
    sizes = sizes.map((v) => v * k);
  }
  const gap = gapEm * Math.min(fsMax, ...sizes);
  let x = 0;
  const slots: SlotLayout[] = words.map((word, i) => {
    const w = raw[i] * sizes[i] * squeezes[i];
    const slot: SlotLayout = {
      text: word,
      fs: sizes[i],
      squeeze: squeezes[i],
      x,
      w,
      theta: ((x + w / 2) / ring.c) * 360,
      cue: cues[i],
      hit: Math.ceil(cues[i] * fps - 1e-6),
      d: distanceFor(w, ring.r, f, target),
    };
    x += w + gap;
    return slot;
  });
  const end = Math.max(0, x - gap);
  return {
    key,
    fs: fsMax,
    slots,
    centre: (end / 2 / ring.c) * 360,
    end,
  };
};

/** Filler units spread evenly over [from, to) along the strip. */
const fillerItems = (
  ring: RingGeo,
  index: number,
  from: number,
  to: number,
): BandItem[] => {
  const size = ring.fillerSize * ring.h;
  const unitW = measureRibbonText(ring.filler, LED_FONT, size);
  const span = to - from;
  const pad = size * 1.1;
  const count = Math.max(0, Math.floor(span / (unitW + pad)));
  if (count === 0) return [];
  const step = span / count;
  const isTicker = ring.role === "ticker" || ring.role === "chevron";
  return new Array(count).fill(0).map((_, k) => {
    const accent =
      ring.role === "chevron" && k % 3 === 1 ? stadium.signal : undefined;
    return {
      key: `f${index}-${k}`,
      x: from + k * step + (step - unitW) / 2,
      width: unitW + 2,
      node: (
        <>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingBottom: isTicker ? 0 : ring.h * 0.12,
            }}
          >
            <span
              style={{
                fontFamily: fonts.led,
                fontWeight: 900,
                fontSize: size,
                lineHeight: 1,
                whiteSpace: "pre",
                color: accent ?? "currentColor",
                textShadow: "var(--glow)",
                opacity: isTicker ? 1 : 0.62,
              }}
            >
              {ring.filler}
            </span>
          </div>
          {isTicker ? null : (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: ring.h * 0.68,
                height: Math.max(2, ring.h * 0.022),
                background: `repeating-linear-gradient(90deg, currentColor 0 ${ring.h * 0.07}px, rgba(0,0,0,0) ${ring.h * 0.07}px ${ring.h * 0.11}px)`,
                opacity: 0.4,
              }}
            />
          )}
        </>
      ),
    };
  });
};

/* ------------------------------------------------------------------ */
/* Lyric slot visuals                                                   */
/* ------------------------------------------------------------------ */

const Standby: React.FC<{ readonly h: number }> = ({ h }) => (
  <div
    style={{
      position: "absolute",
      left: "8%",
      right: "8%",
      top: h * 0.49,
      height: Math.max(2, h * 0.025),
      background: `repeating-linear-gradient(90deg, currentColor 0 ${h * 0.06}px, rgba(0,0,0,0) ${h * 0.06}px ${h * 0.1}px)`,
      opacity: 0.32,
    }}
  />
);

const SlotWord: React.FC<{
  readonly line: LineKey;
  readonly text: string;
  readonly fs: number;
  readonly h: number;
  readonly w: number;
  readonly age: number;
  readonly fps: number;
  readonly squeeze?: number;
}> = ({ line, text, fs, h, w, age, fps, squeeze = 1 }) => {
  if (age < 0) return <Standby h={h} />;
  const font = LINE_FONT[line];
  const box: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const textBase: React.CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    fontStyle: font.italic ? "italic" : "normal",
    fontSize: fs,
    letterSpacing: `${font.tracking ?? 0}em`,
    lineHeight: 1,
    whiteSpace: "pre",
  };

  if (line === "A") {
    const wipe = interpolate(age, [0, 2], [0.62, 1], CLAMP);
    const pop =
      1 +
      0.14 *
        (1 -
          spring({
            frame: age + 1,
            fps,
            config: { damping: 14, stiffness: 240, mass: 0.6 },
          }));
    return (
      <div style={box}>
        <div
          style={{
            scale: `${pop * squeeze} ${pop}`,
            clipPath: `inset(-40% ${(1 - wipe) * 100}% -40% -10%)`,
            translate: `0 ${fs * 0.035}px`,
          }}
        >
          <LedText
            color={stadium.volt}
            glow={1.2}
            style={{ ...textBase, fontFamily: fonts.led }}
          >
            {text}
          </LedText>
        </div>
        {wipe < 1 ? (
          <div
            style={{
              position: "absolute",
              top: h * 0.08,
              bottom: h * 0.08,
              left: w * 0.05 + wipe * w * 0.9,
              width: fs * 0.06,
              background: stadium.flood,
              boxShadow: `0 0 ${fs * 0.25}px ${fs * 0.08}px ${stadium.volt}`,
            }}
          />
        ) : null}
      </div>
    );
  }

  if (line === "B") {
    const p = spring({
      frame: age + 1,
      fps,
      config: { damping: 13, stiffness: 300, mass: 0.7 },
    });
    return (
      <div style={box}>
        <span
          style={{
            ...textBase,
            color: stadium.navy,
            scale: String(1.42 - 0.42 * p),
            translate: `0 ${fs * 0.02}px`,
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  if (line === "C") {
    const p = spring({
      frame: age + 2,
      fps,
      config: { damping: 15, stiffness: 230, mass: 0.6 },
    });
    return (
      <div style={box}>
        <span
          style={{
            ...textBase,
            color: stadium.flood,
            WebkitTextStroke: `${fs * 0.045}px ${stadium.volt}`,
            paintOrder: "stroke fill",
            textShadow: `0 0 ${fs * 0.16}px rgba(215,255,46,0.45)`,
            translate: `${(1 - p) * Math.min(0.4 * w, 0.9 * fs)}px ${fs * 0.03}px`,
            transform: `skewX(${-16 * (1 - p)}deg)`,
            opacity: Math.min(1, 0.45 + p),
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  // D
  const p = spring({
    frame: age + 2,
    fps,
    config: { damping: 17, stiffness: 260, mass: 0.6 },
  });
  const bar = interpolate(age, [0, 7], [0.2, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  return (
    <div style={box}>
      <div
        style={{
          position: "absolute",
          left: w * 0.06,
          right: w * 0.06,
          bottom: h * 0.05,
          height: h * 0.07,
          background: stadium.volt,
          boxShadow: `0 0 ${h * 0.12}px rgba(215,255,46,0.6)`,
          transform: `scaleX(${bar}) skewX(-14deg)`,
          transformOrigin: "0 50%",
        }}
      />
      <span
        style={{
          ...textBase,
          color: stadium.flood,
          translate: `0 ${(1 - p) * 0.4 * h - fs * 0.03}px`,
          textShadow: `0 ${fs * 0.03}px 0 ${stadium.night}`,
        }}
      >
        {text}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Board looks                                                          */
/* ------------------------------------------------------------------ */

const rgba = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

/** Brightness of the power-on scan bar, `behind` degrees behind its front. */
const scanAlpha = (behind: number) =>
  behind >= 0 && behind < 40 ? 1 - behind / 40 : 0;

/** Scan colour: a white-hot front with a volt trail. */
const scanColor = (behind: number, k = 1) => {
  const a = scanAlpha(behind);
  if (a <= 0) return "rgba(0,0,0,0)";
  return behind < 7
    ? rgba(stadium.flood, 0.95 * k)
    : rgba(stadium.volt, 0.55 * a * k);
};

/** Light burst behind a freshly written slot, by angle from the camera. */
const hitGlow = (phi: number, age: number) =>
  age >= 0 && age < 12
    ? Math.exp(-age / 2.6) * Math.max(0, 1 - Math.abs(phi) / 34) ** 1.5
    : 0;

const boardBackground = ({
  base,
  dots,
  rim,
  rimWidth,
  cell,
  stripX,
}: {
  base: string;
  dots: string;
  rim: string;
  rimWidth: number;
  cell: number;
  stripX: number;
}): React.CSSProperties => ({
  background: [
    `linear-gradient(180deg, ${rim} 0 ${rimWidth}px, rgba(0,0,0,0) ${rimWidth}px calc(100% - ${rimWidth}px), ${rim} calc(100% - ${rimWidth}px))`,
    "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 32%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.32) 100%)",
    `radial-gradient(circle, ${dots} 0 ${cell * 0.17}px, rgba(0,0,0,0) ${cell * 0.24}px)`,
    base,
  ].join(", "),
  backgroundSize: `100% 100%, 100% 100%, ${cell}px ${cell}px, auto`,
  backgroundPosition: `0 0, 0 0, ${-stripX}px 0, 0 0`,
});

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

type RibbonSceneProps = {
  readonly lineA: string;
  readonly lineB: string;
  readonly lineC: string;
  readonly lineD: string;
  readonly style?: React.CSSProperties;
};

const RibbonSceneInner: React.FC<RibbonSceneProps> = ({
  lineA,
  lineB,
  lineC,
  lineD,
  style,
}) => {
  const { frame, fps, t, reel, pulse } = useSceneClock("ribbon");
  const { px, unit } = useLayout();
  const ready = useRibbonFontsReady(FONT_LIST);

  const rings: RingGeo[] = useMemo(() => {
    const total = RINGS.reduce((a, r) => a + r.h, 0) + GAP * (RINGS.length - 1);
    let top = -total / 2;
    return RINGS.map((r) => {
      const y = top + r.h / 2;
      top += r.h + GAP;
      return {
        ...r,
        h: r.h * unit,
        r: r.r * unit,
        y: y * unit,
        c: 2 * Math.PI * r.r * unit,
      };
    });
  }, [unit]);

  const lines = useMemo(() => {
    const texts: Record<LineKey, string> = {
      A: lineA,
      B: lineB,
      C: lineC,
      D: lineD,
    };
    const out = {} as Record<LineKey, LineLayout>;
    for (const key of LINE_KEYS) {
      out[key] = ready
        ? layoutLine(key, texts[key], rings[RING_OF[key]], fps, unit)
        : { key, fs: 0, slots: [], centre: 0, end: 0 };
    }
    return out;
  }, [ready, lineA, lineB, lineC, lineD, rings, fps, unit]);

  const fillers = useMemo(() => {
    if (!ready) return rings.map(() => [] as BandItem[]);
    return rings.map((ring, index) => {
      const role = ring.role;
      if (role === "ticker" || role === "chevron") {
        return fillerItems(ring, index, 0, ring.c);
      }
      const line = lines[role];
      if (line.slots.length === 0) return fillerItems(ring, index, 0, ring.c);
      const margin = line.fs * 0.7;
      return fillerItems(ring, index, line.end + margin, ring.c - margin);
    });
  }, [ready, rings, lines]);

  // The inside of every board carries the ticker all the way round.
  const innerFillers = useMemo(
    () =>
      rings.map((ring, index) =>
        ready ? fillerItems(ring, 100 + index, 0, ring.c) : [],
      ),
    [ready, rings],
  );

  /* ---------------- camera ---------------- */

  const lineStart = (key: LineKey) => lines[key].slots[0]?.cue ?? CUES[key][0];
  const ageOf = (hit: number) => frame - hit;

  const heroShot = (key: LineKey): Shot => {
    const ring = rings[RING_OF[key]];
    const line = lines[key];
    const f = FOCAL * unit;
    let d = line.slots[0]?.d ?? f / 1.1;
    let zoom = 0;
    let roll = 0;
    line.slots.forEach((slot, i) => {
      if (i > 0) {
        const prev = line.slots[i - 1];
        const s =
          frame >= slot.hit - 4
            ? spring({
                frame: frame - (slot.hit - 4),
                fps,
                config: { damping: 20, stiffness: 170, mass: 0.7 },
              })
            : 0;
        d += (slot.d - prev.d) * s;
      }
      const age = ageOf(slot.hit);
      if (age >= 0 && age < 12) {
        zoom = 0.075 * Math.exp(-age / 2.4);
        roll =
          (i % 2 === 0 ? 1 : -1) *
          2.6 *
          Math.exp(-age / 3) *
          Math.cos(age * 0.75);
      }
    });
    // Slow creep in while the line plays.
    d *= 1 - 0.03 * Math.min(1, Math.max(0, t - lineStart(key)));
    const { pitch, roll: baseRoll, aim } = LINE_FRAMING[key];
    return {
      az: AZ(t),
      rho: ring.r + d,
      y: ring.y - d * Math.tan(pitch * DEG),
      tr: ring.r,
      ty: ring.y + aim * ring.h,
      f: f * (1 + zoom),
      roll: baseRoll + roll,
    };
  };

  // Boot: straight down into the stack, then out and down past the boards
  // as they power on, ending level with the stack's centre on the burst.
  const bootKeys: { t: number; s: Shot }[] = [
    {
      t: 0,
      s: {
        az: -150,
        rho: px(300),
        y: px(-1750),
        tr: 0,
        ty: px(250),
        f: px(820),
        roll: 0,
      },
    },
    {
      t: 0.75,
      s: {
        az: -118,
        rho: px(950),
        y: px(-1500),
        tr: 0,
        ty: px(-60),
        f: px(860),
        roll: -6,
      },
    },
    {
      t: 1.6,
      s: {
        az: -86,
        rho: px(1500),
        y: px(-950),
        tr: px(300),
        ty: px(-220),
        f: px(900),
        roll: -4,
      },
    },
    {
      t: 2.7,
      s: {
        az: -56,
        rho: px(1720),
        y: px(-300),
        tr: px(500),
        ty: px(120),
        f: px(950),
        roll: 3,
      },
    },
    {
      t: 3.4,
      s: {
        az: -32,
        rho: px(1900),
        y: px(60),
        tr: px(600),
        ty: px(0),
        f: px(980),
        roll: 0,
      },
    },
    {
      t: 4.2,
      s: {
        az: -8,
        rho: px(1800),
        y: px(-450),
        tr: px(700),
        ty: px(-480),
        f: px(1000),
        roll: 0,
      },
    },
  ];

  const revealShot: Shot = {
    az: AZ(t) + 26 + 9 * Math.max(0, t - REVEAL[0]),
    rho: px(1780),
    y: px(-1380),
    tr: 0,
    ty: px(120),
    f: px(960),
    roll: -7 + 4 * Math.max(0, t - REVEAL[0]),
  };

  const blend = (a: number, b: number, easing = EASE.inOut) =>
    interpolate(t, [a, b], [0, 1], { ...CLAMP, easing });

  const A0 = lineStart("A");
  const B0 = lineStart("B");
  const C0 = lineStart("C");
  const D0 = lineStart("D");
  let shot = spline(bootKeys, t);
  shot = mixShot(shot, heroShot("A"), blend(BOOT[7] + 0.02, A0));
  shot = mixShot(shot, heroShot("B"), blend(B0 - 0.34, B0));
  shot = mixShot(shot, heroShot("C"), blend(C0 - 0.36, C0));
  shot = mixShot(shot, revealShot, blend(REVEAL[0], REVEAL[1] - 0.05));
  shot = mixShot(
    shot,
    heroShot("D"),
    blend(REVEAL[1] - 0.05, D0, Easing.bezier(0.55, 0, 0.45, 1)),
  );

  let camera = shake(shotCamera(shot), reel, {
    amount: 0.7,
    speed: 2.6,
    seed: "ribbon",
  });
  const exitU = interpolate(t, [LENGTH - 0.2, LENGTH], [0, 1], CLAMP);
  camera = {
    ...camera,
    yaw: camera.yaw + 62 * exitU ** 2.2,
    roll: camera.roll + 16 * exitU ** 2,
  };
  const camAz = shot.az;

  /* ---------------- whip blur ---------------- */

  const bell = (a: number, b: number) => {
    const u = interpolate(t, [a, b], [0, 1], CLAMP);
    return Math.sin(Math.PI * u) ** 2;
  };
  const blurY =
    px(34) * interpolate(t, [0, 0.14], [1, 0], { ...CLAMP, easing: EASE.out }) +
    px(10) * bell(B0 - 0.3, B0 - 0.02) +
    px(10) * bell(C0 - 0.32, C0 - 0.02) +
    px(24) * bell(REVEAL[1] - 0.02, D0 - 0.02);
  const blurX = px(42) * exitU ** 1.6;

  /* ---------------- lights ---------------- */

  const bootDone = t >= BOOT[7];
  const lights = bootDone
    ? interpolate(t, [BOOT[7], BOOT[7] + 0.15], [0.62, 1], CLAMP)
    : 0.06 +
      BOOT.slice(0, 7).reduce(
        (acc, b) => acc + 0.08 * interpolate(t, [b, b + 0.12], [0, 1], CLAMP),
        0,
      ) +
      0.06 * pulse;
  const burst = t >= BOOT[7] ? Math.exp(-(t - BOOT[7]) * 9) : 0;

  /* ---------------- rings ---------------- */

  const turnOf = (ring: RingGeo, index: number): number => {
    const free = ring.phase + ring.spin * t;
    const role = ring.role;
    if (role === "ticker" || role === "chevron") return free;
    const line = lines[role];
    if (line.slots.length === 0) return free;
    const creep = -3;
    const target = (i: number) =>
      AZ(t) - line.slots[i].theta + creep * (t - line.slots[i].cue);
    // Start so the first slot spins ~110° into place.
    const first = line.slots[0];
    const lead0 = 7;
    const tLead = (first.hit - lead0) / fps;
    const base =
      AZ(tLead) -
      first.theta +
      creep * (tLead - first.cue) +
      115 -
      ring.spin * tLead;
    let v = base + ring.spin * t;
    line.slots.forEach((slot, i) => {
      const lead = i === 0 ? lead0 : 5;
      const s =
        frame >= slot.hit - lead
          ? spring({
              frame: frame - (slot.hit - lead),
              fps,
              config: { damping: 16, stiffness: 190, mass: 0.6 },
            })
          : 0;
      v += (target(i) - v) * s;
    });
    // Once the camera moves on, settle the whole line into view and
    // keep it scrolling slowly with the camera.
    const release: Record<LineKey, number | null> = {
      A: B0 - 0.34,
      B: C0 - 0.36,
      C: REVEAL[0],
      D: null,
    };
    const tr = release[role];
    if (tr !== null) {
      const dir = index % 2 === 0 ? 1 : -1;
      const offset = dir * 14;
      const scroll =
        camAz - line.centre + offset + dir * 9 * Math.max(0, t - tr);
      const anchoredEnd =
        AZ(tr) -
        line.slots[line.slots.length - 1].theta +
        creep * (tr - line.slots[line.slots.length - 1].cue);
      // Unwrap so the settle takes the short way round.
      const delta = scroll - anchoredEnd;
      const unwrapped = scroll - 360 * Math.round(delta / 360);
      v +=
        (unwrapped - v) *
        interpolate(t, [tr, tr + 0.9], [0, 1], {
          ...CLAMP,
          easing: EASE.inOut,
        });
    }
    return v;
  };

  // Latest lyric hit on each line (for board flashes and floods).
  const latestHit = (key: LineKey) => {
    let age = -1;
    for (const slot of lines[key].slots) {
      if (frame >= slot.hit) age = frame - slot.hit;
    }
    return age;
  };
  const floodAgeB = lines.B.slots[0] ? frame - lines.B.slots[0].hit : -1;
  const floodSpread =
    floodAgeB >= 0
      ? interpolate(floodAgeB, [0, 9], [26, 200], {
          ...CLAMP,
          easing: EASE.out,
        })
      : -1;

  // Boards away from the hero board fall off a little (lyric shots only).
  const focusAmt = interpolate(
    t,
    [BOOT[7] + 0.1, A0, REVEAL[0], REVEAL[0] + 0.3, REVEAL[1], D0],
    [0, 1, 1, 0, 0, 1],
    CLAMP,
  );

  const bands = rings.map((ring, index) => {
    const turn = turnOf(ring, index);
    const powerStart = BOOT[index] ?? 0;
    const wipe = interpolate(
      t,
      [powerStart, powerStart + 0.42],
      [-190, 190],
      CLAMP,
    );
    const cell = Math.max(
      5,
      ring.h *
        (ring.role === "ticker" || ring.role === "chevron" ? 0.085 : 0.05),
    );
    const rimWidth = Math.max(2, px(4));
    const role = ring.role;
    const isLine = role !== "ticker" && role !== "chevron";
    const hitAge = isLine ? latestHit(role) : -1;
    const globalFlash = burst;

    const outer = (p: BandPanel): PanelLook => {
      const lit = p.phi < wipe;
      const flooded =
        role === "B" && floodSpread >= 0 && Math.abs(p.phi) < floodSpread;
      const floodEdge =
        role === "B" && floodSpread >= 0
          ? Math.max(0, 1 - Math.abs(Math.abs(p.phi) - floodSpread) / 14)
          : 0;
      let base: string = ring.surface === "black" ? "#000" : stadium.navy;
      let dots = rgba(
        stadium.steel,
        lit ? (ring.surface === "navy" ? 0.11 : 0.2) : 0.08,
      );
      let rim = lit
        ? rgba(stadium.volt, 0.5 + 0.4 * pulse)
        : rgba(stadium.steel, 0.16);
      let color: string = ring.fillerColor;
      let glow = "0 0 0.1em currentColor, 0 0 0.35em currentColor";
      if (flooded) {
        base = stadium.flood;
        dots = rgba(stadium.navy, 0.1);
        rim = rgba(stadium.navy, 0.9);
        color = stadium.navy;
        glow = "none";
      }
      const overlays: React.ReactNode[] = [];
      // Scan bar running round the board as it powers on.
      const scanL = scanAlpha(wipe - (p.phi - p.span / 2));
      const scanR = scanAlpha(wipe - (p.phi + p.span / 2));
      if ((scanL > 0 || scanR > 0) && wipe < 189) {
        overlays.push(
          <div
            key="scan"
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, ${scanColor(wipe - (p.phi - p.span / 2))}, ${scanColor(wipe - (p.phi + p.span / 2))})`,
            }}
          />,
        );
      }
      // Lyric hit: light bursts behind the new slot (under the text).
      let underlay: React.ReactNode;
      const gL = hitGlow(p.phi - p.span / 2, hitAge);
      const gR = hitGlow(p.phi + p.span / 2, hitAge);
      if (!flooded && (gL > 0.01 || gR > 0.01)) {
        const tint = role === "A" ? stadium.volt : stadium.flood;
        const k = role === "A" ? 0.32 : 0.42;
        underlay = (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, ${rgba(tint, k * gL)}, ${rgba(tint, k * gR)})`,
            }}
          />
        );
      }
      if (floodEdge > 0.01) {
        overlays.push(
          <div
            key="flood"
            style={{
              position: "absolute",
              inset: 0,
              background: rgba(stadium.volt, 0.85 * floodEdge),
            }}
          />,
        );
      }
      if (globalFlash > 0.02 && lit) {
        overlays.push(
          <div
            key="burst"
            style={{
              position: "absolute",
              inset: 0,
              background: rgba(stadium.volt, 0.14 * globalFlash),
              boxShadow: `inset 0 0 ${ring.h * 0.25}px ${rgba(stadium.flood, 0.9 * globalFlash)}`,
            }}
          />,
        );
      }
      return {
        style: {
          ...boardBackground({
            base,
            dots,
            rim,
            rimWidth,
            cell,
            stripX: p.stripX,
          }),
          color,
          ["--glow" as string]: glow,
          // A flooded board glows like a lit sign.
          boxShadow: flooded
            ? `0 0 ${ring.h * 0.22}px ${rgba(stadium.flood, 0.32 + 0.18 * pulse)}`
            : undefined,
        },
        content: lit ? 1 : 0,
        underlay,
        overlay: overlays.length ? overlays : undefined,
      };
    };
    const inner = (p: BandPanel): PanelLook => {
      const lit = p.phi < wipe;
      const rim = lit
        ? rgba(stadium.volt, 0.3 + 0.3 * pulse)
        : rgba(stadium.steel, 0.12);
      const base = ring.surface === "black" ? stadium.night : stadium.navy;
      const overlays: React.ReactNode[] = [];
      // Seen from inside, the panel's left edge is its larger angle.
      const scanL = scanAlpha(wipe - (p.phi + p.span / 2));
      const scanR = scanAlpha(wipe - (p.phi - p.span / 2));
      if ((scanL > 0 || scanR > 0) && wipe < 189) {
        overlays.push(
          <div
            key="scan"
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, ${scanColor(wipe - (p.phi + p.span / 2), 0.8)}, ${scanColor(wipe - (p.phi - p.span / 2), 0.8)})`,
            }}
          />,
        );
      }
      if (burst > 0.02 && lit) {
        overlays.push(
          <div
            key="burst"
            style={{
              position: "absolute",
              inset: 0,
              background: rgba(stadium.volt, 0.22 * burst),
            }}
          />,
        );
      }
      return {
        style: {
          ...boardBackground({
            base,
            dots: rgba(stadium.steel, lit ? 0.14 : 0.06),
            rim,
            rimWidth,
            cell,
            stripX: p.stripX,
          }),
          color: ring.fillerColor,
          ["--glow" as string]:
            "0 0 0.1em currentColor, 0 0 0.3em currentColor",
        },
        content: lit ? 0.7 : 0,
        overlay: overlays.length ? overlays : undefined,
      };
    };

    let items: BandItem[] = fillers[index];
    if (isLine) {
      const line = lines[role];
      items = [
        ...line.slots.map((slot, i) => ({
          key: `s${i}`,
          x: slot.x,
          width: slot.w,
          node: (
            <SlotWord
              line={role}
              text={slot.text}
              fs={slot.fs}
              squeeze={slot.squeeze}
              h={ring.h}
              w={slot.w}
              age={frame - slot.hit}
              fps={fps}
            />
          ),
        })),
        ...items,
      ];
    }

    return (
      <RibbonBand
        key={index}
        radius={ring.r}
        height={ring.h}
        y={ring.y}
        segments={ring.seg}
        turn={turn}
        items={items}
        innerItems={innerFillers[index]}
        outer={outer}
        inner={inner}
        shade={0.62}
        dim={
          focusAmt *
          interpolate(
            Math.abs(ring.y - shot.ty),
            [ring.h * 0.6, px(700)],
            [0, 0.42],
            CLAMP,
          )
        }
      />
    );
  });

  /* ---------------- flare ---------------- */

  const bootProgress = interpolate(t, [0, BOOT[7]], [0, 1], CLAMP);
  const flareSize =
    px(150 + 210 * bootProgress) * (1 + 0.55 * pulse) * (1 + 1.5 * burst);
  const sparkBeat = BOOT.reduce((acc, b, k) => (t >= b ? k : acc), -1);
  const sparkAge = sparkBeat >= 0 ? t - BOOT[sparkBeat] : 99;
  const flare = (
    <Billboard x={0} y={0} z={0}>
      <div
        style={{
          position: "relative",
          width: flareSize * 2,
          height: flareSize * 2,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${rgba(stadium.flood, 0.95)} 0%, ${rgba(stadium.volt, 0.75)} 9%, ${rgba(stadium.volt, 0.22)} 30%, ${rgba(stadium.volt, 0)} 62%)`,
          }}
        />
        {new Array(6).fill(0).map((_, k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: 0,
              top: flareSize - px(3),
              width: flareSize * 2,
              height: px(6),
              background: `linear-gradient(90deg, ${rgba(stadium.volt, 0)} 0%, ${rgba(stadium.volt, 0.7)} 42%, ${stadium.flood} 50%, ${rgba(stadium.volt, 0.7)} 58%, ${rgba(stadium.volt, 0)} 100%)`,
              rotate: `${k * 30 + t * 22 * (k % 2 === 0 ? 1 : -1.4)}deg`,
              scale: `${0.55 + 0.45 * (k % 2) + 0.2 * pulse} 1`,
            }}
          />
        ))}
        {sparkBeat >= 0 && sparkAge < 0.45 && t < BOOT[7] + 0.6
          ? new Array(14).fill(0).map((_, k) => {
              const ang = random(`spark-a-${sparkBeat}-${k}`) * Math.PI * 2;
              const speed =
                px(500 + 700 * random(`spark-s-${sparkBeat}-${k}`)) *
                (1 + 0.6 * burst);
              const r = speed * sparkAge * (1 - 0.6 * sparkAge);
              const size = px(7 + 9 * random(`spark-z-${sparkBeat}-${k}`));
              return (
                <div
                  key={`sp${k}`}
                  style={{
                    position: "absolute",
                    left: flareSize + Math.cos(ang) * r - size / 2,
                    top: flareSize + Math.sin(ang) * r - size / 2,
                    width: size,
                    height: size,
                    borderRadius: "50%",
                    background: k % 4 === 0 ? stadium.flood : stadium.volt,
                    boxShadow: `0 0 ${size}px ${stadium.volt}`,
                    opacity: interpolate(sparkAge, [0, 0.45], [1, 0], CLAMP),
                  }}
                />
              );
            })
          : null}
      </div>
    </Billboard>
  );

  // Screen-space bloom over the flare while we look down into the stack.
  const flareScreen = project({ x: 0, y: 0, z: 0 }, camera);
  const bloomOn = interpolate(t, [BOOT[7] + 0.2, A0 - 0.1], [1, 0], CLAMP);
  const bloom =
    flareScreen.visible && bloomOn > 0.01 ? (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 0,
          height: 0,
          translate: `${flareScreen.x}px ${flareScreen.y}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: -flareSize * flareScreen.scale * 2.2,
            top: -flareSize * flareScreen.scale * 2.2,
            width: flareSize * flareScreen.scale * 4.4,
            height: flareSize * flareScreen.scale * 4.4,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${rgba(stadium.volt, 0.32 * bloomOn * (0.6 + 0.4 * pulse))} 0%, ${rgba(stadium.volt, 0)} 60%)`,
            mixBlendMode: "screen",
          }}
        />
      </div>
    ) : null;

  // Hit FX: an anamorphic streak and sparks off the freshly written slot.
  let hitFx: React.ReactNode = null;
  for (const key of LINE_KEYS) {
    const line = lines[key];
    line.slots.forEach((slot, i) => {
      const age = frame - slot.hit;
      if (age < 0 || age > 12) return;
      const ring = rings[RING_OF[key]];
      const a = AZ(slot.cue) * DEG;
      const at = project(
        { x: ring.r * Math.sin(a), y: ring.y, z: ring.r * Math.cos(a) },
        camera,
      );
      if (!at.visible) return;
      const fade = Math.exp(-age / 3.2);
      const tint = key === "B" ? stadium.flood : stadium.volt;
      const halfW = Math.min(px(430), (slot.w / 2) * at.scale);
      hitFx = (
        <div
          key={`${key}${i}`}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 0,
            height: 0,
            translate: `${at.x}px ${at.y}px`,
            rotate: `${camera.roll * -1}deg`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: px(-900),
              width: px(1800),
              top: px(-4),
              height: px(8),
              background: `linear-gradient(90deg, ${rgba(tint, 0)} 0%, ${rgba(tint, 0.55 * fade)} 35%, ${rgba(stadium.flood, 0.95 * fade)} 50%, ${rgba(tint, 0.55 * fade)} 65%, ${rgba(tint, 0)} 100%)`,
              scale: `${0.5 + 0.08 * age} 1`,
              filter: `blur(${px(1.5)}px)`,
            }}
          />
          {new Array(12).fill(0).map((_, k) => {
            const side = k % 2 === 0 ? 1 : -1;
            const ang =
              (side > 0 ? 0 : Math.PI) +
              (random(`hfx-a-${key}-${i}-${k}`) - 0.5) * 1.6;
            const speed = px(26 + 34 * random(`hfx-s-${key}-${i}-${k}`));
            const dist = speed * (age + 1) * (1 - age / 26);
            const len =
              px(18 + 30 * random(`hfx-l-${key}-${i}-${k}`)) * (1 - age / 14);
            const ox =
              side * halfW * (0.75 + 0.25 * random(`hfx-o-${key}-${i}-${k}`));
            return (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: ox + Math.cos(ang) * dist,
                  top: Math.sin(ang) * dist,
                  width: len,
                  height: px(4),
                  borderRadius: px(2),
                  background: k % 3 === 0 ? stadium.flood : tint,
                  boxShadow: `0 0 ${px(8)}px ${tint}`,
                  rotate: `${(ang * 180) / Math.PI}deg`,
                  transformOrigin: "0 50%",
                  opacity: fade,
                }}
              />
            );
          })}
        </div>
      );
    });
  }

  const floorDim = interpolate(lights, [0.06, 1], [0.88, 0.42], CLAMP);

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur x={blurX} y={blurY}>
        <StadiumSky
          camera={camera}
          seconds={reel}
          lights={lights}
          pulse={pulse}
        />
        <Stage3D
          camera={camera}
          overlay={
            <>
              {bloom}
              {hitFx}
            </>
          }
        >
          <FieldFloor variant="grid" y={px(1350)} size={9000}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: stadium.night,
                opacity: floorDim,
              }}
            />
          </FieldFloor>
          {flare}
          {bands}
        </Stage3D>
      </WhipBlur>
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const ribbonSceneSchema = {
  lineA: {
    type: "text-content",
    default: "",
    description: "Ribbon line 1 (4 slots, separated by /)",
  },
  lineB: {
    type: "text-content",
    default: "",
    description: "Ribbon line 2 (5 slots)",
  },
  lineC: {
    type: "text-content",
    default: "",
    description: "Ribbon line 3 (2 slots)",
  },
  lineD: {
    type: "text-content",
    default: "",
    description: "Ribbon line 4 (4 slots)",
  },
} as const satisfies InteractivitySchema;

export const RibbonScene = Interactive.withSchema({
  Component: RibbonSceneInner,
  componentName: "<RibbonScene>",
  schema: ribbonSceneSchema,
  wrapInSequence: true,
});
