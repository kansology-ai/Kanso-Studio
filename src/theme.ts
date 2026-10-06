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
