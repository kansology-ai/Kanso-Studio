import { zColor } from "@remotion/zod-types";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { QUOTE_WALLPAPER_TIMING } from "../../config/video";
import { CLAMP, EASE, mix } from "../../lib/animation";
import { useLayout } from "../../lib/layout";
import { colors, fonts } from "../../theme";

/**
 * Minimal quote wallpaper: two parallel serif lines joined by a small
 * connector, with a single gold hairline crack that branches as it falls.
 *
 * `animated: false` renders the finished image (registered as a <Still>).
 * `animated: true` reveals the text, ignites the spark and spreads the crack,
 * following the cues in QUOTE_WALLPAPER_TIMING.
 */
export const quoteWallpaperSchema = z.object({
  lineOne: z.string(),
  detailOne: z.string(),
  connector: z.string(),
  lineTwo: z.string(),
  detailTwo: z.string(),
  accentColor: zColor(),
  crackSeed: z.string().describe("Change to get a differently shaped crack"),
  animated: z.boolean().describe("Off = finished still image"),
});

type QuoteWallpaperProps = z.infer<typeof quoteWallpaperSchema>;

type Point = readonly [number, number];
type CrackBranch = {
  readonly points: Point[];
  readonly depth: number;
  /** Distance along the crack (from the spark) where this branch begins. */
  readonly start: number;
  readonly length: number;
};

const STROKE_BY_DEPTH = [2.2, 1.6, 1.15, 0.85, 0.6, 0.45];
const OPACITY_BY_DEPTH = [1, 0.9, 0.72, 0.56, 0.42, 0.32];

/** Keeps branches heading downward instead of running sideways. */
const MAX_ANGLE = 1.05;
const clampAngle = (a: number) => Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));

/**
 * Grows a crack from (x, y) heading `angle` radians from straight down.
 * Short straight steps with sharp kinks read as a fracture (not lightning).
 * Each segment ends by splitting in two, so one line becomes many. Uses
 * seeded `random()`, so the same seed always draws the same crack.
 */
const growCrack = (
  x: number,
  y: number,
  angle: number,
  length: number,
  depth: number,
  maxDepth: number,
  seed: string,
  start: number,
  out: CrackBranch[],
) => {
  const stepSize = Math.max(6, length / 11);
  const steps = Math.max(3, Math.round(length / stepSize));
  const points: Point[] = [[x, y]];
  let cx = x;
  let cy = y;
  let base = angle;

  for (let i = 1; i <= steps; i++) {
    // Slow drift of the overall direction, plus a sharp per-step kink.
    base = clampAngle(base + (random(`${seed}-drift-${i}`) - 0.5) * 0.12);
    const kink = (random(`${seed}-kink-${i}`) - 0.5) * 1.1;
    cx += Math.sin(base + kink) * stepSize;
    cy += Math.cos(base + kink) * stepSize;
    points.push([cx, cy]);

    // Occasional tiny spur off the side, like a chip in stone.
    if (depth > 0 && i > 1 && random(`${seed}-spur-${i}`) < 0.12) {
      const dir = random(`${seed}-spurdir-${i}`) < 0.5 ? -1 : 1;
      const spurAngle = base + dir * (0.7 + random(`${seed}-spura-${i}`) * 0.5);
      const spurLength = stepSize * (1.2 + random(`${seed}-spurl-${i}`) * 1.5);
      out.push({
        points: [
          [cx, cy],
          [
            cx + Math.sin(spurAngle) * spurLength,
            cy + Math.cos(spurAngle) * spurLength,
          ],
        ],
        depth: Math.min(STROKE_BY_DEPTH.length - 1, depth + 2),
        start: start + i * stepSize,
        length: spurLength,
      });
    }
  }
  const branchLength = steps * stepSize;
  out.push({ points, depth, start, length: branchLength });

  if (depth >= maxDepth) {
    return;
  }

  // Split: two children fanning apart, one a little longer than the other.
  const spread = 0.4 + random(`${seed}-spread`) * 0.3;
  const longer = random(`${seed}-longer`) < 0.5 ? -1 : 1;
  for (const dir of [-1, 1]) {
    growCrack(
      cx,
      cy,
      clampAngle(base + dir * spread),
      length * (dir === longer ? 0.8 : 0.64),
      depth + 1,
      maxDepth,
      `${seed}${dir < 0 ? "l" : "r"}`,
      start + branchLength,
      out,
    );
  }
};

const toPath = (points: Point[]) =>
  points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

