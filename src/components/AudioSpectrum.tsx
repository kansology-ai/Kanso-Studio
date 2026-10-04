import { useAudioData, visualizeAudio } from "@remotion/media-utils";
import type React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "../lib/layout";
import { colors } from "../theme";

type AudioSpectrumProps = {
  /** Same URL you pass to <Audio>, e.g. staticFile("audio/music.mp3"). */
  readonly src: string;
  /** Frequency bands (power of two). Drawn mirrored, so you get twice as many bars. */
  readonly bars?: 16 | 32 | 64 | 128;
  readonly color?: string;
  /** Max bar height in design pixels. */
  readonly height?: number;
};

/**
 * Audio-reactive spectrum bars. Reads the audio file and draws its frequency
 * content for the current frame, so the graphics stay in sync with the sound.
 */
export const AudioSpectrum: React.FC<AudioSpectrumProps> = ({
  src,
  bars = 32,
  color = colors.vermilion,
  height = 160,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { px } = useLayout();
  const audioData = useAudioData(src);

  if (!audioData) {
    return null;
  }

  const spectrum = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: bars,
    optimizeFor: "speed",
  });
  // Bass in the middle, mirrored outwards. sqrt lifts the quieter high bands.
  const mirrored = [...spectrum.slice().reverse(), ...spectrum];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: px(6),
        height: px(height),
      }}
    >
      {mirrored.map((value, i) => (
        <div
          key={i}
          style={{
            width: px(10),
            height: `${Math.max(4, Math.min(100, Math.sqrt(value) * 140))}%`,
            borderRadius: px(5),
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
};
