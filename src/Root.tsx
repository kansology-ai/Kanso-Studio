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

      {/* new-composition:registrations */}
    </>
  );
};
