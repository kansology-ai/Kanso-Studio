import { Circle } from "@remotion/shapes";
import type React from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  type InteractivitySchema,
} from "remotion";
import { AnimatedTitle, Background, Typewriter } from "../../../components";
import { SPRING, springIn } from "../../../lib/animation";
import { useLayout } from "../../../lib/layout";
import { colors, fonts } from "../../../theme";

type OutroSceneProps = {
  readonly title: string;
  readonly command: string;
  readonly accentColor: string;
  readonly secondaryColor: string;
  readonly style?: React.CSSProperties;
};

const OutroSceneInner: React.FC<OutroSceneProps> = ({
  title,
  command,
  accentColor,
  secondaryColor,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { px, safeX } = useLayout();

  const ringRadius = px(400);
  const circumference = 2 * Math.PI * ringRadius;
  const draw = springIn({
    frame,
    fps,
    config: SPRING.smooth,
    durationInFrames: Math.round(1.6 * fps),
  });
  const pill = springIn({
    frame,
    fps,
    delay: Math.round(1.0 * fps),
    config: SPRING.snappy,
  });

  return (
    <AbsoluteFill style={style}>
      <Background
        accentColor={accentColor}
        secondaryColor={secondaryColor}
        grid={false}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <Circle
          showInTimeline={false}
          radius={ringRadius}
          fill="none"
          stroke={accentColor}
          strokeWidth={px(3)}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - draw)}
          style={{
            overflow: "visible",
            opacity: 0.55,
            rotate: `${-90 + (frame / fps) * 12}deg`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: px(56),
          padding: `0 ${safeX}px`,
        }}
      >
        <AnimatedTitle
          text={title}
          highlight={title.split(/\s+/).slice(-1)[0]}
          accentColor={accentColor}
          delay={Math.round(0.3 * fps)}
          style={{ fontSize: px(150) }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: px(20),
            padding: `${px(22)}px ${px(36)}px`,
            borderRadius: px(999),
            backgroundColor: colors.surfaceRaised,
            border: `${px(1.5)}px solid ${colors.line}`,
            fontSize: px(40),
            color: colors.paper,
            opacity: interpolate(pill, [0, 0.5], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: String(interpolate(pill, [0, 1], [0.9, 1])),
          }}
        >
          <span style={{ fontFamily: fonts.mono, color: accentColor }}>$</span>
          <Typewriter
            text={command}
            delay={Math.round(1.3 * fps)}
            cursorColor={accentColor}
          />
        </div>
      </AbsoluteFill>
      {/* Fade to black over the last half second. */}
      <AbsoluteFill
        style={{
          backgroundColor: colors.ink,
          opacity: interpolate(
            frame,
            [durationInFrames - 0.5 * fps, durationInFrames - 1],
            [0, 1],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.7, 0, 0.84, 0),
            },
          ),
        }}
      />
    </AbsoluteFill>
  );
};

const outroSceneSchema = {
  title: { type: "text-content", default: "", description: "Title" },
  command: { type: "text-content", default: "", description: "Command" },
  accentColor: {
    type: "color",
    default: colors.vermilion,
    description: "Accent color",
  },
  secondaryColor: {
    type: "color",
    default: colors.indigo,
    description: "Secondary color",
  },
} as const satisfies InteractivitySchema;

export const OutroScene = Interactive.withSchema({
  Component: OutroSceneInner,
  componentName: "<OutroScene>",
  schema: outroSceneSchema,
  wrapInSequence: true,
});
