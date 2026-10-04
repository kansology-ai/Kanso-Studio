import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { colors, fonts } from "../theme";

type TypewriterProps = {
  readonly text: string;
  readonly delay?: number;
  readonly charsPerSecond?: number;
  readonly cursorColor?: string;
  readonly style?: React.CSSProperties;
};

/** Types `text` one character at a time with a blinking block cursor. */
export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  delay = 0,
  charsPerSecond = 22,
  cursorColor = colors.vermilion,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const elapsed = Math.max(0, frame - delay) / fps;
  const visible = Math.min(text.length, Math.floor(elapsed * charsPerSecond));
  const typing = visible < text.length;
  // Solid while typing, then blink twice per second.
  const cursorOn = typing || Math.floor((frame / fps) * 2) % 2 === 0;

  return (
    <span style={{ fontFamily: fonts.mono, whiteSpace: "pre", ...style }}>
      {text.slice(0, visible)}
      <span
        style={{
          display: "inline-block",
          width: "0.6em",
          height: "1.1em",
          marginLeft: "0.08em",
          verticalAlign: "text-bottom",
          backgroundColor: cursorColor,
          opacity: cursorOn ? 1 : 0,
        }}
      />
    </span>
  );
};
