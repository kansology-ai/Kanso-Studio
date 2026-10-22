import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * Fonts are bundled in public/fonts (SIL OFL, see public/fonts/licenses), so
 * renders never depend on a network request. `loadFont` blocks rendering until
 * each file is ready. To add a weight: drop the .woff2 into public/fonts and
 * add an entry below.
 */
const FONT_FILES = [
  { family: "Sora", weight: "600", file: "fonts/sora-latin-600-normal.woff2" },
  { family: "Sora", weight: "700", file: "fonts/sora-latin-700-normal.woff2" },
  { family: "Sora", weight: "800", file: "fonts/sora-latin-800-normal.woff2" },
  {
    family: "Inter",
    weight: "400",
    file: "fonts/inter-latin-400-normal.woff2",
  },
  {
    family: "Inter",
    weight: "500",
    file: "fonts/inter-latin-500-normal.woff2",
  },
  {
    family: "Inter",
    weight: "600",
    file: "fonts/inter-latin-600-normal.woff2",
  },
  {
    family: "JetBrains Mono",
    weight: "500",
    file: "fonts/jetbrains-mono-latin-500-normal.woff2",
  },
  {
    family: "Cormorant Garamond",
    weight: "500",
    file: "fonts/cormorant-garamond-latin-500-normal.woff2",
  },
  {
    family: "Cormorant Garamond",
    weight: "400",
    style: "italic",
    file: "fonts/cormorant-garamond-latin-400-italic.woff2",
  },
  {
    family: "Graduate",
    weight: "400",
    file: "fonts/graduate-latin-400-normal.woff2",
  },
  {
    family: "Big Shoulders Display",
    weight: "800",
    file: "fonts/big-shoulders-display-latin-800-normal.woff2",
  },
  {
    family: "Big Shoulders Display",
    weight: "900",
    file: "fonts/big-shoulders-display-latin-900-normal.woff2",
  },
  {
    family: "Barlow Condensed",
    weight: "600",
    file: "fonts/barlow-condensed-latin-600-normal.woff2",
  },
  {
    family: "Barlow Condensed",
    weight: "700",
    style: "italic",
    file: "fonts/barlow-condensed-latin-700-italic.woff2",
  },
  {
    family: "Barlow Condensed",
    weight: "800",
    style: "italic",
    file: "fonts/barlow-condensed-latin-800-italic.woff2",
  },
  {
    family: "Barlow Condensed",
    weight: "900",
    style: "italic",
    file: "fonts/barlow-condensed-latin-900-italic.woff2",
  },
  {
    family: "Caveat Brush",
    weight: "400",
    file: "fonts/caveat-brush-latin-400-normal.woff2",
  },
  {
    family: "Doto",
    weight: "900",
    file: "fonts/doto-latin-900-normal.woff2",
  },
] as const;

for (const font of FONT_FILES) {
  loadFont({
    family: font.family,
    weight: font.weight,
    style: "style" in font ? font.style : "normal",
    url: staticFile(font.file),
  });
}

export const fonts = {
  display: "Sora, system-ui, sans-serif",
  body: "Inter, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  /** Editorial serif for quotes and luxury-style typography. */
  serif: "'Cormorant Garamond', Georgia, serif",
  /** Collegiate block slab: jersey names, pennants, varsity patches. */
  varsity: "Graduate, 'Big Shoulders Display', serif",
  /** Tall condensed grotesk for stadium signage (use weight 800/900). */
  stadium: "'Big Shoulders Display', 'Barlow Condensed', sans-serif",
  /** Sports-broadcast condensed. Italic 700-900, or upright 600 for labels. */
  broadcast: "'Barlow Condensed', 'Big Shoulders Display', sans-serif",
  /** Chalkboard / marker handwriting. */
  chalk: "'Caveat Brush', cursive",
  /** Dot-matrix LED (weight 900 only). */
  led: "Doto, 'JetBrains Mono', monospace",
} as const;

export const colors = {
  ink: "#0D0D10",
  surface: "#17171C",
  surfaceRaised: "#1F1F26",
  line: "rgba(244, 239, 230, 0.12)",
  paper: "#F4EFE6",
  muted: "#A19C93",
  vermilion: "#FF5A36",
  indigo: "#7C8CFF",
  amber: "#FFB547",
  /** Warm near-black, for gold-on-black designs. */
  inkWarm: "#0A0908",
  gold: "#C9A45C",
  goldLight: "#F3DEAE",
} as const;

/**
 * Varsity Stadium palette (TrainingSeason reel): night navy, floodlight white,
 * training volt, and the Kanso vermilion as the signal colour. Tartan and
 * chalkboard are scene surfaces.
 */
export const stadium = {
  night: "#050A18",
  navy: "#0B1633",
  navyMid: "#162A5C",
  navyLight: "#2B4A9C",
  steel: "#8796C0",
  flood: "#F6F8FF",
  volt: "#D7FF2E",
  voltDeep: "#A6D400",
  signal: "#FF5A36",
  signalDeep: "#C7381C",
  tartan: "#C9442C",
  tartanDark: "#9E3020",
  chalkboard: "#18302A",
  chalk: "#EEF1E6",
  leather: "#C8692E",
} as const;