/** The point `distance` along a polyline (used for the glinting crack tips). */
const pointAt = (points: Point[], distance: number): Point => {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const segment = Math.hypot(x1 - x0, y1 - y0);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    remaining -= segment;
  }
  return points[points.length - 1];
};

export const QuoteWallpaper: React.FC<QuoteWallpaperProps> = ({
  lineOne,
  detailOne,
  connector,
  lineTwo,
  detailTwo,
  accentColor,
  crackSeed,
  animated,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { width, height, px } = useLayout();
  const T = QUOTE_WALLPAPER_TIMING;
  const seconds = frame / fps;

  /** 0 → 1 as an element settles; always 1 for the still image. */
  const reveal = (
    at: number,
    duration: number = T.textRevealSeconds,
    easing: (t: number) => number = EASE.out,
  ) =>
    animated
      ? interpolate(seconds, [at, at + duration], [0, 1], { ...CLAMP, easing })
      : 1;

  const sparkX = width / 2;
  const sparkY = height * 0.655;
  const branches: CrackBranch[] = [];
  // The branches extend roughly 2.9x the trunk; keep them above the bottom.
  const trunk = Math.min(px(210), (height * 0.93 - sparkY) / 2.9);
  growCrack(sparkX, sparkY, 0, trunk, 0, 4, crackSeed, 0, branches);
  const crackReach = Math.max(...branches.map((b) => b.start + b.length));

  // Spark: pops in with a small overshoot, flashes, then settles.
  const ignite = animated
    ? spring({
        frame,
        fps,
        delay: T.sparkAt * fps,
        config: { damping: 12, stiffness: 140 },
      })
    : 1;
  const flash = animated
    ? interpolate(
        seconds,
        [T.sparkAt, T.sparkAt + 0.12, T.sparkAt + 1],
        [0, 1, 0],
        CLAMP,
      )
    : 0;
  const flareSpread = reveal(T.sparkAt, 1.3);

  // Crack front: builds slowly, races, then eases into the finest tips.
  const crackProgress = reveal(T.sparkAt + 0.2, T.crackSeconds, EASE.inOut);
  const crackFront = crackProgress * crackReach;

  // Once settled, the light breathes gently (static image: no breathing).
  const settleAt = T.sparkAt + 0.2 + T.crackSeconds;
  const breath = animated
    ? Math.sin(((seconds - settleAt) / T.breathSeconds) * Math.PI * 2) *
      interpolate(seconds, [settleAt, settleAt + 1], [0, 1], CLAMP)
    : 0;
  const glowLevel = 1 + 0.18 * breath;

  // Slow push-in across the whole clip.
  const push = animated
    ? interpolate(frame, [0, durationInFrames - 1], [1.035, 1], {
        ...CLAMP,
        easing: EASE.out,
      })
    : 1;

  const capsStyle = (p: number): React.CSSProperties => {
    const tracking = `${mix(p, 0.34, 0.16)}em`;
    return {
      fontFamily: fonts.serif,
      fontWeight: 500,
      fontSize: px(108),
      lineHeight: 1,
      letterSpacing: tracking,
      // Trailing tracking shifts centred text left; pad to re-centre it.
      paddingLeft: tracking,
      textTransform: "uppercase",
      color: colors.paper,
      opacity: p,
      filter: `blur(${(1 - p) * px(10)}px)`,
    };
  };
  const detailStyle = (p: number): React.CSSProperties => ({
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: px(80),
    lineHeight: 1.15,
    marginTop: px(6),
    color: accentColor,
    opacity: p,
    translate: `0 ${(1 - p) * px(24)}px`,
    filter: `blur(${(1 - p) * px(6)}px)`,
  });
  const connectorP = reveal(T.connectorAt);
  const hairline = (origin: string): React.CSSProperties => ({
    width: px(56),
    height: Math.max(1, px(1)),
    backgroundColor: accentColor,
    opacity: 0.55,
    transformOrigin: origin,
    scale: `${connectorP} 1`,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.inkWarm }}>
      <AbsoluteFill style={{ scale: String(push) }}>
        {/* Warm light where the crack begins; it grows with the crack. */}
        <AbsoluteFill
          style={{
            opacity: crackProgress * glowLevel,
            background: `radial-gradient(ellipse 75% 32% at 50% 68%, color-mix(in srgb, ${accentColor} 9%, transparent) 0%, transparent 70%)`,
          }}
        />

        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation={px(4)} />
            </filter>
            <linearGradient
              id="crack-fade"
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={sparkY}
              x2={0}
              y2={height * 0.93}
            >
              <stop offset="0%" stopColor={colors.goldLight} stopOpacity={1} />
              <stop offset="55%" stopColor={accentColor} stopOpacity={0.85} />
              <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
            </linearGradient>
            <radialGradient id="spark-glow">
              <stop
                offset="0%"
                stopColor={colors.goldLight}
                stopOpacity={0.9}
              />
              <stop offset="35%" stopColor={accentColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
            </radialGradient>
            <linearGradient id="flare" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={colors.goldLight} stopOpacity={0} />
              <stop
                offset="50%"
                stopColor={colors.goldLight}
                stopOpacity={0.9}
              />
              <stop
                offset="100%"
                stopColor={colors.goldLight}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>

          {/* Crack: blurred glow underneath, crisp hairline on top. Each
              branch draws as far as the crack front has travelled. */}
          {[true, false].map((isGlow) => (
            <g
              key={isGlow ? "glow" : "line"}
              filter={isGlow ? "url(#glow)" : undefined}
              opacity={isGlow ? 0.4 * glowLevel : 1}
            >
              {branches.map((b, i) => {
                const visible = Math.min(b.length, crackFront - b.start);
                if (visible <= 0) {
                  return null;
                }
                return (
                  <path
                    key={i}
                    d={toPath(b.points)}
                    fill="none"
                    stroke="url(#crack-fade)"
                    strokeWidth={px(
                      STROKE_BY_DEPTH[b.depth] * (isGlow ? 3 : 1),
                    )}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={
                      visible < b.length ? `${visible} ${b.length}` : undefined
                    }
                    opacity={OPACITY_BY_DEPTH[b.depth]}
                  />
                );
              })}
            </g>
          ))}

          {/* Molten glints riding the tips while the crack is spreading. */}
          {branches.map((b, i) => {
            const visible = crackFront - b.start;
            if (visible <= 0 || visible >= b.length) {
              return null;
            }
            const [tx, ty] = pointAt(b.points, visible);
            return (
              <circle
                key={i}
                cx={tx}
                cy={ty}
                r={px(STROKE_BY_DEPTH[b.depth] * 1.6)}
                fill={colors.goldLight}
                opacity={OPACITY_BY_DEPTH[b.depth]}
              />
            );
          })}

          {/* The first breach: a small point of light with a thin flare. */}
          <circle
            cx={sparkX}
            cy={sparkY}
            r={px(56) * ignite * (1 + 0.7 * flash)}
            fill="url(#spark-glow)"
            opacity={Math.min(1, glowLevel)}
          />
          <ellipse
            cx={sparkX}
            cy={sparkY}
            rx={px(130) * flareSpread * (1 + 0.5 * flash)}
            ry={px(1.1) * (1 + flash)}
            fill="url(#flare)"
          />
          <circle cx={sparkX} cy={sparkY} r={px(3) * ignite} fill="#FFF7E6" />
        </svg>

        <div
          style={{
            position: "absolute",
            // Anchored above the spark so the text never collides with it.
            bottom: height - sparkY + px(120),
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div style={capsStyle(reveal(T.lineOneAt))}>{lineOne}</div>
          <div style={detailStyle(reveal(T.detailOneAt))}>{detailOne}</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: px(26),
              margin: `${px(58)}px 0 ${px(54)}px`,
            }}
          >
            <div style={hairline("right center")} />
            <div
              style={{
                fontFamily: fonts.body,
                fontWeight: 500,
                fontSize: px(21),
                letterSpacing: `${mix(connectorP, 0.8, 0.5)}em`,
                paddingLeft: `${mix(connectorP, 0.8, 0.5)}em`,
                textTransform: "uppercase",
                color: colors.muted,
                opacity: connectorP,
              }}
            >
              {connector}
            </div>
            <div style={hairline("left center")} />
          </div>
          <div style={capsStyle(reveal(T.lineTwoAt))}>{lineTwo}</div>
          <div style={detailStyle(reveal(T.detailTwoAt))}>{detailTwo}</div>
        </div>
      </AbsoluteFill>

      {/* Vignette and grain sit outside the push-in so the frame stays put. */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.65) 100%)",
        }}
      />
      {/* Fine film grain for a tactile, printed feel. */}
      <svg
        width={width}
        height={height}
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.07,
          mixBlendMode: "screen",
        }}
      >
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={7}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={width} height={height} filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
