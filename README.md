# Kanso Studio

Programmatic motion graphics with [Remotion](https://www.remotion.dev/docs) **4.0.532**, React 19 and TypeScript, set up for AI coding agents.

Includes a sample composition, `Showcase`: 1920×1080, 30 fps, 11.1 s. It has three scenes with animated typography, vector shapes, and slide and wipe transitions.

## Requirements

- Node.js (tested with Node 22; any current LTS release should work) and npm
- Git

Remotion downloads its own headless Chrome the first time you render, and it bundles FFmpeg.

## Commands

```bash
npm install                                   # install dependencies
npm run dev                                   # open Remotion Studio at http://localhost:3000
npm run new -- ProductLaunch                  # create + register a new composition
npm run render                                # render Showcase → out/showcase.mp4
npx remotion render <CompositionId> out/video.mp4   # render any composition
npx remotion still Showcase out/frame.png --frame=90 # render a single frame
npm run lint                                  # ESLint + TypeScript
```

Useful render flags:
- `--scale=0.5` makes a quick draft.
- `--crf=16` gives higher quality.
- `--width=1080 --height=1920` gives a one-off vertical version.
- `--props='{"title":"Hello"}'` overrides text and colours.

## Change resolution, frame rate or duration

Everything is in **`src/config/video.ts`**:

```ts
export const VIDEO = { width: 1920, height: 1080, fps: 30 };   // all compositions
export const SHOWCASE_TIMING = { introSeconds: 4, featuresSeconds: 4.5, outroSeconds: 4, transitionSeconds: 0.7 };
```

Durations are in seconds, so changing `fps` keeps the timing the same. Layouts scale with the frame, so 4K, portrait and square presets in `FORMATS` work without changes.

## Project structure

```
src/
  Root.tsx              registers all compositions
  config/video.ts       format + timing
  theme.ts              colours and (local) fonts
  lib/                  animation presets/helpers, resolution-independent layout
  components/           AnimatedTitle, Eyebrow, Typewriter, Background, FloatingShapes, FeatureCard, AudioSpectrum
  compositions/Showcase sample video + scenes/
  compositions/QuoteWallpaper  phone wallpaper still (npx remotion still BreachWallpaper out/wallpaper.png)
public/                 audio/, images/, fonts/ (reference with staticFile())
scripts/                new-composition scaffolder
.agents/skills/         official Remotion agent skills (symlinked into .claude/skills/)
AGENTS.md / CLAUDE.md   instructions for AI agents
```

## Working with AI agents

`AGENTS.md` explains this project's conventions, with recipes for:
- scenes and transitions
- typography and shape animation
- audio sync and audio-reactive graphics
- previewing and rendering

The official Remotion skills are installed for Claude Code, Codex, Cursor and others. Update them with `npx remotion skills update`.

A typical loop:
1. Run `npm run dev` in one terminal.
2. Start your agent (for example `claude`) in another.
3. Describe the video you want.

## Audio

Drop a track into `public/audio/`. Then set the Showcase `audioSrc` prop to `audio/your-track.mp3`, either in Studio's props panel or in `src/Root.tsx`. The track fades in and out automatically, and `showSpectrum` adds audio-reactive bars. See "Synchronize audio" in `AGENTS.md` for cue-based syncing.

## Docs used

- [Remotion docs](https://www.remotion.dev/docs) and [the fundamentals](https://www.remotion.dev/docs/the-fundamentals)
- [Using Claude Code with Remotion](https://www.remotion.dev/docs/ai/claude-code) and [Agent skills](https://www.remotion.dev/docs/ai/skills)
- [TransitionSeries](https://www.remotion.dev/docs/transitions/transitionseries), [calculateMetadata](https://www.remotion.dev/docs/calculate-metadata)
- [Audio](https://www.remotion.dev/docs/audio), [Audio visualization](https://www.remotion.dev/docs/audio/visualization)
- [Fonts](https://www.remotion.dev/docs/fonts), [CLI render](https://www.remotion.dev/docs/cli/render)

## License

Remotion is free for individuals and companies of up to 3 people. Larger companies need a [company license](https://www.remotion.pro/license). Bundled fonts (Sora, Inter, JetBrains Mono) are under the SIL Open Font License; see `public/fonts/licenses`.
