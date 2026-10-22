import { Audio } from "@remotion/media";
import type React from "react";
import {
  AbsoluteFill,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { CLAMP } from "../../lib/animation";
import { stadium } from "../../theme";
import { SafeZones, ScoreBug } from "./kit/ScoreBug";
import { BallsScene } from "./scenes/BallsScene";
import { ChalkScene } from "./scenes/ChalkScene";
import { JerseyScene } from "./scenes/JerseyScene";
import { MegaphoneScene } from "./scenes/MegaphoneScene";
import { RibbonScene } from "./scenes/RibbonScene";
import { ScoreboardScene } from "./scenes/ScoreboardScene";
import { TicketScene } from "./scenes/TicketScene";
import { VaultScene } from "./scenes/VaultScene";
import { sceneFrames } from "./timing";

const slots = (hint: string) =>
  z.string().describe(`${hint}. Separate the timed slots with " / "`);

export const trainingSeasonSchema = z.object({
  jersey: slots("0.0 s, 3 slots"),
  vault: slots("1.85 s, 1 slot"),
  ribbonA: slots("8.65 s, 4 slots"),
  ribbonB: slots("10.65 s, 5 slots"),
  ribbonC: slots("12.6 s, 2 slots"),
  ribbonD: slots("14.6 s, 4 slots"),
  tickets: slots(
    "16.75 s, 3 slots; split the last one into syllables with - (e.g. a-b-c-d)",
  ),
  chalk: slots("18.65 s, 5 slots"),
  megaphone: slots("20.2 s, 2 slots"),
  scoreboard: slots("22.2 s, 4 slots (title card)"),
  balls: slots("24.6 s, 1 slot (the drop)"),
  audioSrc: z
    .string()
    .describe(
      "Song file in public/ (e.g. audio/training-season.mp3) for previewing sync. Leave empty to render silent.",
    ),
  audioStartSeconds: z
    .number()
    .min(0)
    .describe("Where in the song file the reel's first frame starts"),
  audioVolume: z.number().min(0).max(1),
  showHud: z.boolean().describe("Score bug with the game clock"),
  showSafeZones: z
    .boolean()
    .describe("Preview the Instagram UI overlay (turn off before rendering)"),
});

export type TrainingSeasonProps = z.infer<typeof trainingSeasonSchema>;

const resolveSrc = (src: string) =>
  /^https?:\/\//.test(src) ? src : staticFile(src);

/**
 * 30 s, 9:16 kinetic-typography reel in the Varsity Stadium style. Eight
 * scenes, hard-cut on the cue sheet in ./timing.ts. Each scene animates its
 * own whip in/out, so there are no TransitionSeries overlaps to account for.
 */
export const TrainingSeason: React.FC<TrainingSeasonProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const reel = frame / fps;

  return (
    <AbsoluteFill style={{ background: stadium.night }}>
      <JerseyScene
        name="01 Jersey"
        {...sceneFrames("jersey", fps)}
        premountFor={fps}
        words={props.jersey}
      />
      <VaultScene
        name="02 Vault"
        {...sceneFrames("vault", fps)}
        premountFor={fps}
        words={props.vault}
      />
      <RibbonScene
        name="03 Ribbon boards"
        {...sceneFrames("ribbon", fps)}
        premountFor={fps}
        lineA={props.ribbonA}
        lineB={props.ribbonB}
        lineC={props.ribbonC}
        lineD={props.ribbonD}
      />
      <TicketScene
        name="04 Tickets"
        {...sceneFrames("tickets", fps)}
        premountFor={fps}
        words={props.tickets}
      />
      <ChalkScene
        name="05 Chalkboard"
        {...sceneFrames("chalk", fps)}
        premountFor={fps}
        words={props.chalk}
      />
      <MegaphoneScene
        name="06 Megaphone"
        {...sceneFrames("megaphone", fps)}
        premountFor={fps}
        words={props.megaphone}
      />
      <ScoreboardScene
        name="07 Scoreboard"
        {...sceneFrames("scoreboard", fps)}
        premountFor={fps}
        words={props.scoreboard}
      />
      <BallsScene
        name="08 Balls"
        {...sceneFrames("balls", fps)}
        premountFor={fps}
        words={props.balls}
      />

      {props.showHud ? <ScoreBug reel={reel} /> : null}
      {props.showSafeZones ? <SafeZones /> : null}

      {props.audioSrc ? (
        <Audio
          name="Song"
          src={resolveSrc(props.audioSrc)}
          premountFor={fps}
          trimBefore={Math.round(props.audioStartSeconds * fps)}
          volume={(f) =>
            interpolate(
              f,
              [durationInFrames - 0.4 * fps, durationInFrames],
              [props.audioVolume, 0],
              CLAMP,
            )
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
