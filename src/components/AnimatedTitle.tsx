import type React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { CLAMP, SPRING, springIn } from "../lib/animation";
import { colors, fonts } from "../theme";

type AnimatedTitleProps = {
  readonly text: string;
  /** Frame (relative to the parent sequence) when the first word starts. */
  readonly delay?: number;
  /** Frames between consecutive words. */
  readonly staggerFrames?: number;
  /** Words to paint in `accentColor` (matched without punctuation, case-insensitive). */
  readonly highlight?: string;
  readonly accentColor?: string;
  readonly style?: React.CSSProperties;
};

const normalize = (word: string) =>
  word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Headline that reveals word by word: each word rises out of a mask while
 * un-blurring. Wraps naturally, so it works at any width.
 */
export const AnimatedTitle: React.FC<AnimatedTitleProps> = ({
  text,
  delay = 0,
  staggerFrames = 4,
  highlight = "",
  accentColor = colors.vermilion,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const highlighted = new Set(
    highlight.split(/\s+/).map(normalize).filter(Boolean),
  );
  const words = text.split(/\s+/).filter(Boolean);

  return (
    <h1
      style={{
        margin: 0,
        textAlign: "center",
        // Even line lengths instead of a lone word on the last line.
        textWrap: "balance",
        fontFamily: fonts.display,
        fontWeight: 800,
        letterSpacing: "-0.035em",
        wordSpacing: "0.06em",
        lineHeight: 1.04,
        color: colors.paper,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const p = springIn({
          frame,
          fps,
          delay: delay + i * staggerFrames,
          config: SPRING.smooth,
        });
        return (
          // Words are inline-blocks separated by real spaces so the line can
          // wrap and balance. Bottom padding keeps descenders inside the mask.
          <span key={i}>
            {i > 0 ? " " : null}
            <span
              style={{
                display: "inline-block",
                overflow: "hidden",
                verticalAlign: "top",
                paddingBottom: "0.08em",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  translate: `0 ${interpolate(p, [0, 1], [105, 0], CLAMP)}%`,
                  opacity: interpolate(p, [0, 0.6], [0, 1], CLAMP),
                  filter: `blur(${interpolate(p, [0, 1], [12, 0], CLAMP)}px)`,
                  color: highlighted.has(normalize(word))
                    ? accentColor
                    : undefined,
                }}
              >
                {word}
              </span>
            </span>
          </span>
        );
      })}
    </h1>
  );
};
