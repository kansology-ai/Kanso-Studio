import { zColor } from "@remotion/zod-types";
import type React from "react";
import { AbsoluteFill, random } from "remotion";
import { z } from "zod";
import { useLayout } from "../../lib/layout";
import { colors, fonts } from "../../theme";

/**
 * Minimal quote wallpaper: two parallel serif lines joined by a small
 * connector, with a single gold hairline crack that branches as it falls.
 * Rendered as a <Still>; change the text, colour or crack seed via props.
 */
export const quoteWallpaperSchema = z.object({
  lineOne: z.string(),
  detailOne: z.string(),
  connector: z.string(),
  lineTwo: z.string(),
  detailTwo: z.string(),
  accentColor: zColor(),
  crackSeed: z.string().describe("Change to get a differently shaped crack"),
});

type QuoteWallpaperProps = z.infer<typeof quoteWallpaperSchema>;

type Point = readonly [number, number];
type CrackBranch = { readonly points: Point[]; readonly depth: number };

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
      });
    }
  }
  out.push({ points, depth });

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
      out,
    );
  }
};

const toPath = (points: Point[]) =>
  points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");

export const QuoteWallpaper: React.FC<QuoteWallpaperProps> = ({
  lineOne,
  detailOne,
  connector,
  lineTwo,
  detailTwo,
  accentColor,
  crackSeed,
}) => {
  const { width, height, px } = useLayout();

  const sparkX = width / 2;
  const sparkY = height * 0.655;
  const branches: CrackBranch[] = [];
  // The branches extend roughly 2.9x the trunk; keep them above the bottom.
  const trunk = Math.min(px(210), (height * 0.93 - sparkY) / 2.9);
  growCrack(sparkX, sparkY, 0, trunk, 0, 4, crackSeed, branches);

  const capsStyle: React.CSSProperties = {
    fontFamily: fonts.serif,
    fontWeight: 500,
    fontSize: px(108),
    lineHeight: 1,
    letterSpacing: "0.16em",
    // Trailing tracking shifts centred text left; pad to re-centre it.
    paddingLeft: "0.16em",
    textTransform: "uppercase",
    color: colors.paper,
  };
  const detailStyle: React.CSSProperties = {
    fontFamily: fonts.serif,
    fontStyle: "italic",
    fontWeight: 400,
    fontSize: px(80),
    lineHeight: 1.15,
    marginTop: px(6),
    color: accentColor,
  };
  const hairline: React.CSSProperties = {
    width: px(56),
    height: Math.max(1, px(1)),
    backgroundColor: accentColor,
    opacity: 0.55,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: colors.inkWarm }}>
      {/* Faint warm light where the crack begins, and a soft vignette. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 75% 32% at 50% 68%, color-mix(in srgb, ${accentColor} 9%, transparent) 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.65) 100%)",
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
            <stop offset="0%" stopColor={colors.goldLight} stopOpacity={0.9} />
            <stop offset="35%" stopColor={accentColor} stopOpacity={0.35} />
            <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="flare" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={colors.goldLight} stopOpacity={0} />
            <stop offset="50%" stopColor={colors.goldLight} stopOpacity={0.9} />
            <stop offset="100%" stopColor={colors.goldLight} stopOpacity={0} />
          </linearGradient>
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
        </defs>

        {/* Crack: blurred glow underneath, crisp hairline on top. */}
        <g filter="url(#glow)" opacity={0.4}>
          {branches.map((b, i) => (
            <path
              key={i}
              d={toPath(b.points)}
              fill="none"
              stroke="url(#crack-fade)"
              strokeWidth={px(STROKE_BY_DEPTH[b.depth] * 3)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={OPACITY_BY_DEPTH[b.depth]}
            />
          ))}
        </g>
        {branches.map((b, i) => (
          <path
            key={i}
            d={toPath(b.points)}
            fill="none"
            stroke="url(#crack-fade)"
            strokeWidth={px(STROKE_BY_DEPTH[b.depth])}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={OPACITY_BY_DEPTH[b.depth]}
          />
        ))}

        {/* The first breach: a small point of light with a thin flare. */}
        <circle cx={sparkX} cy={sparkY} r={px(56)} fill="url(#spark-glow)" />
        <ellipse
          cx={sparkX}
          cy={sparkY}
          rx={px(130)}
          ry={px(1.1)}
          fill="url(#flare)"
        />
        <circle cx={sparkX} cy={sparkY} r={px(3)} fill="#FFF7E6" />

        {/* Fine film grain for a tactile, printed feel. */}
        <rect
          width={width}
          height={height}
          filter="url(#grain)"
          opacity={0.07}
          style={{ mixBlendMode: "screen" }}
        />
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
        <div style={capsStyle}>{lineOne}</div>
        <div style={detailStyle}>{detailOne}</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: px(26),
            margin: `${px(58)}px 0 ${px(54)}px`,
          }}
        >
          <div style={hairline} />
          <div
            style={{
              fontFamily: fonts.body,
              fontWeight: 500,
              fontSize: px(21),
              letterSpacing: "0.5em",
              paddingLeft: "0.5em",
              textTransform: "uppercase",
              color: colors.muted,
            }}
          >
            {connector}
          </div>
          <div style={hairline} />
        </div>
        <div style={capsStyle}>{lineTwo}</div>
        <div style={detailStyle}>{detailTwo}</div>
      </div>
    </AbsoluteFill>
  );
};
