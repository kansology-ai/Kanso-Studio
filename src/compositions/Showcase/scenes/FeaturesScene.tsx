import { Circle, Star, Triangle } from "@remotion/shapes";
import type React from "react";
import {
  AbsoluteFill,
  Interactive,
  useCurrentFrame,
  useVideoConfig,
  type InteractivitySchema,
} from "remotion";
import {
  AnimatedTitle,
  Background,
  Eyebrow,
  FeatureCard,
} from "../../../components";
import { useLayout } from "../../../lib/layout";
import { colors } from "../../../theme";

type FeaturesSceneProps = {
  readonly eyebrow: string;
  readonly heading: string;
  readonly accentColor: string;
  readonly secondaryColor: string;
  readonly style?: React.CSSProperties;
};

const FeaturesSceneInner: React.FC<FeaturesSceneProps> = ({
  eyebrow,
  heading,
  accentColor,
  secondaryColor,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px, safeX, safeY, isPortrait } = useLayout();
  // Gentle idle rotation for the card icons, in degrees.
  const spin = (frame / fps) * 40;

  return (
    <AbsoluteFill style={style}>
      <Background accentColor={accentColor} secondaryColor={secondaryColor} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: px(64),
          padding: `${safeY}px ${safeX}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: px(28),
          }}
        >
          <Eyebrow text={eyebrow} delay={0} accentColor={accentColor} />
          <AnimatedTitle
            text={heading}
            delay={Math.round(0.15 * fps)}
            staggerFrames={3}
            style={{ fontSize: px(96) }}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: isPortrait ? "column" : "row",
            gap: px(40),
            width: "100%",
          }}
        >
          <FeatureCard
            title="Kinetic type"
            description="Word-by-word reveals, typewriters and tracking, all driven by frames."
            accentColor={accentColor}
            delay={Math.round(0.6 * fps)}
            icon={
              <Circle
                showInTimeline={false}
                radius={px(40)}
                fill={accentColor}
                style={{
                  scale: String(
                    1 + 0.08 * Math.sin((frame / fps) * Math.PI * 2),
                  ),
                }}
              />
            }
          />
          <FeatureCard
            title="Vector shapes"
            description="Crisp SVG geometry from @remotion/shapes that stays sharp at 4K."
            accentColor={secondaryColor}
            delay={Math.round(0.8 * fps)}
            icon={
              <Triangle
                showInTimeline={false}
                length={px(88)}
                direction="up"
                cornerRadius={px(8)}
                fill={secondaryColor}
                style={{ rotate: `${spin}deg` }}
              />
            }
          />
          <FeatureCard
            title="Transitions"
            description="Slides, wipes and fades between scenes with TransitionSeries."
            accentColor={colors.amber}
            delay={Math.round(1.0 * fps)}
            icon={
              <Star
                showInTimeline={false}
                points={4}
                innerRadius={px(14)}
                outerRadius={px(46)}
                cornerRadius={px(4)}
                fill={colors.amber}
                style={{ rotate: `${-spin}deg` }}
              />
            }
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const featuresSceneSchema = {
  eyebrow: { type: "text-content", default: "", description: "Eyebrow" },
  heading: { type: "text-content", default: "", description: "Heading" },
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

export const FeaturesScene = Interactive.withSchema({
  Component: FeaturesSceneInner,
  componentName: "<FeaturesScene>",
  schema: featuresSceneSchema,
  wrapInSequence: true,
});
