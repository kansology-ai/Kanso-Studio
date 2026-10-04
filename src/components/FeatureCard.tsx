import type React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, SPRING, springIn } from "../lib/animation";
import { useLayout } from "../lib/layout";
import { colors, fonts } from "../theme";

type FeatureCardProps = {
  readonly title: string;
  readonly description: string;
  /** Any element, typically a shape from @remotion/shapes. */
  readonly icon: React.ReactNode;
  readonly accentColor?: string;
  /** Frame when the card starts entering. */
  readonly delay?: number;
};

/** Glassy card that springs up into place, with an accent bar that draws in. */
export const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon,
  accentColor = colors.vermilion,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px } = useLayout();
  const enter = springIn({ frame, fps, delay, config: SPRING.snappy });
  const bar = springIn({
    frame,
    fps,
    delay: delay + Math.round(0.25 * fps),
    config: SPRING.smooth,
  });

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: px(22),
        padding: px(48),
        borderRadius: px(32),
        overflow: "hidden",
        backgroundColor: "rgba(31, 31, 38, 0.72)",
        border: `${px(1.5)}px solid ${colors.line}`,
        boxShadow: `0 ${px(30)}px ${px(80)}px rgba(0, 0, 0, 0.35)`,
        opacity: interpolate(enter, [0, 0.5], [0, 1], CLAMP),
        translate: `0 ${interpolate(enter, [0, 1], [px(80), 0])}px`,
        scale: String(interpolate(enter, [0, 1], [0.94, 1])),
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: px(6),
          backgroundColor: accentColor,
          transformOrigin: "left center",
          scale: `${bar} 1`,
        }}
      />
      <div style={{ height: px(96), display: "flex", alignItems: "center" }}>
        {icon}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 700,
          fontSize: px(50),
          letterSpacing: "-0.02em",
          color: colors.paper,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontWeight: 400,
          fontSize: px(32),
          lineHeight: 1.4,
          color: colors.muted,
        }}
      >
        {description}
      </div>
    </div>
  );
};
