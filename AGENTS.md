# Kanso Studio: guide for AI agents

Kanso Studio is a [Remotion](https://www.remotion.dev/docs) project (v4.0.532). Videos are React components rendered frame by frame to MP4. This file covers **project conventions**. For Remotion APIs, use the official skills below.

## Official Remotion skills

The official agent skills (`remotion-dev/skills`) are installed in `.agents/skills/` and symlinked into `.claude/skills/`.

- Start with **`remotion-best-practices`**. It routes to the right sub-skill: markup, transitions, audio, captions, fonts, rendering, and more.
- Update them with `npx remotion skills update`.
- If a skill and this file disagree, follow this file. The one deliberate difference is noted under "Format and timing".

## Commands

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Open Remotion Studio (live preview) | `npm run dev` → http://localhost:3000 |
| Open a specific composition | http://localhost:3000/Showcase |
| Create a new composition | `npm run new -- ProductLaunch` |
| Render the sample to MP4 | `npm run render` → `out/showcase.mp4` |
| Render any composition | `npx remotion render <CompositionId> out/<name>.mp4` |
| Render one frame (visual check) | `npx remotion still Showcase out/frame.png --frame=90` |
| Render a wallpaper / still image | `npx remotion still BreachWallpaper out/wallpaper.png` (add `--width=1080 --height=1920` for other phones) |
| Render the animated wallpaper | `npx remotion render BreachWallpaperAnimated out/wallpaper.mp4 --crf=16` |
| Render the 3 s iPhone Live Photo cut | `npx remotion render BreachWallpaperLive out/wallpaper-live.mp4 --crf=16` (convert on the iPhone with a video-to-Live-Photo app) |
| Render a few frames as images | `npx remotion render Showcase out/frames --sequence --image-format=jpeg --frames=30,90,150` |
| One-off format override | `npx remotion render Showcase out/vertical.mp4 --width=1080 --height=1920` |
| Override props from the CLI | `npx remotion render Showcase out/hello.mp4 --props='{"title":"Hello"}'` (merged over `defaultProps`) |
| Typecheck + lint | `npm run lint` |
| Add a Remotion package | `npx remotion add @remotion/<pkg>` (pins the matching version) |
| Upgrade Remotion | `npm run upgrade` |

The `out/` folder is git-ignored.

## Layout

```
src/
  index.ts                 registerRoot entry point (don't add logic here)
  Root.tsx                 every <Composition> is registered here
  config/video.ts          VIDEO format (width/height/fps), FORMATS presets, timing in seconds
  theme.ts                 colors + fonts (local files loaded with @remotion/fonts)
  lib/animation.ts         EASE / SPRING presets, progress, springIn, fadeInOut, stagger, drift
  lib/layout.ts            useLayout(): px() resolution-independent sizing, safe margins
  components/              reusable building blocks (import from "../components")
    AnimatedTitle.tsx      word-by-word masked reveal with highlight words
    Eyebrow.tsx            uppercase label, tracking tightens as it fades in
    Typewriter.tsx         typed text with blinking cursor
    Background.tsx         dark canvas, drifting colour glows, optional grid
    FloatingShapes.tsx     @remotion/shapes that pop in, drift and rotate
    FeatureCard.tsx        spring-in card with icon, title, description
    AudioSpectrum.tsx      audio-reactive bars (visualizeAudio)
  compositions/
    Showcase/
      Showcase.tsx         parent video: TransitionSeries of scenes + optional audio, zod schema
      scenes/              one file per scene (IntroScene, FeaturesScene, OutroScene)
    QuoteWallpaper/        quote wallpaper, `mode` prop: still (BreachWallpaper), reveal (BreachWallpaperAnimated), livePhoto (BreachWallpaperLive)
public/
  audio/  images/          put assets here; reference with staticFile("audio/track.mp3")
  fonts/                   bundled .woff2 files + OFL licenses
scripts/new-composition.mjs   scaffolder behind `npm run new`
```

## Project conventions

### Format and timing

- **Resolution and fps live in `src/config/video.ts` (`VIDEO`)**, and every `<Composition>` spreads `{...VIDEO}`. To change the format of all videos, edit that one object. `FORMATS` has presets for 4K, portrait and square.
  This is the deliberate difference from the official skills, which inline literal width/height/fps on each `<Composition>`. Keep using `VIDEO`.
- Write durations in **seconds** and convert with `secondsToFrames(seconds, fps)`. Animate with `fps` multiples (`0.5 * fps`), never hard-coded frame counts, so timing holds at 24, 30 or 60 fps.
- Showcase scene lengths are in `SHOWCASE_TIMING`. `getShowcaseDuration()` computes the total, so you never do overlap maths by hand. If you add a scene or transition to Showcase, update both `SHOWCASE_TIMING` and `getShowcaseDuration()`.

### Sizing

- Design at 1920×1080 and wrap pixel sizes in `px()` from `useLayout()`. That scales with the short side of the frame, so scenes work in 4K, portrait and square.
- Keep key content inside `safeX` / `safeY`.
- Use `isPortrait` to switch rows to columns.
- Text minimums at 1080p: headline about 96–156px, supporting text 44px or more, labels 30px or more.

### Animation rules (these are hard requirements in Remotion)

- Drive everything from `useCurrentFrame()` with `interpolate()` or `spring()`. CSS `transition` / `animation` and Tailwind animation classes **do not render**.
- No `Math.random()` or `Date.now()`. For randomness use `random("seed")` from `remotion`, which is deterministic.
- Clamp interpolations (`extrapolateLeft/Right: "clamp"`, or spread `CLAMP`).
- Prefer the CSS `translate`, `scale` and `rotate` properties over `transform` strings. Keep `interpolate()` inline in `style` where Studio editing matters.
- Ease with the `EASE` presets (`Easing.bezier`) and `SPRING` presets in `lib/animation.ts`.
  - `SPRING.smooth`: no overshoot, for text.
  - `SPRING.snappy`: for cards.
  - `SPRING.bouncy`: for small accents only.
- Put `premountFor={fps}` on every `<Sequence>`, `<TransitionSeries.Sequence>`, `<Audio>` and `<Video>`.

### Structure

- **One scene per file** in `compositions/<Video>/scenes/`.
  - Build scenes with `Interactive.withSchema({ wrapInSequence: true })`, and forward the injected `style` prop to the scene's root `<AbsoluteFill>`.
  - Register each scene as a **connected composition** inside a `<Folder>` in `Root.tsx`, so it can be previewed on its own timeline.
- Keep `defaultProps` as **inline object literals** on `<Composition>`, so Studio can write edits back. Declare props with `type`, not `interface`.
- Give a composition a **zod schema** (`schema={...}`) for any prop a human might tweak. Use `zColor()` from `@remotion/zod-types` for colours. Studio then shows editable controls.
- Each independently editable scene or sequence gets its own JSX node; don't `.map()` over scenes. A `.map()` is fine for decorative repeats such as bars, particles or words.
- Reuse `components/` before writing new primitives. If you build something reusable, add it there and export it from `components/index.ts`.
- Use colours and fonts from `theme.ts`, not ad-hoc hex values.

### Fonts

Fonts are local files in `public/fonts`, loaded in `theme.ts` with `@remotion/fonts`, so renders never need the network.

To add a weight or family:
1. Drop the `.woff2` into `public/fonts`. Fontsource packages on npm are a good OFL source.
2. Add an entry to `FONT_FILES`.
3. Keep its licence in `public/fonts/licenses`.

`@remotion/google-fonts` also works on a normal machine (see the fonts skill), but it fetches at render time.

## Recipes

### Create a new composition

```bash
npm run new -- ProductLaunch
```

This creates `src/compositions/ProductLaunch/ProductLaunch.tsx`, a starter with a zod schema, background, eyebrow, title and subtitle. It also registers `<Composition id="ProductLaunch">` in `Root.tsx` at the `new-composition` markers (keep those markers). Then edit the component and adjust `durationInFrames` / `defaultProps` in `Root.tsx`.

To register a composition by hand:

```tsx
<Composition
  id="MyVideo"
  component={MyVideo}
  schema={myVideoSchema}
  {...VIDEO}
  durationInFrames={secondsToFrames(8, VIDEO.fps)}
  defaultProps={{ title: "Hello" }}
/>
```

### Build a multi-scene video

Copy the pattern in `compositions/Showcase/Showcase.tsx`:

```tsx
<TransitionSeries>
  <TransitionSeries.Sequence name="Intro" durationInFrames={secondsToFrames(4, fps)} premountFor={fps}>
    <IntroScene {...props} />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={slide({ direction: "from-right" })}   // or fade(), wipe(), flip(), clockWipe()
    timing={springTiming({ config: SPRING.smooth, durationInFrames: secondsToFrames(0.7, fps) })}
  />
  <TransitionSeries.Sequence name="Next" durationInFrames={secondsToFrames(5, fps)} premountFor={fps}>
    <NextScene />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

Transitions **overlap** scenes:

> total frames = sum of scene frames − sum of transition frames

Overlays (`TransitionSeries.Overlay`) don't shorten the timeline. Inside a scene, `useCurrentFrame()` starts at 0 when the scene starts.

### Animate typography

- `<AnimatedTitle text="Motion, written in code." highlight="code" delay={0.3 * fps} style={{ fontSize: px(150) }} />`: masked word reveal with automatic balanced line breaks.
- `<Eyebrow text="Kanso Studio" />`: a label above a title.
- `<Typewriter text="npm run dev" delay={fps} />`: terminal or code lines.
- Custom per-element motion:

```tsx
style={{
  opacity: interpolate(frame, [1 * fps, 1.8 * fps], [0, 1], { ...CLAMP, easing: EASE.out }),
  translate: `0 ${interpolate(frame, [1 * fps, 1.8 * fps], [px(40), 0], { ...CLAMP, easing: EASE.out })}px`,
}}
```

- Stagger groups with `delay: stagger(i, 4)` (4 frames apart) or `delay + i * staggerFrames`.
- To measure or fit text, see the `measuring-text` rule in the markup skill. For highlighter or underline effects, see `text-highlights`.

### Animate shapes and graphics

- `@remotion/shapes` provides `Circle`, `Rect`, `Triangle`, `Star`, `Polygon`, `Ellipse`, `Heart`, `Pie` and `Arrow`. They are SVG and stay sharp at any resolution. Pass `showInTimeline={false}` for decorative ones, and `style={{ overflow: "visible" }}` when stroked.
- Draw-on strokes: set `strokeDasharray={length}` and animate `strokeDashoffset` from `length` to `0`. See the ring in `OutroScene.tsx`.
- Idle motion: `drift(frame, fps, { speed, amplitude, phase })` gives seamless floating. Rotate with `` rotate: `${(frame / fps) * degPerSec}deg` ``.
- For a whole decorative layer, reuse `<FloatingShapes />` or `<Background />`.

### Synchronize audio

1. Put the file in `public/audio/` (mp3, wav, m4a). Make sure you have the rights to use it.
2. Add it with `<Audio>` from **`@remotion/media`**:
   ```tsx
   <Audio
     name="Music"
     src={staticFile("audio/track.mp3")}
     premountFor={fps}
     trimBefore={2 * fps}        // skip the first 2s of the file
     volume={(f) => interpolate(f, [0, fps], [0, 0.8], CLAMP)}   // f starts at 0 when the audio starts
   />
   ```
   Delay a sound with `from={...}`. Layer sound effects by adding more `<Audio>` elements, each with its own `from`.
3. **Time visuals to the audio in seconds.** List cue points as seconds (for example a `CUES = { drop: 4.2, outro: 9.5 }` object next to the composition). Then place elements with `<Sequence from={secondsToFrames(CUES.drop, fps)} premountFor={fps}>`, or start animations at `CUES.drop * fps`.
4. **Audio-reactive graphics:** `<AudioSpectrum src={staticFile("audio/track.mp3")} />`, or call `useAudioData()` + `visualizeAudio()` from `@remotion/media-utils` yourself to drive scale, glow or position from the bass bins. For long files use `useWindowedAudioData()` with WAV.
5. To make a video's length match its audio, compute `durationInFrames` in `calculateMetadata`. See the `calculate-metadata` and `remotion-multimedia` skills for reading media durations.

Showcase already supports music. Set the `audioSrc` prop, either in Studio's props panel or in `defaultProps`, for example `"audio/track.mp3"` or an https URL. It fades in and out automatically, and `showSpectrum` adds reactive bars.

For voiceover (ElevenLabs), captions and sound effects, see the `voiceover`, `remotion-captions` and `sfx` skill files.

### Preview

1. Run `npm run dev` and open http://localhost:3000. For a specific composition, open `/<CompositionId>`.
2. Studio hot-reloads on save, shows each scene as a connected composition, and lets you edit zod props and interactive styles visually.
3. Studio also has a **Render** button.
4. If you are an agent with a browser, keep Studio open while you work. Without one, render stills (below) and look at them.

### Render

- MP4 (H.264, the default): `npx remotion render Showcase out/showcase.mp4`
- Higher quality: add `--crf=16`. Other codecs: `--codec=h265|vp9|prores`. Transparent video: `--codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png`. This needs a scene without a solid background.
- Half-resolution draft: `--scale=0.5`
- Part of the video: `--frames=0-89`

See the `remotion-render` skill for Lambda, `renderMedia()` and other advanced options.

## Before you finish a change

1. `npm run lint` passes (ESLint + `tsc`).
2. Render stills at the important frames and look at them. Check overflow, safe margins, contrast, and the mid-points of transitions.
3. Only render the full MP4 when asked, or when verifying an end-to-end change.
4. Don't commit `out/`, `node_modules/`, or media you don't have the rights to.
