import type React from "react";
import { Composition, Folder, Still } from "remotion";
import {
  FORMATS,
  LIVE_PHOTO_TIMING,
  QUOTE_WALLPAPER_TIMING,
  SHOWCASE_TIMING,
  VIDEO,
  getShowcaseDuration,
  secondsToFrames,
} from "./config/video";
import {
  QuoteWallpaper,
  quoteWallpaperSchema,
} from "./compositions/QuoteWallpaper/QuoteWallpaper";
import { Showcase, showcaseSchema } from "./compositions/Showcase/Showcase";
import {
  TrainingSeason,
  trainingSeasonSchema,
} from "./compositions/TrainingSeason/TrainingSeason";
import { BallsScene } from "./compositions/TrainingSeason/scenes/BallsScene";
import { ChalkScene } from "./compositions/TrainingSeason/scenes/ChalkScene";
import { JerseyScene } from "./compositions/TrainingSeason/scenes/JerseyScene";
import { MegaphoneScene } from "./compositions/TrainingSeason/scenes/MegaphoneScene";
import { RibbonScene } from "./compositions/TrainingSeason/scenes/RibbonScene";
import { ScoreboardScene } from "./compositions/TrainingSeason/scenes/ScoreboardScene";
import { TicketScene } from "./compositions/TrainingSeason/scenes/TicketScene";
import { VaultScene } from "./compositions/TrainingSeason/scenes/VaultScene";
import {
  TRAINING_SEASON_TIMING,
  sceneFrames,
} from "./compositions/TrainingSeason/timing";
import { FeaturesScene } from "./compositions/Showcase/scenes/FeaturesScene";
import { IntroScene } from "./compositions/Showcase/scenes/IntroScene";
import { OutroScene } from "./compositions/Showcase/scenes/OutroScene";
// new-composition:imports

