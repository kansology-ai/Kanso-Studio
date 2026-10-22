import type React from "react";
import { useId, useMemo } from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  random,
  type InteractivitySchema,
} from "remotion";
import { Node3D, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE } from "../../../lib/animation";
import { orbitCamera, project, shake, vec3 } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { BroadcastFinish, Flash, WhipBlur } from "../kit/fx";
import {
  fitSize,
  inkOf,
  useFontsReady,
  type FontSpec,
} from "../kit/TicketChalkText";
import {
  beatAt,
  localCues,
  sceneLength,
  sceneStart,
  splitSlots,
  TRAINING_SEASON_TIMING,
} from "../timing";

/**
 * Scene 5, CHALKBOARD: a coach's play written live. The five slots are
 * handwritten in chalk at their cues (left-to-right reveal with the chalk
 * stick riding the edge and dust falling off it), while play-diagram
 * doodles (circle, underline, X's and O's, a route arrow, a star) are drawn
 * on with stroke-dash on the beats. The board is a tilted plane in a
 * Stage3D; the camera tracks the writing down the board and finally pushes
 * into the last word with a zoom blur.
 */

const LEN = sceneLength("chalk");
const START = sceneStart("chalk");
const CUES = localCues("chalk", TRAINING_SEASON_TIMING.cues.chalk);
const EPS = 1e-3;
/** Board rotation pivot / centre of the lyric safe band (x 80…940), world px. */
const CX = -30;
const CHALK: FontSpec = { family: fonts.chalk, weight: 400 };
const FONT_LIST = [CHALK];

/** Handwriting pace: quick into the stroke, eases off at the end of the word. */
const WRITE = Easing.bezier(0.3, 0.55, 0.5, 1);

/** Local scene time of beat n. */
const beatLocal = (n: number) => beatAt(n) - START;

type WordBox = {
  readonly text: string;
  readonly line: number;
  readonly size: number;
  /** Pen position (left of the advance box) and baseline, board coords. */
  readonly x: number;
  readonly baseline: number;
  readonly inkL: number;
  readonly inkR: number;
  readonly top: number;
  readonly bottom: number;
  readonly cue: number;
  readonly dur: number;
};

type Line = {
  readonly size: number;
  readonly center: number;
  readonly left: number;
  readonly width: number;
};

type Layout = {
  readonly words: WordBox[];
  readonly lines: Line[];
  readonly blockTop: number;
  readonly blockBottom: number;
};

const rot = (x: number, y: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: c * x - s * y, y: s * x + c * y };
};

const mixN = (a: number, b: number, k: number) => a + (b - a) * k;

/* ------------------------------------------------------------------ */
/* Doodle paths                                                        */
/* ------------------------------------------------------------------ */

const ellipsePath = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: string,
  turns = 1.08,
): string => {
  const n = 54;
  const a0 = -2.5 + random(`${seed}-a0`) * 0.6;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = a0 + k * Math.PI * 2 * turns;
    const wob = 1 + 0.035 * Math.sin(a * 2 + random(`${seed}-w`) * 6) + 0.06 * k;
    pts.push(
      `${(cx + Math.cos(a) * rx * wob).toFixed(1)},${(cy + Math.sin(a) * ry * wob).toFixed(1)}`,
    );
  }
  return `M${pts[0]} L${pts.slice(1).join(" ")}`;
};

const starPath = (cx: number, cy: number, r: number): string => {
  const pts = new Array(6).fill(0).map((_, i) => {
    const a = ((-90 + i * 144) * Math.PI) / 180;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  });
  return `M${pts[0]} L${pts.slice(1).join(" ")}`;
};

type Doodle = {
  readonly key: string;
  readonly d: string;
  readonly start: number;
  readonly dur: number;
  readonly color: string;
  readonly width: number;
};

/* ------------------------------------------------------------------ */
/* Zoom blur for the exit push                                         */
/* ------------------------------------------------------------------ */

