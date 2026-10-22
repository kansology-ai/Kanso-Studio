import type React from "react";
import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { useStage } from "../../../components/Stage3D";
import { project, type Vec3 } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";

/**
 * Ribbon Scene kit: an arena LED ribbon board (a band wrapped around a
 * vertical cylinder) that only builds what the camera can see.
 *
 * Unlike Ring3D, which copies the whole strip into every panel, each panel
 * here renders only the strip items that overlap it, panels outside the
 * frame are skipped, and a panel is drawn either from outside (with the
 * strip) or from inside (plain back of the board), never both. That keeps a
 * stack of 7 boards with long lyric strips at a few hundred DOM nodes.
 *
 * Strip coordinates: x runs 0 → circumference along the band, left to right
 * when read from outside. Strip x maps to the world angle
 * `turn + x / circumference * 360` (0° faces +z, positive angles go to +x),
 * the same convention as `orbitCamera` azimuths.
 */

const DEG = Math.PI / 180;

export type BandItem = {
  readonly key: string;
  /** Left edge along the strip, px (0 … circumference; wraps). */
  readonly x: number;
  readonly width: number;
  readonly node: React.ReactNode;
};

export type BandPanel = {
  readonly index: number;
  /** Strip x of the panel's left edge (inner strip x when seen inside). */
  readonly stripX: number;
  /** Panel width along the strip. */
  readonly width: number;
  /**
   * Angle of the panel centre relative to the camera's azimuth around the
   * band axis, in (-180, 180]. 0 faces the camera; positive is to its right.
   */
  readonly phi: number;
  /** 1 when the panel faces the camera head-on, 0 at a grazing angle. */
  readonly facing: number;
  /** True when the panel is seen from outside. */
  readonly outside: boolean;
  /** Angular width of the panel (deg). */
  readonly span: number;
};

export type PanelLook = {
  /** Style of the panel (background, colour inherited by the strip items). */
  readonly style?: React.CSSProperties;
  /** Opacity of the strip items on this panel. */
  readonly content?: number;
  /** Extra layers drawn under the items (light behind the text). */
  readonly underlay?: React.ReactNode;
  /** Extra layers drawn over the items (scan bars, flashes). */
  readonly overlay?: React.ReactNode;
};

const wrap180 = (deg: number): number => {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
};

/** Camera azimuth around the world Y axis (same convention as orbitCamera). */
export const azimuthOf = (p: { x: number; z: number }): number =>
  Math.atan2(p.x, p.z) / DEG;