/**
 * Every renderable video is registered here. Format (width/height/fps) comes
 * from src/config/video.ts so it can be changed in one place.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Showcase"
        component={Showcase}
        schema={showcaseSchema}
        {...VIDEO}
        durationInFrames={getShowcaseDuration(VIDEO.fps)}
        defaultProps={{
          eyebrow: "Kanso Studio",
          title: "Motion, written in code.",
          highlight: "code",
          subtitle:
            "Programmatic motion graphics, composed with React and rendered by Remotion.",
          featuresEyebrow: "What's inside",
          featuresHeading: "Everything a scene needs",
          outroTitle: "Render anything.",
          command: "npx remotion render Showcase",
          accentColor: "#FF5A36",
          secondaryColor: "#7C8CFF",
          audioSrc: "",
          audioVolume: 0.8,
          showSpectrum: true,
        }}
      />

      {/* Each Showcase scene on its own timeline (connected compositions). */}
      <Folder name="Showcase-Scenes">
        <Composition
          id="IntroScene"
          component={IntroScene}
          {...VIDEO}
          durationInFrames={secondsToFrames(
            SHOWCASE_TIMING.introSeconds,
            VIDEO.fps,
          )}
          defaultProps={{
            eyebrow: "Kanso Studio",
            title: "Motion, written in code.",
            highlight: "code",
            subtitle:
              "Programmatic motion graphics, composed with React and rendered by Remotion.",
            accentColor: "#FF5A36",
            secondaryColor: "#7C8CFF",
          }}
        />
        <Composition
          id="FeaturesScene"
          component={FeaturesScene}
          {...VIDEO}
          durationInFrames={secondsToFrames(
            SHOWCASE_TIMING.featuresSeconds,
            VIDEO.fps,
          )}
          defaultProps={{
            eyebrow: "What's inside",
            heading: "Everything a scene needs",
            accentColor: "#FF5A36",
            secondaryColor: "#7C8CFF",
          }}
        />
        <Composition
          id="OutroScene"
          component={OutroScene}
          {...VIDEO}
          durationInFrames={secondsToFrames(
            SHOWCASE_TIMING.outroSeconds,
            VIDEO.fps,
          )}
          defaultProps={{
            title: "Render anything.",
            command: "npx remotion render Showcase",
            accentColor: "#FF5A36",
            secondaryColor: "#7C8CFF",
          }}
        />
      </Folder>

      {/* Single-frame images: render with `npx remotion still <id>`. */}
      <Folder name="Wallpapers">
        <Still
          id="BreachWallpaper"
          component={QuoteWallpaper}
          schema={quoteWallpaperSchema}
          {...FORMATS.phoneWallpaper}
          defaultProps={{
            lineOne: "The breach",
            detailOne: "of one rule",
            connector: "inevitably leads to",
            lineTwo: "The breach",
            detailTwo: "of other rules.",
            accentColor: "#C9A45C",
            crackSeed: "fracture",
            mode: "still",
          }}
        />
        <Composition
          id="BreachWallpaperAnimated"
          component={QuoteWallpaper}
          schema={quoteWallpaperSchema}
          {...FORMATS.phoneWallpaper}
          fps={VIDEO.fps}
          durationInFrames={secondsToFrames(
            QUOTE_WALLPAPER_TIMING.durationSeconds,
            VIDEO.fps,
          )}
          defaultProps={{
            lineOne: "The breach",
            detailOne: "of one rule",
            connector: "inevitably leads to",
            lineTwo: "The breach",
            detailTwo: "of other rules.",
            accentColor: "#C9A45C",
            crackSeed: "fracture",
            mode: "reveal",
          }}
        />
        <Composition
          id="BreachWallpaperLive"
          component={QuoteWallpaper}
          schema={quoteWallpaperSchema}
          {...FORMATS.phoneWallpaper}
          fps={VIDEO.fps}
          durationInFrames={secondsToFrames(
            LIVE_PHOTO_TIMING.durationSeconds,
            VIDEO.fps,
          )}
          defaultProps={{
            lineOne: "The breach",
            detailOne: "of one rule",
            connector: "inevitably leads to",
            lineTwo: "The breach",
            detailTwo: "of other rules.",
            accentColor: "#C9A45C",
            crackSeed: "fracture",
            mode: "livePhoto",
          }}
        />
      </Folder>

      {/*
        9:16 lyric reel. Lyric fields hold placeholder lines: replace them
        with the song's lines (same number of " / " slots per field).
      */}
      <Composition
        id="TrainingSeason"
        component={TrainingSeason}
        schema={trainingSeasonSchema}
        {...VIDEO}
        {...FORMATS.portrait1080}
        durationInFrames={secondsToFrames(
          TRAINING_SEASON_TIMING.durationSeconds,
          VIDEO.fps,
        )}
        defaultProps={{
          jersey: "READY / SET / GO",
          vault: "I",
          ribbonA: "RUN / THE LAPS / AND HOLD / THE LINE",
          ribbonB: "faster / than / we've / ever / run",
          ribbonC: "EYES ON / THE SCOREBOARD",
          ribbonD: "Keeps / the pace / and takes / the lead",
          tickets: "When / we're / in-vin-ci-ble",
          chalk: "Coach's / calling / every / single / play",
          megaphone: "celebration / overtime",
          scoreboard: "'cause / TRAINING / SEASON / 's",
          balls: "over",
          audioSrc: "",
          audioStartSeconds: 0,
          audioVolume: 1,
          showHud: true,
          showSafeZones: false,
        }}
      />

      {/* Each TrainingSeason scene on its own timeline (connected compositions). */}
      <Folder name="TrainingSeason-Scenes">
        <Composition
          id="TS-Jersey"
          component={JerseyScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={sceneFrames("jersey", VIDEO.fps).durationInFrames}
          defaultProps={{ words: "READY / SET / GO" }}
        />
        <Composition
          id="TS-Vault"
          component={VaultScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={sceneFrames("vault", VIDEO.fps).durationInFrames}
          defaultProps={{ words: "I" }}
        />
        <Composition
          id="TS-Ribbon"
          component={RibbonScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={sceneFrames("ribbon", VIDEO.fps).durationInFrames}
          defaultProps={{
            lineA: "RUN / THE LAPS / AND HOLD / THE LINE",
            lineB: "faster / than / we've / ever / run",
            lineC: "EYES ON / THE SCOREBOARD",
            lineD: "Keeps / the pace / and takes / the lead",
          }}
        />
        <Composition
          id="TS-Tickets"
          component={TicketScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={sceneFrames("tickets", VIDEO.fps).durationInFrames}
          defaultProps={{ words: "When / we're / in-vin-ci-ble" }}
        />
        <Composition
          id="TS-Chalk"
          component={ChalkScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={sceneFrames("chalk", VIDEO.fps).durationInFrames}
          defaultProps={{ words: "Coach's / calling / every / single / play" }}
        />
        <Composition
          id="TS-Megaphone"
          component={MegaphoneScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={
            sceneFrames("megaphone", VIDEO.fps).durationInFrames
          }
          defaultProps={{ words: "celebration / overtime" }}
        />
        <Composition
          id="TS-Scoreboard"
          component={ScoreboardScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={
            sceneFrames("scoreboard", VIDEO.fps).durationInFrames
          }
          defaultProps={{ words: "'cause / TRAINING / SEASON / 's" }}
        />
        <Composition
          id="TS-Balls"
          component={BallsScene}
          {...VIDEO}
          {...FORMATS.portrait1080}
          durationInFrames={sceneFrames("balls", VIDEO.fps).durationInFrames}
          defaultProps={{ words: "over" }}
        />
      </Folder>

      {/* new-composition:registrations */}
    </>
  );
};