const ZoomBlur: React.FC<{
  readonly amount: number;
  readonly children: React.ReactNode;
}> = ({ amount, children }) => {
  if (amount < 0.01) return <AbsoluteFill>{children}</AbsoluteFill>;
  // Equal-weight average of progressively scaled copies (copy i drawn at
  // 1/(i+1) over the stack), softened so the copies read as one smear.
  const copies = [0, 1, 2, 3, 4, 5];
  return (
    <AbsoluteFill>
      {copies.map((i) => (
        <AbsoluteFill
          key={i}
          style={{
            scale: String(1 + amount * 0.045 * i),
            opacity: 1 / (i + 1),
            filter: i > 0 ? `blur(${(2 + i * 1.5) * amount}px)` : undefined,
          }}
        >
          {children}
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type ChalkSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const ChalkSceneInner: React.FC<ChalkSceneProps> = ({ words, style }) => {
  const { t, reel, pulse, fps } = useSceneClock("chalk");
  const { px, unit } = useLayout();
  const ready = useFontsReady(FONT_LIST);
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");

  /* ---- layout (board coordinates: origin = rotation pivot) ---- */
  const layout: Layout = useMemo(() => {
    const u = (v: number) => v * unit;
    const slots = splitSlots(words).slice(0, CUES.length);
    const n = slots.length;
    if (!ready || n === 0) {
      return { words: [], lines: [], blockTop: 0, blockBottom: 0 };
    }
    const LINE_W = u(800);
    const MAX = u(285);
    const SPLIT_BELOW = u(205);
    const template = [[0, 1], [2], [3, 4]]
      .map((g) => g.filter((i) => i < n))
      .filter((g) => g.length > 0);
    const groups: number[][] = [];
    template.forEach((g) => {
      if (g.length === 2) {
        const joined = `${slots[g[0]]} ${slots[g[1]]}`;
        if (fitSize(joined, CHALK, LINE_W, MAX) < SPLIT_BELOW) {
          groups.push([g[0]], [g[1]]);
          return;
        }
      }
      groups.push(g);
    });
    const indents = [0.06, 0.62, 0.22, 0.8, 0.4];
    const lineData = groups.map((g, l) => {
      const text = g.map((i) => slots[i]).join(" ");
      const size = fitSize(text, CHALK, LINE_W, MAX);
      const ink = inkOf(text, CHALK, size);
      const width = ink.width;
      const left = -LINE_W / 2 + (LINE_W - width) * indents[l % indents.length];
      return { g, text, size, ink, width, left, lh: size * 0.9 };
    });
    const total = lineData.reduce((a, b) => a + b.lh, 0);
    let cursor = -total / 2;
    const lines: Line[] = [];
    const wordsOut: WordBox[] = [];
    lineData.forEach((ld, l) => {
      const center = cursor + ld.lh / 2;
      cursor += ld.lh;
      lines.push({ size: ld.size, center, left: ld.left, width: ld.width });
      const baseline = center + (ld.ink.ascent - ld.ink.descent) / 2;
      let pen = ld.left;
      ld.g.forEach((slot, j) => {
        if (j > 0) pen += inkOf(" ", CHALK, ld.size).width;
        const text = slots[slot];
        const ink = inkOf(text, CHALK, ld.size);
        const cue = CUES[slot];
        const next = CUES[slot + 1] ?? LEN - 0.05;
        const dur = Math.max(
          0.16,
          Math.min(0.1 + 0.025 * text.length, 0.3, next - cue - 0.03),
        );
        wordsOut.push({
          text,
          line: l,
          size: ld.size,
          x: pen,
          baseline,
          inkL: pen - ink.left,
          inkR: pen + ink.right,
          top: baseline - ink.ascent,
          bottom: baseline + ink.descent,
          cue,
          dur,
        });
        pen += ink.width;
      });
    });
    return {
      words: wordsOut,
      lines,
      blockTop: -total / 2,
      blockBottom: total / 2,
    };
  }, [ready, words, unit]);

  const W = layout.words;
  const L = layout.lines;

  /* ---- doodles, timed to beats ---- */
  const doodles: Doodle[] = useMemo(() => {
    if (W.length === 0) return [];
    const u = (v: number) => v * unit;
    const out: Doodle[] = [];
    const sw = u(9);
    const w0 = W[0];
    // Circle around slot 1 (lands on beat 38.5).
    out.push({
      key: "circle",
      d: ellipsePath(
        (w0.inkL + w0.inkR) / 2,
        (w0.top + w0.bottom) / 2,
        (w0.inkR - w0.inkL) / 2 + u(38),
        (w0.bottom - w0.top) / 2 + u(26),
        "circle",
      ),
      start: beatLocal(38.5),
      dur: 0.22,
      color: stadium.volt,
      width: sw,
    });
    // Underline swoosh under slot 2 (beat 39).
    const w1 = W[1];
    if (w1) {
      const y = w1.baseline + w1.size * 0.16;
      const x0 = w1.inkL - u(10);
      const x1 = w1.inkR + u(26);
      const wd = x1 - x0;
      out.push({
        key: "underline",
        d: `M${x0},${y} C${x0 + wd * 0.3},${y + u(18)} ${x0 + wd * 0.7},${y + u(4)} ${x1},${y - u(12)} L${x1 - u(46)},${y + u(16)}`,
        start: beatLocal(39),
        dur: 0.16,
        color: stadium.chalk,
        width: sw,
      });
    }
    // Free gaps beside each line (doodles may spill a little past the
    // lyric band, they are decoration).
    const LINE_W = u(800);
    const gapsFree = L.flatMap((ln, l) => [
      { l, side: -1, x0: -LINE_W / 2 - u(70), x1: ln.left - u(25) },
      { l, side: 1, x0: ln.left + ln.width + u(25), x1: LINE_W / 2 + u(70) },
    ]).map((g) => ({ ...g, free: g.x1 - g.x0 }));
    // X's and O's in the roomiest gap beside a line (beat 39.5).
    let used = -1;
    if (L.length > 0) {
      let bi = 0;
      gapsFree.forEach((g, i) => {
        if (g.free > gapsFree[bi].free) bi = i;
      });
      used = bi;
      const best = { l: gapsFree[bi].l, side: gapsFree[bi].side, free: gapsFree[bi].free - u(95) };
      const ln = L[best.l];
      const fw = u(230);
      const scale = Math.max(0.62, Math.min(1, (best.free + u(60)) / fw));
      const away = Math.max(best.free / 2, (fw * scale) / 2 + u(40));
      const cx =
        best.side > 0 ? ln.left + ln.width + away : ln.left - away;
      const cy = ln.center;
      const o = (dx: number, dy: number, i: number) =>
        out.push({
          key: `o${i}`,
          d: ellipsePath(cx + dx * scale, cy + dy * scale, u(24) * scale, u(24) * scale, `o${i}`, 1.05),
          start: beatLocal(39.5) + i * 0.035,
          dur: 0.1,
          color: stadium.chalk,
          width: u(7),
        });
      const x = (dx: number, dy: number, i: number) => {
        const r = u(20) * scale;
        const ax = cx + dx * scale;
        const ay = cy + dy * scale;
        out.push({
          key: `x${i}`,
          d: `M${ax - r},${ay - r} L${ax + r},${ay + r} M${ax + r},${ay - r} L${ax - r},${ay + r}`,
          start: beatLocal(39.5) + 0.05 + i * 0.035,
          dur: 0.1,
          color: stadium.signal,
          width: u(7),
        });
      };
      o(-u(80), -u(42), 0);
      o(0, -u(42), 1);
      o(u(80), -u(42), 2);
      x(-u(42), u(48), 0);
      x(u(42), u(48), 1);
    }
    // Route arrow from the end of slot 3 to the start of slot 4 (beat 40).
    const w2 = W[2];
    const w3 = W[3];
    if (w2 && w3) {
      const sx = w2.inkR + u(18);
      const sy = (w2.top + w2.bottom) / 2;
      const ex = w3.inkL - u(16);
      const ey = w3.top + (w3.bottom - w3.top) * 0.25;
      const bend = Math.max(sx, ex) + u(150);
      const cy = (sy + ey) / 2;
      out.push({
        key: "arrow",
        d: `M${sx},${sy} Q${bend},${cy} ${ex},${ey}`,
        start: beatLocal(40),
        dur: 0.16,
        color: stadium.volt,
        width: sw,
      });
      // Arrowhead along the curve's end tangent.
      const tx = ex - bend;
      const ty = ey - cy;
      const len = Math.hypot(tx, ty) || 1;
      const ux = tx / len;
      const uy = ty / len;
      const hl = u(40);
      const a1 = rot(-ux * hl, -uy * hl, 32);
      const a2 = rot(-ux * hl, -uy * hl, -32);
      out.push({
        key: "arrowhead",
        d: `M${ex + a1.x},${ey + a1.y} L${ex},${ey} L${ex + a2.x},${ey + a2.y}`,
        start: beatLocal(40) + 0.15,
        dur: 0.07,
        color: stadium.volt,
        width: sw,
      });
    }
    // Star by the last word (beat 40.5).
    const wl = W[W.length - 1];
    if (W.length >= 2) {
      const r = u(46);
      // The free gap nearest the last word's line, not the formation's.
      let pick = -1;
      gapsFree.forEach((g, i) => {
        if (i === used || g.free < r * 2 + u(10)) return;
        if (pick < 0) {
          pick = i;
          return;
        }
        const d = Math.abs(g.l - wl.line) - (g.l >= wl.line ? 0.5 : 0);
        const dp =
          Math.abs(gapsFree[pick].l - wl.line) -
          (gapsFree[pick].l >= wl.line ? 0.5 : 0);
        if (d < dp) pick = i;
      });
      let sx = u(300);
      let sy = (L[L.length - 1]?.center ?? 0) + wl.size * 0.8;
      if (pick >= 0) {
        const g = gapsFree[pick];
        sx = g.side > 0 ? g.x0 + r + u(10) : g.x1 - r - u(10);
        sy = L[g.l].center - u(8);
      }
      out.push({
        key: "star",
        d: starPath(sx, sy, r),
        start: beatLocal(40.5),
        dur: 0.16,
        color: stadium.signal,
        width: u(8),
      });
    }
    return out;
  }, [W, L, unit]);

  /* ---- writing progress + chalk stick ---- */
  const revealOf = (w: WordBox, time: number) =>
    interpolate(time - w.cue, [-0.02, w.dur], [0, 1], {
      ...CLAMP,
      easing: WRITE,
    });
  const tipAt = (time: number): { x: number; y: number; lift: number } => {
    if (W.length === 0) return { x: 0, y: 0, lift: 1 };
    const wob = (w: WordBox, p: number) =>
      Math.sin(p * Math.max(3, w.text.length) * Math.PI * 0.9) * w.size * 0.14;
    const startOf = (w: WordBox) => ({
      x: w.inkL,
      y: (w.top + w.bottom) / 2 + w.size * 0.05,
    });
    const first = startOf(W[0]);
    if (time < W[0].cue) {
      const k = interpolate(time, [0, W[0].cue], [0, 1], {
        ...CLAMP,
        easing: EASE.out,
      });
      return {
        x: first.x + px(520) * (1 - k),
        y: first.y + px(380) * (1 - k),
        lift: 1 - k,
      };
    }
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      const end = w.cue + w.dur;
      const next = W[i + 1];
      if (time <= end || !next) {
        const p = revealOf(w, time);
        return {
          x: w.inkL + (w.inkR - w.inkL) * p,
          y: (w.top + w.bottom) / 2 + w.size * 0.05 - wob(w, p),
          lift: time > end ? Math.min(1, (time - end) / 0.15) : 0,
        };
      }
      if (time < next.cue) {
        const k = interpolate(time, [end, next.cue], [0, 1], {
          ...CLAMP,
          easing: EASE.inOut,
        });
        const a = { x: w.inkR, y: (w.top + w.bottom) / 2 + w.size * 0.05 };
        const b = startOf(next);
        return {
          x: mixN(a.x, b.x, k),
          y: mixN(a.y, b.y, k) - Math.sin(k * Math.PI) * px(60),
          lift: Math.sin(k * Math.PI),
        };
      }
    }
    return { x: 0, y: 0, lift: 1 };
  };
  const tip = tipAt(t);

  /* ---- dust ---- */
  const dust = W.flatMap((w, wi) =>
    new Array(13).fill(0).map((_, i) => {
      const spawn = w.cue + (i / 13) * w.dur;
      const age = t - spawn;
      const life = 0.5 + random(`dl-${wi}-${i}`) * 0.25;
      if (age < 0 || age > life) return null;
      const at = tipAt(spawn);
      const vx = (random(`dvx-${wi}-${i}`) - 0.35) * px(160);
      const vy = -random(`dvy-${wi}-${i}`) * px(90);
      return {
        key: `${wi}-${i}`,
        x: at.x + vx * age,
        y: at.y + vy * age + 0.5 * px(1400) * age * age,
        r: px(2.5 + random(`dr-${wi}-${i}`) * 5.5),
        o: (1 - age / life) * 0.85,
      };
    }),
  ).filter((d): d is NonNullable<typeof d> => d !== null);

  /* ---- camera ---- */
  const prog = t / LEN;
  const flashIn = interpolate(t, [0, 0.18], [1, 0], {
    ...CLAMP,
    easing: EASE.out,
  });
  // Reaches 1 on the scene's last frame.
  const exit = interpolate(t, [LEN - 0.17, LEN - 1 / fps], [0, 1], {
    ...CLAMP,
    easing: EASE.in,
  });
  const lineAim = (l: number) => {
    const ln = L[l];
    if (!ln) return 0;
    const off = Math.max(
      px(-210),
      Math.min(px(320), ln.center - L[0].center - px(210)),
    );
    return ln.center - off;
  };
  let aimY = L.length > 0 ? lineAim(0) - px(80) : 0;
  W.forEach((w) => {
    const k = interpolate(t, [w.cue - 0.12, w.cue + 0.16], [0, 1], {
      ...CLAMP,
      easing: EASE.inOut,
    });
    aimY = mixN(aimY, lineAim(w.line), k);
  });
  let aimX = Math.sin(t * 2.1) * px(14);
  const lastW = W[W.length - 1];
  if (lastW) {
    aimX = mixN(aimX, (lastW.inkL + lastW.inkR) / 2, exit);
    aimY = mixN(aimY, (lastW.top + lastW.bottom) / 2, exit);
  }
  let push = 0;
  let kick = 0;
  W.forEach((w, i) => {
    const s = t - w.cue;
    if (s >= -EPS) {
      const d = Math.exp(-Math.max(0, s) / 0.08);
      push = Math.max(push, d);
      kick += d * (i % 2 === 0 ? 2 : -2);
    }
  });
  const boardRz = interpolate(prog, [0, 1], [-4, 2.5]);
  const azimuth = interpolate(prog, [0, 1], [-12, 9]);
  const elevation = interpolate(prog, [0, 1], [12, -6]);
  const roll = interpolate(prog, [0, 1], [-2, 2]) + kick + 5 * exit;
  const baseDist =
    px(interpolate(prog, [0, 1], [950, 890])) *
    (1 - 0.08 * push) *
    (1 - 0.7 * exit) *
    (1 + 0.08 * flashIn);
  const buildCam = (ax: number, dist: number) => {
    const aw = rot(ax, aimY, boardRz);
    return orbitCamera({
      target: vec3(px(CX) + aw.x + px(30), aw.y, 0),
      distance: dist,
      azimuth,
      elevation,
      roll,
      focal: px(950),
    });
  };
  // Keep the line being written inside the lyric band (x 80…940) whatever
  // the tilt: project each line through the camera and correct the aim (and
  // back off if it is too wide). Blended per cue like the vertical tracking.
  const probe = buildCam(aimX, baseDist);
  const corr = L.map((ln) => {
    const a = rot(ln.left, ln.center, boardRz);
    const b = rot(ln.left + ln.width, ln.center, boardRz);
    const A = project(vec3(px(CX) + a.x, a.y, 0), probe);
    const B = project(vec3(px(CX) + b.x, b.y, 0), probe);
    const sc = Math.max(0.2, (A.scale + B.scale) / 2);
    return {
      dx: ((A.x + B.x) / 2 - px(-30)) / sc,
      k: Math.max(1, (B.x - A.x) / px(830)),
    };
  });
  let dxB = corr[0]?.dx ?? 0;
  let kB = corr[0]?.k ?? 1;
  W.forEach((w) => {
    const m = interpolate(t, [w.cue - 0.12, w.cue + 0.16], [0, 1], {
      ...CLAMP,
      easing: EASE.inOut,
    });
    dxB = mixN(dxB, corr[w.line].dx, m);
    kB = mixN(kB, corr[w.line].k, m);
  });
  const camera = shake(
    buildCam(aimX + dxB * (1 - exit), baseDist * mixN(kB, 1, exit)),
    reel,
    { amount: 0.55, speed: 2.4, seed: "chalk" },
  );

  /* ---- board geometry ---- */
  const c0 = L[0]?.center ?? 0;
  const lastLine = L[L.length - 1]?.center ?? 0;
  const BL = px(-800);
  const BR = px(640);
  const BT = c0 - px(640);
  const BB = lastLine + px(950);
  const FR = px(46);
  const svgX = px(-640);
  const svgY = layout.blockTop - px(260);
  const svgW = px(1240);
  const svgH = layout.blockBottom - layout.blockTop + px(520);

  const swipes = new Array(7).fill(0).map((_, i) => ({
    i,
    x: BL + (random(`sw-x-${i}`) * 0.8 - 0.1) * (BR - BL),
    y: BT + (0.08 + random(`sw-y-${i}`) * 0.84) * (BB - BT),
    w: px(700 + random(`sw-w-${i}`) * 700),
    h: px(110 + random(`sw-h-${i}`) * 120),
    r: (random(`sw-r-${i}`) - 0.5) * 30,
    a: 0.035 + random(`sw-a-${i}`) * 0.05,
  }));

  const stage = (
    <Stage3D camera={camera}>
      <Node3D x={px(CX)} rz={boardRz} center={false}>
        {/* Aluminium frame: four extruded strips, lit across their width */}
        {(
          [
            ["180deg", BL - FR, BT - FR, BR - BL + FR * 2, FR],
            ["0deg", BL - FR, BB, BR - BL + FR * 2, FR],
            ["90deg", BL - FR, BT - FR, FR, BB - BT + FR * 2],
            ["270deg", BR, BT - FR, FR, BB - BT + FR * 2],
          ] as const
        ).map(([dir, x, y, w, h]) => (
          <div
            key={dir}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: w,
              height: h,
              transform: `translateZ(${-px(1)}px)`,
              background: `linear-gradient(${dir}, ${stadium.navyLight} 0%, ${stadium.flood} 16%, ${stadium.steel} 42%, ${stadium.flood} 60%, ${stadium.steel} 84%, rgba(2,5,14,0.85) 100%)`,
            }}
          />
        ))}
        {/* Slate with erased-chalk haze */}
        <div
          style={{
            position: "absolute",
            left: BL,
            top: BT,
            width: BR - BL,
            height: BB - BT,
            overflow: "hidden",
            background: [
              "radial-gradient(45% 22% at 28% 18%, rgba(238,241,230,0.08) 0%, rgba(238,241,230,0) 100%)",
              "radial-gradient(38% 18% at 72% 46%, rgba(238,241,230,0.06) 0%, rgba(238,241,230,0) 100%)",
              "radial-gradient(55% 20% at 40% 72%, rgba(238,241,230,0.07) 0%, rgba(238,241,230,0) 100%)",
              "radial-gradient(30% 14% at 85% 15%, rgba(238,241,230,0.05) 0%, rgba(238,241,230,0) 100%)",
              "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 100%)",
              `linear-gradient(0deg, ${stadium.chalkboard}, ${stadium.chalkboard})`,
            ].join(", "),
            boxShadow: `inset 0 0 0 ${px(4)}px rgba(0,0,0,0.35), inset 0 ${px(18)}px ${px(40)}px rgba(0,0,0,0.45)`,
          }}
        >
          {swipes.map((s) => (
            <div
              key={s.i}
              style={{
                position: "absolute",
                left: s.x - BL,
                top: s.y - BT,
                width: s.w,
                height: s.h,
                borderRadius: s.h,
                rotate: `${s.r}deg`,
                background: [
                  `repeating-linear-gradient(${90 + s.r * 0.2}deg, rgba(238,241,230,${s.a * 0.6}) 0 ${px(3)}px, rgba(238,241,230,0) ${px(3)}px ${px(9)}px)`,
                  `linear-gradient(90deg, rgba(238,241,230,0) 0%, rgba(238,241,230,${s.a}) 18%, rgba(238,241,230,${s.a * 1.2}) 55%, rgba(238,241,230,0) 100%)`,
                ].join(", "),
                maskImage:
                  "linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 30%, #000 70%, rgba(0,0,0,0) 100%)",
              }}
            />
          ))}
          {/* Ghost of an old play, half erased */}
          <svg
            width={BR - BL}
            height={BB - BT}
            viewBox={`${BL} ${BT} ${BR - BL} ${BB - BT}`}
            style={{ position: "absolute", left: 0, top: 0, opacity: 0.07 }}
          >
            <g
              fill="none"
              stroke={stadium.chalk}
              strokeWidth={px(8)}
              strokeLinecap="round"
            >
              <path
                d={ellipsePath(px(-560), c0 + px(330), px(60), px(60), "g1")}
              />
              <path
                d={ellipsePath(px(420), lastLine + px(260), px(70), px(52), "g2")}
              />
              <path
                d={`M${px(-640)},${lastLine + px(420)} Q${px(-200)},${lastLine + px(150)} ${px(300)},${lastLine + px(520)}`}
              />
              <path
                d={`M${px(330)},${c0 - px(420)} L${px(410)},${c0 - px(340)} M${px(410)},${c0 - px(420)} L${px(330)},${c0 - px(340)}`}
              />
            </g>
          </svg>
        </div>

        {/* Live chalk: words + doodles, one grainy filter over all of it */}
        <svg
          width={svgW}
          height={svgH}
          viewBox={`${svgX} ${svgY} ${svgW} ${svgH}`}
          style={{
            position: "absolute",
            left: svgX,
            top: svgY,
            overflow: "visible",
            transform: `translateZ(${px(1)}px)`,
          }}
        >
          <defs>
            <filter
              id={`${id}-chalk`}
              x="-8%"
              y="-8%"
              width="116%"
              height="116%"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={0.05}
                numOctaves={2}
                seed={3}
                result="warp"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="warp"
                scale={px(7)}
                xChannelSelector="R"
                yChannelSelector="G"
                result="rough"
              />
              <feTurbulence
                type="fractalNoise"
                baseFrequency={0.8}
                numOctaves={1}
                seed={8}
                result="grain"
              />
              <feColorMatrix
                in="grain"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.4 0 0 0 2.4"
                result="holes"
              />
              <feComposite
                in="rough"
                in2="holes"
                operator="in"
                result="chalky"
              />
              <feGaussianBlur
                in="chalky"
                stdDeviation={px(6)}
                result="haze"
              />
              <feComponentTransfer in="haze" result="hazeSoft">
                <feFuncA type="linear" slope={0.45} />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="hazeSoft" />
                <feMergeNode in="chalky" />
              </feMerge>
            </filter>
            {W.map((w, i) => {
              const p = revealOf(w, t);
              const x0 = w.inkL - px(30);
              return (
                <clipPath key={i} id={`${id}-w${i}`}>
                  <rect
                    x={x0}
                    y={w.top - w.size * 0.5}
                    width={Math.max(0, w.inkR - w.inkL) * p + px(30)}
                    height={w.bottom - w.top + w.size}
                  />
                </clipPath>
              );
            })}
          </defs>
          <g filter={`url(#${id}-chalk)`}>
            {W.map((w, i) =>
              t >= w.cue - EPS ? (
                <g key={i} clipPath={`url(#${id}-w${i})`}>
                  <text
                    x={w.x}
                    y={w.baseline}
                    fill={stadium.chalk}
                    style={{
                      fontFamily: CHALK.family,
                      fontSize: w.size,
                    }}
                  >
                    {w.text}
                  </text>
                </g>
              ) : null,
            )}
            {doodles.map((d) => {
              const p = interpolate(t, [d.start, d.start + d.dur], [0, 1], {
                ...CLAMP,
                easing: EASE.out,
              });
              if (p <= 0) return null;
              return (
                <path
                  key={d.key}
                  d={d.d}
                  pathLength={1}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={d.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - p}
                  opacity={0.92}
                />
              );
            })}
          </g>
        </svg>

        {/* Chalk dust */}
        <svg
          width={svgW}
          height={svgH}
          viewBox={`${svgX} ${svgY} ${svgW} ${svgH}`}
          style={{
            position: "absolute",
            left: svgX,
            top: svgY,
            overflow: "visible",
            transform: `translateZ(${px(2)}px)`,
          }}
        >
          {dust.map((d) => (
            <circle
              key={d.key}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill={stadium.chalk}
              opacity={d.o}
            />
          ))}
        </svg>

        {/* Chalk stick shadow on the slate */}
        <div
          style={{
            position: "absolute",
            left: tip.x + px(20) + tip.lift * px(40),
            top: tip.y + px(6) + tip.lift * px(50),
            width: px(180),
            height: px(30),
            borderRadius: px(15),
            transformOrigin: "0 50%",
            transform: `translateZ(${px(1.5)}px) rotate(-38deg)`,
            background: "rgba(0,0,0,0.38)",
            filter: `blur(${px(6 + tip.lift * 8)}px)`,
          }}
        />
        {/* Chalk stick riding the reveal edge */}
        <div
          style={{
            position: "absolute",
            left: tip.x,
            top: tip.y - px(15),
            width: px(180),
            height: px(30),
            transformOrigin: "0 50%",
            transform: `translateZ(${px(18) + tip.lift * px(70)}px) rotate(-38deg)`,
            borderRadius: `${px(9)}px ${px(13)}px ${px(13)}px ${px(9)}px`,
            background: `linear-gradient(180deg, #FFFFFF 0%, ${stadium.chalk} 38%, ${stadium.chalk} 62%, rgba(135,150,192,0.9) 100%)`,
            boxShadow: `inset ${px(10)}px 0 ${px(8)}px rgba(255,255,255,0.6)`,
          }}
        />
      </Node3D>
    </Stage3D>
  );

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur y={18 * flashIn} x={4 * flashIn}>
        <ZoomBlur amount={exit}>{stage}</ZoomBlur>
      </WhipBlur>
      {/* Overhead light on the slate, breathing with the beat */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(80% 50% at 45% 30%, rgba(246,248,255,${0.05 + 0.05 * pulse}) 0%, rgba(246,248,255,0) 70%)`,
          pointerEvents: "none",
        }}
      />
      <Flash opacity={0.88 * flashIn * flashIn} color={stadium.volt} />
      <Flash opacity={0.5 * exit * exit} color={stadium.flood} />
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const chalkSceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const ChalkScene = Interactive.withSchema({
  Component: ChalkSceneInner,
  componentName: "<ChalkScene>",
  schema: chalkSceneSchema,
  wrapInSequence: true,
});
