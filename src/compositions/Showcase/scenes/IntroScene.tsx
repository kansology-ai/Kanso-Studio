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
import {
  AnimatedTitle,
  Background,
  Eyebrow,
  FloatingShapes,
} from "../../../components";
import { useLayout } from "../../../lib/layout";
import { colors, fonts } from "../../../theme";

type IntroSceneProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly highlight: string;
  readonly subtitle: string;
  readonly accentColor: string;
  readonly secondaryColor: string;
  readonly style?: React.CSSProperties;
};

const IntroSceneInner: React.FC<IntroSceneProps> = ({
  eyebrow,
  title,
  highlight,
  subtitle,
  accentColor,
  secondaryColor,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px, safeX } = useLayout();

  return (
    <AbsoluteFill style={style}>
      <Background accentColor={accentColor} secondaryColor={secondaryColor} />
      <FloatingShapes
        accentColor={accentColor}
        secondaryColor={secondaryColor}
        delay={Math.round(0.2 * fps)}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: px(44),
          padding: `0 ${safeX}px`,
        }}
      >
        <Eyebrow
          text={eyebrow}
          delay={Math.round(0.1 * fps)}
          accentColor={accentColor}
        />
        <AnimatedTitle
          text={title}
          highlight={highlight}
          accentColor={accentColor}
          delay={Math.round(0.35 * fps)}
          style={{ fontSize: px(156) }}
        />
        <p
          style={{
            margin: 0,
            maxWidth: px(1180),
            fontFamily: fonts.body,
            fontWeight: 400,
            fontSize: px(46),
            lineHeight: 1.35,
            textAlign: "center",
            color: colors.muted,
            opacity: interpolate(frame, [1.1 * fps, 1.9 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: `0 ${interpolate(
              frame,
              [1.1 * fps, 1.9 * fps],
              [px(36), 0],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              },
            )}px`,
          }}
        >
          {subtitle}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const introSceneSchema = {
  eyebrow: { type: "text-content", default: "", description: "Eyebrow" },
  title: { type: "text-content", default: "", description: "Title" },
  highlight: {
    type: "text-content",
    default: "",
    description: "Highlighted words",
  },
  subtitle: { type: "text-content", default: "", description: "Subtitle" },
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

export const IntroScene = Interactive.withSchema({
  Component: IntroSceneInner,
  componentName: "<IntroScene>",
  schema: introSceneSchema,
  wrapInSequence: true,
});
