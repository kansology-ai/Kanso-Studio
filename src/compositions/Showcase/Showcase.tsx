import { Audio } from "@remotion/media";
import {
  linearTiming,
  springTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { zColor } from "@remotion/zod-types";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { AudioSpectrum } from "../../components";
import { SHOWCASE_TIMING, secondsToFrames } from "../../config/video";
import { CLAMP, EASE, SPRING } from "../../lib/animation";
import { useLayout } from "../../lib/layout";
import { colors } from "../../theme";
import { FeaturesScene } from "./scenes/FeaturesScene";
import { IntroScene } from "./scenes/IntroScene";
import { OutroScene } from "./scenes/OutroScene";

export const showcaseSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  highlight: z
    .string()
    .describe("Words in the title to paint in the accent color"),
  subtitle: z.string(),
  featuresEyebrow: z.string(),
  featuresHeading: z.string(),
  outroTitle: z.string(),
  command: z.string(),
  accentColor: zColor(),
  secondaryColor: zColor(),
  audioSrc: z
    .string()
    .describe(
      "File in public/ (e.g. audio/music.mp3) or an https URL. Leave empty for silence.",
    ),
  audioVolume: z.number().min(0).max(1),
  showSpectrum: z
    .boolean()
    .describe("Draw audio-reactive bars when audio is set"),
});

export type ShowcaseProps = z.infer<typeof showcaseSchema>;

const resolveSrc = (src: string) =>
  /^https?:\/\//.test(src) ? src : staticFile(src);

/**
 * Three-scene demo: intro → features → outro, joined by a slide and a wipe.
 * Scene lengths come from SHOWCASE_TIMING (seconds), so they hold at any fps.
 */
export const Showcase: React.FC<ShowcaseProps> = ({
  eyebrow,
  title,
  highlight,
  subtitle,
  featuresEyebrow,
  featuresHeading,
  outroTitle,
  command,
  accentColor,
  secondaryColor,
  audioSrc,
  audioVolume,
  showSpectrum,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const { px } = useLayout();
  const transitionFrames = secondsToFrames(
    SHOWCASE_TIMING.transitionSeconds,
    fps,
  );
  const audio = audioSrc.trim() ? resolveSrc(audioSrc.trim()) : null;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.ink }}>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="Intro"
          durationInFrames={secondsToFrames(SHOWCASE_TIMING.introSeconds, fps)}
          premountFor={fps}
        >
          <IntroScene
            eyebrow={eyebrow}
            title={title}
            highlight={highlight}
            subtitle={subtitle}
            accentColor={accentColor}
            secondaryColor={secondaryColor}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({
            config: SPRING.smooth,
            durationInFrames: transitionFrames,
          })}
        />
        <TransitionSeries.Sequence
          name="Features"
          durationInFrames={secondsToFrames(
            SHOWCASE_TIMING.featuresSeconds,
            fps,
          )}
          premountFor={fps}
        >
          <FeaturesScene
            eyebrow={featuresEyebrow}
            heading={featuresHeading}
            accentColor={accentColor}
            secondaryColor={secondaryColor}
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-bottom-left" })}
          timing={linearTiming({
            durationInFrames: transitionFrames,
            easing: EASE.inOut,
          })}
        />
        <TransitionSeries.Sequence
          name="Outro"
          durationInFrames={secondsToFrames(SHOWCASE_TIMING.outroSeconds, fps)}
          premountFor={fps}
        >
          <OutroScene
            title={outroTitle}
            command={command}
            accentColor={accentColor}
            secondaryColor={secondaryColor}
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      {audio ? (
        <Audio
          name="Music"
          src={audio}
          premountFor={fps}
          // Fade in over the first second and out over the last.
          volume={(f) =>
            interpolate(
              f,
              [0, fps, durationInFrames - fps, durationInFrames],
              [0, audioVolume, audioVolume, 0],
              CLAMP,
            )
          }
        />
      ) : null}
      {audio && showSpectrum ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: px(48),
          }}
        >
          <AudioSpectrum src={audio} color={accentColor} height={90} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
