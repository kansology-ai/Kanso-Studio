import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";

/**
 * Per-character text measurement for the Jersey and Vault scenes, which lay
 * letters out one by one (arched jersey names, towering vault letters).
 *
 * Widths are measured with a canvas at 100px once the font's FontFace is
 * registered and loaded. Nothing is cached, so a measurement taken before
 * the font arrived can never stick (unlike a global measureText cache).
 */

export type FontSpec = {
  readonly family: string;
  readonly weight?: number | string;
  readonly style?: "normal" | "italic";
};

const REF_SIZE = 100;

const fontString = (font: FontSpec, size: number): string =>
  `${font.style ?? "normal"} ${font.weight ?? 400} ${size}px ${font.family}`;

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
 * Is a loaded FontFace for this spec registered in document.fonts?
 * `@remotion/fonts` only adds a face after it has loaded, and while no face
 * is registered `document.fonts.check()` / `.load()` succeed against the
 * fallback font, so neither can be trusted here.
 */
const faceLoaded = (font: FontSpec): boolean => {
  if (typeof document === "undefined") return false;
  const family = primaryFamily(font.family);
  let found = false;
  document.fonts.forEach((face) => {
    if (
      face.status === "loaded" &&
      face.family.replace(/['"]/g, "") === family &&
      normWeight(face.weight) === normWeight(font.weight) &&
      face.style === (font.style ?? "normal")
    ) {
      found = true;
    }
  });
  return found;
};

/** Give up waiting (and measure with whatever is there) after ~15 s. */
const POLL_MS = 30;
const MAX_POLLS = 500;

/**
 * True once `font` is loaded and can be measured. Holds the render with
 * delayRender until then and re-renders, so no frame is ever captured with
 * fallback-font metrics.
 */
export const useFontReady = (font: FontSpec): boolean => {
  const [ready, setReady] = useState(() => faceLoaded(font));
  const [handle] = useState(() =>
    ready ? null : delayRender(`Loading ${font.family} for measuring`),
  );
  const released = useRef(false);

  useEffect(() => {
    if (ready) return;
    let alive = true;
    let polls = 0;
    const poll = () => {
      if (!alive) return;
      polls++;
      if (faceLoaded(font) || polls > MAX_POLLS) {
        setReady(true);
      } else {
        setTimeout(poll, POLL_MS);
      }
    };
    poll();
    return () => {
      alive = false;
    };
    // The font spec is a module constant per scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && handle !== null && !released.current) {
      released.current = true;
      continueRender(handle);
    }
  }, [ready, handle]);

  return ready;
};

let ctx: CanvasRenderingContext2D | null = null;

/**
 * Advance width of each character (code point) of `text` at font size 1,
 * so multiply by the font size you render at. Falls back to 0.62em per
 * character when no canvas is available.
 */
export const charAdvances = (text: string, font: FontSpec): number[] => {
  const chars = Array.from(text);
  if (typeof document === "undefined") {
    return chars.map(() => 0.62);
  }
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
  }
  if (!ctx) {
    return chars.map(() => 0.62);
  }
  ctx.font = fontString(font, REF_SIZE);
  return chars.map((ch) => ctx!.measureText(ch).width / REF_SIZE);
};

/** Width of a whole string at font size 1 (kerning included). */
export const textAdvance = (text: string, font: FontSpec): number => {
  if (typeof document === "undefined") {
    return Array.from(text).length * 0.62;
  }
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
  }
  if (!ctx) {
    return Array.from(text).length * 0.62;
  }
  ctx.font = fontString(font, REF_SIZE);
  return ctx.measureText(text).width / REF_SIZE;
};
