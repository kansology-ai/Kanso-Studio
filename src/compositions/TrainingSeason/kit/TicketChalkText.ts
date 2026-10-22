import { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";

/**
 * Text measuring for the Tickets and Chalk scenes (scenes 4 and 5).
 *
 * Canvas `measureText` gives the advance width AND the ink box of a string,
 * which lets us centre single letters of very different fonts exactly and
 * fit any lyric to a width. Measurements are only trusted once the fonts are
 * loaded: `useFontsReady` holds the render (delayRender) until they are and
 * then re-renders, so a frame is never captured with fallback-font metrics.
 */

export type FontSpec = {
  readonly family: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
};

export const fontShorthand = (f: FontSpec, size: number): string =>
  `${f.style ?? "normal"} ${f.weight ?? 400} ${size}px ${f.family}`;

let canvas: HTMLCanvasElement | null = null;

const context = (): CanvasRenderingContext2D | null => {
  if (typeof document === "undefined") return null;
  if (!canvas) canvas = document.createElement("canvas");
  return canvas.getContext("2d");
};

export type Ink = {
  /** Advance width (what the text occupies in a line). */
  readonly width: number;
  /** Ink box relative to the pen position (left/right of x, above/below the baseline). */
  readonly left: number;
  readonly right: number;
  readonly ascent: number;
  readonly descent: number;
};

/** Advance width and ink box of `text` at `size` px. */
export const inkOf = (text: string, f: FontSpec, size: number): Ink => {
  const ctx = context();
  if (!ctx) {
    const w = text.length * size * 0.55;
    return { width: w, left: 0, right: w, ascent: size * 0.7, descent: 0 };
  }
  ctx.font = fontShorthand(f, size);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(text);
  return {
    width: m.width,
    left: m.actualBoundingBoxLeft,
    right: m.actualBoundingBoxRight,
    ascent: m.actualBoundingBoxAscent,
    descent: m.actualBoundingBoxDescent,
  };
};

/** Font size that makes `text` exactly `width` wide, capped at `max`. */
export const fitSize = (
  text: string,
  f: FontSpec,
  width: number,
  max: number,
): number => {
  const ref = 100;
  const w = inkOf(text, f, ref).width;
  if (w <= 0) return max;
  return Math.min(max, (ref * width) / w);
};

const primaryFamily = (family: string): string =>
  family
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "");

const normWeight = (w: string | number | undefined): string => {
  const v = String(w ?? 400);
  if (v === "normal") return "400";
  if (v === "bold") return "700";
  return v;
};

/**
 * Is a FontFace for this spec in document.fonts and loaded? (`@remotion/fonts`
 * only adds a face once it has loaded, and `document.fonts.check()` returns
 * true while no face is registered yet, so it cannot be used here.)
 */
const faceLoaded = (f: FontSpec): boolean => {
  if (typeof document === "undefined") return false;
  const family = primaryFamily(f.family);
  let found = false;
  document.fonts.forEach((face) => {
    if (
      face.status === "loaded" &&
      face.family.replace(/['"]/g, "") === family &&
      normWeight(face.weight) === normWeight(f.weight) &&
      face.style === (f.style ?? "normal")
    ) {
      found = true;
    }
  });
  return found;
};

/**
 * True once every font in `specs` is loaded. Until then the render is held
 * with delayRender, and the component re-renders when they are ready.
 */
export const useFontsReady = (specs: readonly FontSpec[]): boolean => {
  const check = () => specs.every(faceLoaded);
  const [ready, setReady] = useState(check);
  const [handle] = useState(() =>
    ready ? null : delayRender("Waiting for fonts to measure lyric text"),
  );

  useEffect(() => {
    if (ready) return;
    let alive = true;
    const poll = () => {
      if (!alive) return;
      if (specs.every(faceLoaded)) {
        setReady(true);
      } else {
        setTimeout(poll, 30);
      }
    };
    poll();
    return () => {
      alive = false;
    };
    // The spec list is static per scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && handle !== null) continueRender(handle);
  }, [ready, handle]);

  return ready;
};
