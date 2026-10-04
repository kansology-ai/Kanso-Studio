import type React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { drift } from "../lib/animation";
import { useLayout } from "../lib/layout";
import { colors } from "../theme";

type BackgroundProps = {
  readonly accentColor?: string;
  readonly secondaryColor?: string;
  readonly baseColor?: string;
  /** Show the faint grid. */
  readonly grid?: boolean;
};

/** Dark canvas with two slowly drifting colour glows and an optional grid. */
export const Background: React.FC<BackgroundProps> = ({
  accentColor = colors.vermilion,
  secondaryColor = colors.indigo,
  baseColor = colors.ink,
  grid = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px } = useLayout();

  const glowA = {
    x: 72 + drift(frame, fps, { speed: 0.05, amplitude: 8 }),
    y: 28 + drift(frame, fps, { speed: 0.04, amplitude: 6, phase: 1 }),
  };
  const glowB = {
    x: 22 + drift(frame, fps, { speed: 0.045, amplitude: 9, phase: 2 }),
    y: 78 + drift(frame, fps, { speed: 0.035, amplitude: 7, phase: 3 }),
  };

  return (
    <AbsoluteFill style={{ backgroundColor: baseColor }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${glowA.x}% ${glowA.y}%, color-mix(in srgb, ${accentColor} 26%, transparent) 0%, transparent 42%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${glowB.x}% ${glowB.y}%, color-mix(in srgb, ${secondaryColor} 22%, transparent) 0%, transparent 48%)`,
        }}
      />
      {grid ? (
        <AbsoluteFill
          style={{
            backgroundImage: `linear-gradient(${colors.line} 1px, transparent 1px), linear-gradient(90deg, ${colors.line} 1px, transparent 1px)`,
            backgroundSize: `${px(96)}px ${px(96)}px`,
            backgroundPosition: "center center",
            opacity: 0.45,
            maskImage:
              "radial-gradient(ellipse at center, black 20%, transparent 72%)",
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
