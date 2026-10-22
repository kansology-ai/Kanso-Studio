import type React from "react";

/**
 * Solid-looking primitives for <Stage3D>. They are built from flat DOM
 * planes, so they render fast, stay sharp and need no WebGL.
 */

const mixHex = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(
      ((pa >> shift) & 255) +
        (((pb >> shift) & 255) - ((pa >> shift) & 255)) * t,
    );
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
};

/**
 * Text with real depth: the face plus `layers` copies stacked backwards.
 * The sides shade from `sideLight` (next to the face) to `sideDark`.
 * Colours must be 6-digit hex. Put it inside a <Node3D> to place it.
 */
export const ExtrudedText: React.FC<{
  readonly children: React.ReactNode;
  /** Total extrusion depth in px. */
  readonly depth: number;
  /** Number of stacked layers. ~depth / 3 looks solid; more costs more. */
  readonly layers?: number;
  readonly face: string;
  readonly sideLight: string;
  readonly sideDark: string;
  /** Optional outline on the face (jersey-style). */
  readonly stroke?: { readonly color: string; readonly width: number };
  /** Applied to every layer: font family, size, weight, letterSpacing... */
  readonly textStyle: React.CSSProperties;
  /** Extra style for the face only (e.g. a gradient fill or glow). */
  readonly faceStyle?: React.CSSProperties;
}> = ({
  children,
  depth,
  layers = 18,
  face,
  sideLight,
  sideDark,
  stroke,
  textStyle,
  faceStyle,
}) => {
  const count = Math.max(1, Math.round(layers));
  const step = depth / count;
  const back = new Array(count).fill(0).map((_, i) => count - i);
  return (
    <div
      style={{
        position: "relative",
        transformStyle: "preserve-3d",
        whiteSpace: "pre",
        lineHeight: 1,
      }}
    >
      {back.map((i) => {
        const color = mixHex(sideLight, sideDark, i / count);
        return (
          <div
            key={i}
            style={{
              ...textStyle,
              position: "absolute",
              inset: 0,
              color,
              WebkitTextStroke: stroke
                ? `${stroke.width}px ${color}`
                : undefined,
              transform: `translateZ(${-i * step}px)`,
            }}
          >
            {children}
          </div>
        );
      })}
      <div
        style={{
          ...textStyle,
          position: "relative",
          color: face,
          WebkitTextStroke: stroke
            ? `${stroke.width}px ${stroke.color}`
            : undefined,
          paintOrder: "stroke fill",
          transform: "translateZ(0.5px)",
          ...faceStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
};

type FaceProps = {
  readonly width: number;
  readonly height: number;
  readonly transform: string;
  readonly background: string;
  readonly children?: React.ReactNode;
  readonly style?: React.CSSProperties;
};

const Face: React.FC<FaceProps> = ({
  width,
  height,
  transform,
  background,
  children,
  style,
}) => (
  <div
    style={{
      position: "absolute",
      left: -width / 2,
      top: -height / 2,
      width,
      height,
      background,
      transform,
      backfaceVisibility: "hidden",
      overflow: "hidden",
      ...style,
    }}
  >
    {children}
  </div>
);

export type BoxFaces = {
  readonly front?: React.ReactNode;
  readonly back?: React.ReactNode;
  readonly left?: React.ReactNode;
  readonly right?: React.ReactNode;
  readonly top?: React.ReactNode;
  readonly bottom?: React.ReactNode;
};

/**
 * A cuboid centred on its node's origin. `colors` shade the faces (front,
 * sides, top/bottom); `faces` puts content (text, LED panels) on a face.
 * Back faces are hidden, so keep it closed (all six faces) for solids.
 */
export const Box3D: React.FC<{
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly colors: {
    readonly front: string;
    readonly side: string;
    readonly top: string;
    readonly bottom?: string;
    readonly back?: string;
  };
  readonly faces?: BoxFaces;
  readonly faceStyle?: React.CSSProperties;
}> = ({ width: w, height: h, depth: d, colors, faces = {}, faceStyle }) => {
  return (
    <div
      style={{
        position: "relative",
        width: 0,
        height: 0,
        transformStyle: "preserve-3d",
      }}
    >
      <Face
        width={w}
        height={h}
        background={colors.front}
        transform={`translateZ(${d / 2}px)`}
        style={faceStyle}
      >
        {faces.front}
      </Face>
      <Face
        width={w}
        height={h}
        background={colors.back ?? colors.side}
        transform={`rotateY(180deg) translateZ(${d / 2}px)`}
        style={faceStyle}
      >
        {faces.back}
      </Face>
      <Face
        width={d}
        height={h}
        background={colors.side}
        transform={`rotateY(90deg) translateZ(${w / 2}px)`}
        style={faceStyle}
      >
        {faces.right}
      </Face>
      <Face
        width={d}
        height={h}
        background={colors.side}
        transform={`rotateY(-90deg) translateZ(${w / 2}px)`}
        style={faceStyle}
      >
        {faces.left}
      </Face>
      <Face
        width={w}
        height={d}
        background={colors.top}
        transform={`rotateX(90deg) translateZ(${h / 2}px)`}
        style={faceStyle}
      >
        {faces.top}
      </Face>
      <Face
        width={w}
        height={d}
        background={colors.bottom ?? colors.side}
        transform={`rotateX(-90deg) translateZ(${h / 2}px)`}
        style={faceStyle}
      >
        {faces.bottom}
      </Face>
    </div>
  );
};

/**
 * A vertical band wrapped around a cylinder (an arena LED ribbon board).
 * `strip` is laid out flat at width = circumference and wrapped around, so
 * text reads continuously left-to-right from outside. `turn` (degrees)
 * spins the band. Centred on the node's origin; the axis is world Y.
 */
export const Ring3D: React.FC<{
  readonly radius: number;
  readonly height: number;
  /** Number of flat panels. 48-72 looks round. */
  readonly segments?: number;
  readonly turn?: number;
  /** Content of the band, rendered at width 2·π·radius and `height`. */
  readonly strip: React.ReactNode;
  readonly background: string;
  /** Colour of the inside of the band; omit to leave the inside open. */
  readonly inside?: string;
  readonly insideStrip?: React.ReactNode;
}> = ({
  radius,
  height,
  segments = 56,
  turn = 0,
  strip,
  background,
  inside,
  insideStrip,
}) => {
  const n = Math.max(8, Math.round(segments));
  const circumference = 2 * Math.PI * radius;
  const panel = circumference / n;
  const apothem = radius * Math.cos(Math.PI / n);
  const panels = new Array(n).fill(0).map((_, i) => i);
  return (
    <div
      style={{
        position: "relative",
        width: 0,
        height: 0,
        transformStyle: "preserve-3d",
        transform: `rotateY(${turn}deg)`,
      }}
    >
      {panels.map((i) => (
        <div
          key={`o${i}`}
          style={{
            position: "absolute",
            left: -panel / 2 - 0.5,
            top: -height / 2,
            width: panel + 1,
            height,
            overflow: "hidden",
            background,
            backfaceVisibility: "hidden",
            transform: `rotateY(${(i * 360) / n}deg) translateZ(${apothem}px)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: -i * panel,
              width: circumference,
              height,
            }}
          >
            {strip}
          </div>
        </div>
      ))}
      {inside
        ? panels.map((i) => (
            <div
              key={`i${i}`}
              style={{
                position: "absolute",
                left: -panel / 2 - 0.5,
                top: -height / 2,
                width: panel + 1,
                height,
                overflow: "hidden",
                background: inside,
                backfaceVisibility: "hidden",
                transform: `rotateY(${(i * 360) / n + 180}deg) translateZ(${-apothem + 0.5}px)`,
              }}
            >
              {insideStrip ? (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: -((n - i) % n) * panel,
                    width: circumference,
                    height,
                  }}
                >
                  {insideStrip}
                </div>
              ) : null}
            </div>
          ))
        : null}
    </div>
  );
};
