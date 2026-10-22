import { useEffect, useRef, useState } from "react";
import { useDelayRender } from "remotion";

/**
 * Text fitting for the Megaphone and Scoreboard scenes. Lyrics are
 * placeholders, so every word is sized from its measured width.
 *
 * Measuring before the local fonts have loaded would size the fallback
 * font, so `useFontsReady()` holds the render until the faces are in
 * `document.fonts`, then re-renders. Widths come from a canvas (no DOM
 * nodes, no cache to poison) and scale linearly with the font size.
 */

export type FontSpec = {
  /** CSS font-family list, e.g. fonts.broadcast. */
  readonly family: string;
  readonly weight: number;
  readonly style?: "normal" | "italic";
};

const primaryFamily = (family: string): string =>
  family.split(",")[0].trim().replace(/^['"]|['"]$/g, "");

const normWeight = (w: string | number): string => {
  const v = String(w);
  if (v === "normal") return "400";
  if (v === "bold") return "700";
  return v;
};

/**
 * Is the face in document.fonts and loaded? (`document.fonts.check()` is
 * true while no face is registered yet, so it cannot be trusted here.)
 */
const faceLoaded = (spec: FontSpec): boolean => {
  if (typeof document === "undefined" || !document.fonts) return true;
  const fam = primaryFamily(spec.family);
  const style = spec.style ?? "normal";
  let ok = false;
  document.fonts.forEach((f) => {
    if (
      f.family.replace(/^['"]|['"]$/g, "") === fam &&
      normWeight(f.weight) === normWeight(spec.weight) &&
      f.style === style &&
      f.status === "loaded"
    ) {
      ok = true;
    }
  });
  return ok;
};

/** True once every face is loaded. Delays the render until then. */
export const useFontsReady = (specs: readonly FontSpec[]): boolean => {
  const { delayRender, continueRender } = useDelayRender();
  const check = () => specs.every(faceLoaded);
  const [ready, setReady] = useState(check);
  const [handle] = useState(() =>
    check()
      ? null
      : delayRender("Waiting for lyric fonts before fitting text", {
          timeoutInMilliseconds: 25000,
        }),
  );
  const done = useRef(false);
  useEffect(() => {
    if (handle === null) return;
    let alive = true;
    let tries = 0;
    const finish = () => {
      if (!done.current) {
        done.current = true;
        continueRender(handle);
      }
    };
    const tick = () => {
      if (!alive) return;
      tries++;
      // Give up after ~6 s and measure with whatever is there.
      if (specs.every(faceLoaded) || tries > 200) {
        setReady(true);
        finish();
        return;
      }
      setTimeout(tick, 30);
    };
    tick();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);
  return ready;
};

let ctx: CanvasRenderingContext2D | null = null;
const getCtx = (): CanvasRenderingContext2D | null => {
  if (ctx) return ctx;
  if (typeof document === "undefined") return null;
  ctx = document.createElement("canvas").getContext("2d");
  return ctx;
};

const REF = 100;

const fontString = (spec: FontSpec, size: number) =>
  `${spec.style ?? "normal"} ${spec.weight} ${size}px ${spec.family}`;

/** Advance width of `text` at `size` px, plus CSS letter-spacing (em). */
export const textWidth = (
  text: string,
  spec: FontSpec,
  size: number,
  letterSpacingEm = 0,
): number => {
  const c = getCtx();
  const chars = Array.from(text).length;
  if (!c) return chars * size * 0.55;
  c.font = fontString(spec, REF);
  const w = c.measureText(text).width;
  return (w / REF) * size + chars * letterSpacingEm * size;
};

/** Ink extents of `text` at `size` px (ascent above / descent below baseline). */
export const inkMetrics = (
  text: string,
  spec: FontSpec,
  size: number,
): { ascent: number; descent: number } => {
  const c = getCtx();
  if (!c) return { ascent: size * 0.72, descent: size * 0.05 };
  c.font = fontString(spec, REF);
  const m = c.measureText(text);
  return {
    ascent: (m.actualBoundingBoxAscent / REF) * size,
    descent: (m.actualBoundingBoxDescent / REF) * size,
  };
};

/** Largest font size (clamped to [min, max]) that fits `text` in `width`. */
export const fitSize = (
  text: string,
  spec: FontSpec,
  width: number,
  { min = 1, max = Infinity, letterSpacingEm = 0 } = {},
): number => {
  const per = textWidth(text, spec, 1, letterSpacingEm);
  if (per <= 0) return max;
  return Math.max(min, Math.min(max, width / per));
};

/**
 * Left edges and widths of each character when `text` is set at `size`,
 * so words can be animated letter by letter while keeping their kerning.
 */
export const letterLayout = (
  text: string,
  spec: FontSpec,
  size: number,
  letterSpacingEm = 0,
): { char: string; left: number; width: number }[] => {
  const chars = Array.from(text);
  let prefix = "";
  return chars.map((ch) => {
    const left = textWidth(prefix, spec, size, letterSpacingEm);
    prefix += ch;
    const right = textWidth(prefix, spec, size, letterSpacingEm);
    return { char: ch, left, width: right - left };
  });
};

/**
 * Font-box ascent/descent at `size`. With `line-height: 1` the baseline
 * sits at `size / 2 + (ascent - descent) / 2` from the top of the line box.
 */
export const fontBox = (
  spec: FontSpec,
  size: number,
): { ascent: number; descent: number } => {
  const c = getCtx();
  if (!c) return { ascent: size * 0.9, descent: size * 0.25 };
  c.font = fontString(spec, REF);
  const m = c.measureText("Hg");
  return {
    ascent: (m.fontBoundingBoxAscent / REF) * size,
    descent: (m.fontBoundingBoxDescent / REF) * size,
  };
};

/**
 * Offset (px, +down) from the centre of a `line-height: 1` box to the
 * visual centre of its capitals. Subtract it to centre caps on a point.
 */
export const capCenterOffset = (spec: FontSpec, size: number): number => {
  const { ascent, descent } = fontBox(spec, size);
  const cap = inkMetrics("H", spec, size).ascent;
  return (ascent - descent) / 2 - cap / 2;
};