export const RibbonBand: React.FC<{
  readonly radius: number;
  readonly height: number;
  /** World y of the band's centre line (+y is down). */
  readonly y: number;
  /** Number of flat panels (≤ 64). */
  readonly segments: number;
  /** Spin of the band in degrees. */
  readonly turn: number;
  readonly items: readonly BandItem[];
  /** Look of a panel seen from outside. */
  readonly outer: (p: BandPanel) => PanelLook;
  /** Look of a panel seen from inside (the back of the board). */
  readonly inner: (p: BandPanel) => PanelLook;
  /**
   * Strip shown on the inside, laid out so it reads left to right from
   * inside the ring (inner strip x runs the opposite way round).
   */
  readonly innerItems?: readonly BandItem[];
  /** Darkens panels as they turn away from the camera (0 … 1). */
  readonly shade?: number;
  /** Extra uniform darkening of the whole board (0 … 1), e.g. focus falloff. */
  readonly dim?: number;
}> = ({
  radius,
  height,
  y,
  segments,
  turn,
  items,
  outer,
  inner,
  innerItems = [],
  shade = 0.6,
  dim = 0,
}) => {
  const { camera } = useStage();
  const { width: frameW, height: frameH } = useLayout();
  const n = Math.max(8, Math.round(segments));
  const circumference = 2 * Math.PI * radius;
  const panel = circumference / n;
  const apothem = radius * Math.cos(Math.PI / n);
  const camAz = azimuthOf(camera);
  const marginX = frameW * 0.08;
  const marginY = frameH * 0.08;
  const halfW = frameW / 2 + marginX;
  const halfH = frameH / 2 + marginY;

  const panels: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const theta = turn + ((i + 0.5) * 360) / n;
    const s = Math.sin(theta * DEG);
    const c = Math.cos(theta * DEG);
    const centre: Vec3 = { x: apothem * s, y, z: apothem * c };
    const toCam = {
      x: camera.x - centre.x,
      y: camera.y - centre.y,
      z: camera.z - centre.z,
    };
    const len = Math.hypot(toCam.x, toCam.y, toCam.z) || 1;
    const dot = (toCam.x * s + toCam.z * c) / len;
    const isOuter = dot > 0;

    // Frustum cull on the four corners.
    const tx = c * (panel / 2);
    const tz = -s * (panel / 2);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let behind = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const pr = project(
          {
            x: centre.x + sx * tx,
            y: y + (sy * height) / 2,
            z: centre.z + sx * tz,
          },
          camera,
        );
        if (!pr.visible) {
          behind++;
          continue;
        }
        minX = Math.min(minX, pr.x);
        maxX = Math.max(maxX, pr.x);
        minY = Math.min(minY, pr.y);
        maxY = Math.max(maxY, pr.y);
      }
    }
    if (behind === 4) continue;
    if (
      behind === 0 &&
      (maxX < -halfW || minX > halfW || maxY < -halfH || minY > halfH)
    ) {
      continue;
    }

    // Inside, panel i shows inner strip [(n-1-i)·P, (n-i)·P].
    const start = isOuter ? i * panel : (n - 1 - i) * panel;
    const info: BandPanel = {
      index: i,
      stripX: start,
      width: panel,
      phi: wrap180(theta - camAz),
      facing: Math.abs(dot),
      outside: isOuter,
      span: 360 / n,
    };
    const shadeAlpha =
      1 - (1 - shade * Math.pow(1 - Math.abs(dot), 1.4)) * (1 - dim);

    const look = isOuter ? outer(info) : inner(info);
    const source = isOuter ? items : innerItems;
    const visibleItems: React.ReactNode[] = [];
    if ((look.content ?? 1) > 0.002) {
      for (const item of source) {
        for (const shift of [0, -circumference, circumference]) {
          const left = item.x + shift - start;
          if (left < panel + 1 && left + item.width > -1) {
            visibleItems.push(
              <div
                key={`${item.key}${shift}`}
                style={{
                  position: "absolute",
                  left: left + 0.5,
                  top: 0,
                  width: item.width,
                  height,
                }}
              >
                {item.node}
              </div>,
            );
          }
        }
      }
    }

    panels.push(
      <div
        key={`${isOuter ? "o" : "i"}${i}`}
        style={{
          position: "absolute",
          left: -panel / 2 - 0.5,
          top: -height / 2,
          width: panel + 1,
          height,
          overflow: "hidden",
          transform: isOuter
            ? `rotateY(${theta}deg) translateZ(${apothem}px)`
            : `rotateY(${theta + 180}deg) translateZ(${-apothem}px)`,
          ...look.style,
        }}
      >
        {look.underlay}
        {visibleItems.length > 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: look.content ?? 1,
            }}
          >
            {visibleItems}
          </div>
        ) : null}
        {look.overlay}
        {shadeAlpha > 0.01 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `rgba(0,0,0,${shadeAlpha})`,
            }}
          />
        ) : null}
      </div>,
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        transformStyle: "preserve-3d",
        transform: `translate3d(0px, ${y}px, 0px)`,
      }}
    >
      {panels}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Text measuring (canvas, no global cache, gated on the fonts).       */
/* ------------------------------------------------------------------ */

export type RibbonFont = {
  readonly family: string;
  readonly weight: number;
  readonly italic?: boolean;
  /** Letter spacing in em. */
  readonly tracking?: number;
};

const fontString = (f: RibbonFont, size: number) =>
  `${f.italic ? "italic" : "normal"} ${f.weight} ${size}px ${f.family}`;

/**
 * True once every font can be measured. Holds the render with delayRender
 * until then, so no frame is ever captured with fallback measurements.
 */
export const useRibbonFontsReady = (list: readonly RibbonFont[]): boolean => {
  const specs = list.map((f) => fontString(f, 100)).join("|");
  const [ready, setReady] = useState(
    () =>
      typeof document !== "undefined" &&
      specs.split("|").every((s) => document.fonts.check(s)),
  );
  const [handle] = useState(() =>
    ready ? null : delayRender("Ribbon scene: loading fonts for measuring"),
  );
  const released = useRef(false);
  useEffect(() => {
    if (ready) {
      if (handle !== null && !released.current) {
        released.current = true;
        continueRender(handle);
      }
      return;
    }
    let alive = true;
    Promise.all(specs.split("|").map((s) => document.fonts.load(s)))
      .catch(() => undefined)
      .then(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [handle, ready, specs]);
  return ready;
};

let canvas: HTMLCanvasElement | null = null;

/** Advance width of `text` in `font` at `size` px (0 before fonts load). */
export const measureRibbonText = (
  text: string,
  font: RibbonFont,
  size: number,
): number => {
  if (typeof document === "undefined") return text.length * size * 0.5;
  canvas = canvas ?? document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * size * 0.5;
  ctx.font = fontString(font, 100);
  const w = ctx.measureText(text).width;
  const tracking = (font.tracking ?? 0) * 100 * [...text].length;
  return ((w + tracking) * size) / 100;
};
