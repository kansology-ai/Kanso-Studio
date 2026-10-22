import type React from "react";
import { useId } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Plane3D } from "../../../components/Stage3D";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";

/**
 * Shared look for the TrainingSeason reel: field surfaces, LED text,
 * directional whip blur, cut flashes and the broadcast finish (grain +
 * vignette). Scenes compose these; keep new shared pieces in this folder.
 */

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "");

/**
 * Directional (motion) blur for camera whips. Wrap the whole <Stage3D>
 * (filters flatten 3D, so never put this inside the stage). `x`/`y` are
 * blur radii in px; below 0.3 the filter is skipped entirely.
 */
export const WhipBlur: React.FC<{
  readonly x?: number;
  readonly y?: number;
  readonly children: React.ReactNode;
  readonly style?: React.CSSProperties;
}> = ({ x = 0, y = 0, children, style }) => {
  const id = `whip-${safeId(useId())}`;
  const active = Math.abs(x) > 0.3 || Math.abs(y) > 0.3;
  return (
    <AbsoluteFill style={style}>
      {active ? (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter
            id={id}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation={`${Math.abs(x)} ${Math.abs(y)}`} />
          </filter>
        </svg>
      ) : null}
      <AbsoluteFill style={{ filter: active ? `url(#${id})` : undefined }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Full-frame colour flash for hard cuts. Drive `opacity` from the frame. */
export const Flash: React.FC<{
  readonly opacity: number;
  readonly color?: string;
}> = ({ opacity, color = stadium.flood }) =>
  opacity > 0.001 ? (
    <AbsoluteFill
      style={{ background: color, opacity, pointerEvents: "none" }}
    />
  ) : null;

/**
 * Broadcast finish: animated film grain + vignette. Put it last in a scene.
 */
export const BroadcastFinish: React.FC<{
  readonly grain?: number;
  readonly vignette?: number;
}> = ({ grain = 0.07, vignette = 0.55 }) => {
  const frame = useCurrentFrame();
  const id = `grain-${safeId(useId())}`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 85% at 50% 45%, rgba(0,0,0,0) 55%, rgba(2,5,14,${vignette}) 100%)`,
        }}
      />
      {grain > 0 ? (
        <svg
          width="100%"
          height="100%"
          style={{
            position: "absolute",
            inset: 0,
            opacity: grain,
            mixBlendMode: "overlay",
          }}
        >
          <filter id={id}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves={2}
              seed={frame % 97}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${id})`} />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};

/**
 * Dot-matrix LED text (stadium ribbon boards, scoreboards). Glows in its
 * colour. Size it with `fontSize` in `style`.
 */
export const LedText: React.FC<{
  readonly children: React.ReactNode;
  readonly color?: string;
  readonly glow?: number;
  readonly style?: React.CSSProperties;
}> = ({ children, color = stadium.volt, glow = 1, style }) => (
  <span
    style={{
      fontFamily: fonts.led,
      fontWeight: 900,
      color,
      lineHeight: 1,
      whiteSpace: "pre",
      textShadow:
        glow > 0
          ? `0 0 ${0.08 * glow}em ${color}, 0 0 ${0.3 * glow}em ${color}`
          : undefined,
      ...style,
    }}
  >
    {children}
  </span>
);

export type FieldVariant = "turf" | "track" | "grid";

const FIELD_BACKGROUND: Record<FieldVariant, (u: number) => string> = {
  // Mowed night turf with yard lines every 400 design px.
  turf: (u) =>
    [
      `repeating-linear-gradient(0deg, rgba(246,248,255,0.85) 0 ${6 * u}px, rgba(0,0,0,0) ${6 * u}px ${400 * u}px)`,
      `repeating-linear-gradient(0deg, #0F2A24 0 ${200 * u}px, #0C221E ${200 * u}px ${400 * u}px)`,
    ].join(", "),
  // Tartan running track with white lane lines every 260 design px.
  track: (u) =>
    [
      `repeating-linear-gradient(90deg, rgba(255,255,255,0.92) 0 ${7 * u}px, rgba(0,0,0,0) ${7 * u}px ${260 * u}px)`,
      `linear-gradient(0deg, ${stadium.tartan}, ${stadium.tartan})`,
    ].join(", "),
  // Navy floor with a volt-tinted grid (training-room / broadcast set).
  grid: (u) =>
    [
      `repeating-linear-gradient(0deg, rgba(215,255,46,0.28) 0 ${3 * u}px, rgba(0,0,0,0) ${3 * u}px ${240 * u}px)`,
      `repeating-linear-gradient(90deg, rgba(215,255,46,0.28) 0 ${3 * u}px, rgba(0,0,0,0) ${3 * u}px ${240 * u}px)`,
      `linear-gradient(0deg, ${stadium.navy}, ${stadium.navy})`,
    ].join(", "),
};

/**
 * Ground plane for a <Stage3D>, lying flat at world height `y` (remember
 * +y is down, so the floor is usually at a positive y). A light pool is
 * painted at the centre; it fades to night at the edges.
 */
export const FieldFloor: React.FC<{
  readonly variant?: FieldVariant;
  readonly y: number;
  readonly x?: number;
  readonly z?: number;
  /** Rotation of the pattern around the vertical axis (degrees). */
  readonly ry?: number;
  /** Side length in design px (before px()). */
  readonly size?: number;
  readonly children?: React.ReactNode;
}> = ({
  variant = "turf",
  y,
  x = 0,
  z = 0,
  ry = 0,
  size = 10000,
  children,
}) => {
  const { px, unit } = useLayout();
  const s = px(size);
  return (
    <Plane3D
      x={x}
      y={y}
      z={z}
      ry={ry}
      rx={90}
      width={s}
      height={s}
      background={FIELD_BACKGROUND[variant](unit)}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.10) 0%, rgba(5,10,24,0) 45%, rgba(5,10,24,0.75) 85%, rgba(5,10,24,0.95) 100%)",
        }}
      />
      {children}
    </Plane3D>
  );
};
