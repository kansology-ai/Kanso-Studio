import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";

/**
 * Per-character text measurement for the Jersey and Vault scenes, which lay
 * letters out one by one (arched jersey names, towering vault letters).
 *
 * Widths are measured with a canvas at 100px once the font has loaded.
 * Nothing is cached across font states, so a measurement taken before the
 * font arrived can never stick (unlike a global measureText cache).
 */

export type FontSpec = {
  readonly family: string;
  readonly weight?: number | string;
  readonly style?: "normal" | "italic";
};

const REF_SIZE = 100;

const fontString = (font: FontSpec, size: number): string =>
  `${font.style ?? "normal"} ${font.weight ?? 400} ${size}px ${font.family}`;

/**
 * True once `font` can be used for measuring. Holds the render with
 * delayRender until then, so the first captured frame is already correct.
 */
export const useFontReady = (font: FontSpec): boolean => {
  const spec = fontString(font, REF_SIZE);
  const [ready, setReady] = useState(
    () => typeof document !== "undefined" && document.fonts.check(spec),
  );
  const [handle] = useState(() =>
    ready ? null : delayRender(`Loading ${font.family} for measuring`),
  );
  const released = useRef(false);

  useEffect(() => {
    if (ready) {
      return;
    }
    let alive = true;
    const release = () => {
      if (alive) {
        setReady(true);
      }
      if (handle !== null && !released.current) {
        released.current = true;
        continueRender(handle);
      }
    };
    document.fonts.load(spec).then(release, release);
    return () => {
      alive = false;
    };
  }, [handle, ready, spec]);

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
