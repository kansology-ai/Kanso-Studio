import { Circle, Rect, Star, Triangle } from "@remotion/shapes";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CLAMP, SPRING, drift, springIn } from "../lib/animation";
import { useLayout } from "../lib/layout";
import { colors } from "../theme";

type ShapeKind = "ring" | "triangle" | "spark" | "square";

type FloatingShape = {
  readonly kind: ShapeKind;
  /** Position as a percentage of the frame. */
  readonly x: number;
  readonly y: number;
  /** Size in design pixels (scaled by the layout unit). */
  readonly size: number;
  readonly color: string;
  /** Degrees per second. */
  readonly spin: number;
  readonly delay: number;
};

type FloatingShapesProps = {
  readonly accentColor?: string;
  readonly secondaryColor?: string;
  /** Frame when the first shape pops in. */
  readonly delay?: number;
  readonly opacity?: number;
};

const renderShape = (
  kind: ShapeKind,
  size: number,
  color: string,
  stroke: number,
) => {
  const common = {
    showInTimeline: false,
    style: { overflow: "visible" },
  } as const;

  switch (kind) {
    case "ring":
      return (
        <Circle
          {...common}
          radius={size / 2}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
        />
      );
    case "triangle":
      return (
        <Triangle
          {...common}
          length={size}
          direction="up"
          cornerRadius={size * 0.08}
          fill={color}
        />
      );
    case "spark":
      return (
        <Star
          {...common}
          points={4}
          innerRadius={size * 0.16}
          outerRadius={size / 2}
          cornerRadius={size * 0.04}
          fill={color}
        />
      );
    case "square":
      return (
        <Rect
          {...common}
          width={size}
          height={size}
          cornerRadius={size * 0.18}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
        />
      );
  }
};

/**
 * Decorative geometric shapes that pop in, drift and slowly rotate.
 * Positions are percentages, so the layout adapts to any resolution.
 */
export const FloatingShapes: React.FC<FloatingShapesProps> = ({
  accentColor = colors.vermilion,
  secondaryColor = colors.indigo,
  delay = 0,
  opacity = 1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px } = useLayout();

  // One template for all decorative shapes (edit the list, not the JSX).
  const shapes: FloatingShape[] = [
    {
      kind: "ring",
      x: 12,
      y: 22,
      size: 120,
      color: accentColor,
      spin: 0,
      delay: 0,
    },
    {
      kind: "triangle",
      x: 86,
      y: 18,
      size: 90,
      color: secondaryColor,
      spin: 14,
      delay: 4,
    },
    {
      kind: "spark",
      x: 80,
      y: 76,
      size: 110,
      color: colors.amber,
      spin: -18,
      delay: 8,
    },
    {
      kind: "square",
      x: 18,
      y: 80,
      size: 84,
      color: secondaryColor,
      spin: 10,
      delay: 12,
    },
    {
      kind: "spark",
      x: 34,
      y: 12,
      size: 46,
      color: accentColor,
      spin: 24,
      delay: 16,
    },
    {
      kind: "ring",
      x: 92,
      y: 52,
      size: 54,
      color: colors.amber,
      spin: 0,
      delay: 20,
    },
  ];

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      {shapes.map((shape, i) => {
        const pop = springIn({
          frame,
          fps,
          delay: delay + shape.delay,
          config: SPRING.bouncy,
        });
        const size = px(shape.size);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${shape.x}%`,
              top: `${shape.y}%`,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: interpolate(pop, [0, 0.4], [0, 0.9], CLAMP),
              scale: String(pop),
              translate: `${drift(frame, fps, { speed: 0.12, amplitude: px(14), phase: i })}px ${drift(frame, fps, { speed: 0.09, amplitude: px(18), phase: i * 2 })}px`,
              rotate: `${(frame / fps) * shape.spin}deg`,
            }}
          >
            {renderShape(shape.kind, size, shape.color, px(6))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
