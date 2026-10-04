import type React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, EASE } from "../lib/animation";
import { useLayout } from "../lib/layout";
import { colors, fonts } from "../theme";

type EyebrowProps = {
  readonly text: string;
  readonly delay?: number;
  readonly accentColor?: string;
};

/** Small uppercase label whose tracking tightens as it fades in. */
export const Eyebrow: React.FC<EyebrowProps> = ({
  text,
  delay = 0,
  accentColor = colors.vermilion,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px } = useLayout();
  const duration = Math.round(0.9 * fps);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: px(18),
        fontFamily: fonts.body,
        fontWeight: 600,
        fontSize: px(30),
        textTransform: "uppercase",
        color: colors.muted,
        opacity: interpolate(frame, [delay, delay + duration], [0, 1], {
          ...CLAMP,
          easing: EASE.out,
        }),
        letterSpacing: `${interpolate(
          frame,
          [delay, delay + duration],
          [0.6, 0.28],
          {
            ...CLAMP,
            easing: EASE.out,
          },
        )}em`,
      }}
    >
      <div
        style={{
          width: px(44),
          height: px(3),
          borderRadius: px(2),
          backgroundColor: accentColor,
          transformOrigin: "left center",
          scale: `${interpolate(frame, [delay, delay + duration], [0, 1], {
            ...CLAMP,
            easing: EASE.out,
          })} 1`,
        }}
      />
      {text}
    </div>
  );
};
