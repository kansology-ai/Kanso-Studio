import { measureText } from "@remotion/layout-utils";
import type React from "react";
import { useEffect, useId, useMemo, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Interactive,
  interpolate,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE, SPRING } from "../../../lib/animation";
import {
  project,
  projectSegment,
  shake,
  type Camera,
  type Vec3,
} from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import {
  BALLS,
  ballAt,
  baseCamera,
  beatLocal,
  BLAST,
  cameraMatrix,
  FINAL_BURST,
  GRAVITY,
  m3mul,
  SCENE_SECONDS,
  SHARDS,
  shardAt,
  SPARKS,
  sparkAt,
  towardCamera,
  type ShardSpec,
} from "../kit/BallsPhysics";
import { BallDefs, ballIds, BallSprite } from "../kit/BallsSprites";
import { StadiumSky } from "../kit/StadiumSky";
import { BroadcastFinish, FieldFloor, Flash, WhipBlur } from "../kit/fx";
import { splitSlots } from "../timing";

/**
 * Scene 8, BALLS (24.6–30.0 s): the drop. The scoreboard's shards blast
 * past the lens, dozens of sports balls burst out and bounce on the beat
 * across a floodlit tartan track while the camera orbits the pile. The slot
 * word hangs on a signal-red badge, then drops and bounces away. At 29.5 s
 * a final burst fires balls straight at the camera, which whips out into
 * the loop back to the opening slam.
 */

type BallsSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const DEG = Math.PI / 180;

type RGB = [number, number, number];
const hexRgb = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex: string, a: number) => {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const css = (c: RGB) =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
const mixHex = (a: string, b: string, t: number) =>
  css(mixRgb(hexRgb(a), hexRgb(b), t));

/** 1 at `at`, decaying with time constant `tau` (0 before). */
const impulse = (t: number, at: number, tau: number) =>
  t >= at ? Math.exp(-(t - at) / tau) : 0;

// ---------------------------------------------------------------------------
// Pill font readiness: measure only once the italic 900 face is in
// document.fonts, so measureText() never caches a fallback-font width.
// ---------------------------------------------------------------------------

const PILL_FAMILY = "Barlow Condensed";

const pillFaceLoaded = (): boolean => {
  if (typeof document === "undefined" || !document.fonts) return false;
  let ok = false;
  document.fonts.forEach((f) => {
    if (
      f.family.replace(/["']/g, "") === PILL_FAMILY &&
      f.style === "italic" &&
      String(f.weight) === "900" &&
      f.status === "loaded"
    ) {
      ok = true;
    }
  });
  return ok;
};

const usePillFontReady = (): boolean => {
  const [ready, setReady] = useState(pillFaceLoaded);
  useEffect(() => {
    if (ready) return;
    const handle = delayRender("BallsScene: waiting for the pill font");
    let done = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(handle);
    };
    const poll = () => {
      if (pillFaceLoaded() || tries++ > 150) {
        setReady(true);
        finish();
        return;
      }
      timer = setTimeout(poll, 25);
    };
    poll();
    return () => {
      if (timer) clearTimeout(timer);
      finish();
    };
  }, [ready]);
  return ready;
};

// ---------------------------------------------------------------------------
// Pill plan (world placement + fitted size), computed once per word
// ---------------------------------------------------------------------------

const PILL_SCREEN_H = 205; // design px on screen at the hang
const PILL_MAX_SCREEN_W = 820;
const PILL_DROP_AT = 0.8; // 25.4 s
const PILL_LAND_AT = beatLocal(53); // lands on the beat
const PILL_BOUNCE = beatLocal(54) - beatLocal(53); // one beat in the air

type PillPlan = {
  anchor: Vec3;
  h: number;
  w: number;
  fontSize: number;
  right: { x: number; z: number };
  toward: { x: number; z: number };
  vUp: number;
};

const planPill = (
  word: string,
  fontReady: boolean,
  focal: number,
): PillPlan => {
  const toward = towardCamera(0.4);
  const right = { x: toward.z, z: -toward.x };
  const anchor: Vec3 = {
    x: BLAST.x + toward.x * 420 + right.x * 50,
    y: -360,
    z: BLAST.z + toward.z * 420 + right.z * 50,
  };
  const cam = { ...baseCamera(0.4), focal };
  const scale = project(anchor, cam).scale || 0.7;
  const h = PILL_SCREEN_H / scale;
  const pad = h * 0.95;
  const maxW = PILL_MAX_SCREEN_W / scale;
  const base = h * 0.78;
  const text = word.length > 0 ? word : " ";
  const w100 = fontReady
    ? measureText({
        text,
        fontFamily: fonts.broadcast,
        fontSize: 100,
        fontWeight: 900,
        additionalStyles: { fontStyle: "italic" },
      }).width
    : text.length * 46;
  let fontSize = base;
  let w = Math.max(h * 1.9, (w100 / 100) * base + pad);
  if (w > maxW) {
    fontSize = Math.max(h * 0.32, ((maxW - pad) / w100) * 100);
    w = maxW;
  }
  const dropH = -anchor.y - h / 2;
  const T = PILL_LAND_AT - PILL_DROP_AT;
  const vUp = (0.5 * GRAVITY * T * T - dropH) / T;
  return { anchor, h, w, fontSize, right, toward, vUp };
};

/** Pill world centre, roll (deg), tip (deg) and height above floor at t. */
const pillAt = (plan: PillPlan, t: number) => {
  const { anchor, h } = plan;
  const bob = Math.sin(t * 4.2) * 12;
  if (t < PILL_DROP_AT) {
    return {
      pos: { ...anchor, y: anchor.y + bob },
      roll: -6 + Math.sin(t * 5.5) * 3,
      tip: Math.sin(t * 3.4) * 9,
      height: -anchor.y - h / 2,
    };
  }
  const startY = anchor.y + Math.sin(PILL_DROP_AT * 4.2) * 12;
  if (t < PILL_LAND_AT) {
    const tau = t - PILL_DROP_AT;
    const hc = -startY + plan.vUp * tau - 0.5 * GRAVITY * tau * tau;
    const k = tau / (PILL_LAND_AT - PILL_DROP_AT);
    return {
      pos: { ...anchor, y: -Math.max(h / 2, hc) },
      roll: -6 + Math.sin(PILL_DROP_AT * 5.5) * 3 - 14 * k * k,
      tip: 20 * k * k,
      height: Math.max(0, hc - h / 2),
    };
  }
  // Bounce away: one beat in the air (landing on the next beat), skidding
  // off to the left of frame and spinning.
  const tau = t - PILL_LAND_AT;
  const vb = (GRAVITY * PILL_BOUNCE) / 2;
  const arc = Math.min(tau, PILL_BOUNCE);
  const hc = h / 2 + vb * arc - 0.5 * GRAVITY * arc * arc;
  const slide = 1 - Math.exp(-tau * 2.2);
  const dx = (-plan.right.x * 1000 + plan.toward.x * 900) * slide;
  const dz = (-plan.right.z * 1000 + plan.toward.z * 900) * slide;
  return {
    pos: { x: anchor.x + dx, y: -hc, z: anchor.z + dz },
    roll: -20 - tau * 260,
    tip: 20 + 38 * (1 - Math.exp(-tau * 3)),
    height: hc - h / 2,
  };
};

// ---------------------------------------------------------------------------

const SHARD_COLOR: Record<ShardSpec["color"], string> = {
  navy: stadium.navy,
  volt: stadium.volt,
  flood: stadium.flood,
  navyMid: stadium.navyLight,
  signal: stadium.signal,
};

const LIGHT = (() => {
  const v = { x: -0.35, y: -1, z: 0.3 };
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
})();

type DepthItem = { depth: number; node: React.ReactNode };

const BallsSceneInner: React.FC<BallsSceneProps> = ({ words, style }) => {
  const { t, reel, frame, fps, pulse } = useSceneClock("balls");
  const { px, unit, width, height } = useLayout();
  const prefix = `balls${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ids = ballIds(prefix);
  const word = splitSlots(words)[0] ?? "";
  const fontReady = usePillFontReady();
  const focalBase = px(860);
  const plan = useMemo(
    () => planPill(word, fontReady, focalBase),
    [word, fontReady, focalBase],
  );

  // --- Camera ---------------------------------------------------------------
  const hit = impulse(t, 0, 0.085);
  const fin = impulse(t, FINAL_BURST, 0.1);
  const base = baseCamera(t);
  const cam: Camera = shake(
    {
      ...base,
      focal: focalBase * (1 + 0.17 * hit + 0.11 * fin + 0.025 * pulse),
      roll: base.roll + 6 * hit * Math.cos(t * 26) - 5 * fin,
    },
    reel,
    {
      amount: 1.1 + 2.4 * (hit + fin) + 0.4 * pulse,
      speed: 3.2,
      seed: "balls-cam",
    },
  );
  const stageCam: Camera = {
    ...cam,
    x: cam.x * unit,
    y: cam.y * unit,
    z: cam.z * unit,
  };
  const R = cameraMatrix(cam);
  const cx = width / 2;
  const cy = height / 2;
  const P = (p: Vec3) => project(p, cam);
  const camH = Math.max(40, -cam.y);
  const onScreen = (x: number, y: number, r: number) =>
    x > -r - px(60) &&
    x < width + r + px(60) &&
    y > -r - px(60) &&
    y < height + r + px(60);

  // --- Pill -----------------------------------------------------------------
  const pill = pillAt(plan, t);
  const pillAlpha = interpolate(t - PILL_LAND_AT, [0.5, 0.8], [1, 0], CLAMP);
  const pillProj = P(pill.pos);
  const pillDepth = pillProj.visible ? pillProj.depth : 0;

  // --- Floor shadows + depth-sorted sprites ----------------------------------
  const shadows: React.ReactNode[] = [];
  const items: DepthItem[] = [];

  const addShadow = (
    key: string,
    at: Vec3,
    radius: number,
    lift: number,
    strength = 1,
  ) => {
    const f = P({ x: at.x, y: 0, z: at.z });
    if (!f.visible) return;
    const rx = radius * f.scale * (1 + lift / 650) * 1.05;
    const ry = rx * Math.min(1, Math.max(0.06, camH / f.depth));
    const op = 0.95 * strength * Math.exp(-lift / 300);
    if (op < 0.02 || !onScreen(cx + f.x, cy + f.y, rx)) return;
    shadows.push(
      <ellipse
        key={key}
        cx={cx + f.x}
        cy={cy + f.y}
        rx={rx}
        ry={ry}
        transform={`rotate(${-cam.roll} ${cx + f.x} ${cy + f.y})`}
        fill={`url(#${ids.cs})`}
        opacity={op}
      />,
    );
  };

  for (const b of BALLS) {
    const st = ballAt(b, t);
    if (!st) continue;
    const p = P(st.pos);
    if (!p.visible || p.depth < b.r * 1.2 + 30) continue;
    const r = b.r * p.scale;
    const x = cx + p.x;
    const y = cy + p.y;
    addShadow(
      `s${b.id}`,
      st.pos,
      b.kind === "football" ? b.r * 1.3 : b.r,
      st.height,
    );
    if (!onScreen(x, y, r * 1.7)) continue;
    // Pop out of the blast: grow over the first 60 ms of flight.
    const grow = interpolate(t - b.t0, [0, 0.06], [0.35, 1], CLAMP);
    items.push({
      depth: p.depth,
      node: (
        <BallSprite
          key={`b${b.id}`}
          prefix={prefix}
          kind={b.kind}
          x={x}
          y={y}
          r={r * grow}
          m={m3mul(R, st.rot)}
          squash={st.squash}
        />
      ),
    });
  }

  // Scoreboard shards: flat spinning plates, lit by the floodlights.
  for (const sh of SHARDS) {
    const { corners, normal, landed } = shardAt(sh, t);
    const pts = corners.map(P);
    if (pts.some((q) => !q.visible || q.depth < 90)) continue;
    const xs = pts.map((q) => cx + q.x);
    const ys = pts.map((q) => cy + q.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    if (maxX < 0 || minX > width || maxY < 0 || minY > height) continue;
    if (maxX - minX > width * 0.9) continue;
    const c = corners.reduce(
      (a, q) => ({
        x: a.x + q.x / corners.length,
        y: a.y + q.y / corners.length,
        z: a.z + q.z / corners.length,
      }),
      { x: 0, y: 0, z: 0 },
    );
    const toCam = { x: cam.x - c.x, y: cam.y - c.y, z: cam.z - c.z };
    const tl = Math.hypot(toCam.x, toCam.y, toCam.z) || 1;
    const facing =
      (normal.x * toCam.x + normal.y * toCam.y + normal.z * toCam.z) / tl;
    const n =
      facing >= 0 ? normal : { x: -normal.x, y: -normal.y, z: -normal.z };
    const lambert = Math.abs(n.x * LIGHT.x + n.y * LIGHT.y + n.z * LIGHT.z);
    const hx = LIGHT.x + toCam.x / tl;
    const hy = LIGHT.y + toCam.y / tl;
    const hz = LIGHT.z + toCam.z / tl;
    const hl = Math.hypot(hx, hy, hz) || 1;
    const spec = Math.pow(
      Math.max(0, (n.x * hx + n.y * hy + n.z * hz) / hl),
      40,
    );
    const floor = sh.color === "flood" || sh.color === "volt" ? 0.74 : 0.6;
    const shade = landed > 0.5 ? 0.9 : floor + (1 - floor) * lambert;
    const fade = interpolate(t - sh.landAt, [0.2, 0.6], [1, 0], CLAMP);
    if (fade <= 0.01) continue;
    const baseCol = SHARD_COLOR[sh.color];
    const lit = mixRgb(
      hexRgb(baseCol),
      hexRgb(stadium.night),
      Math.min(1, (1 - shade) * (facing >= 0 ? 1 : 1.25)),
    );
    const fill = css(mixRgb(lit, hexRgb(stadium.flood), Math.min(0.9, spec)));
    const depth = pts.reduce((a, q) => a + q.depth, 0) / pts.length;
    items.push({
      depth,
      node: (
        <polygon
          key={`sh${sh.id}`}
          points={xs
            .map((x, k) => `${x.toFixed(1)},${ys[k].toFixed(1)}`)
            .join(" ")}
          fill={fill}
          stroke={
            sh.color === "navy"
              ? rgba(stadium.volt, 0.75)
              : rgba(stadium.flood, 0.45)
          }
          strokeWidth={px(sh.color === "navy" ? 2.4 : 1.4)}
          strokeLinejoin="round"
          opacity={fade}
        />
      ),
    });
  }

  // Sparks: short streaks out of the blast.
  const BURST_ORIGIN: Vec3 = { x: 0, y: -200, z: 0 };
  const sparkPasses = [
    { key: "a", at: undefined, origin: undefined },
    { key: "b", at: FINAL_BURST - 0.03, origin: BURST_ORIGIN },
  ];
  for (const pass of sparkPasses) {
    for (const sp of SPARKS) {
      const s = sparkAt(sp, t, pass.at, pass.origin);
      if (!s) continue;
      const seg = projectSegment(s.tail, s.head, cam);
      if (!seg) continue;
      const [a, b] = seg;
      const col =
        sp.color === "volt"
          ? stadium.volt
          : sp.color === "flood"
            ? stadium.flood
            : stadium.signal;
      items.push({
        depth: b.depth,
        node: (
          <line
            key={`sp${pass.key}${sp.id}`}
            x1={cx + a.x}
            y1={cy + a.y}
            x2={cx + b.x}
            y2={cy + b.y}
            stroke={col}
            strokeWidth={Math.min(px(9), Math.max(px(1.6), 7 * b.scale))}
            strokeLinecap="round"
            opacity={s.alpha}
          />
        ),
      });
    }
  }

  items.sort((a, b) => b.depth - a.depth);
  // While the word hangs, only things right at the lens may cover it.
  const hanging = t < PILL_DROP_AT;
  const inFront = (d: number) =>
    d <= pillDepth && (!hanging || d < pillDepth * 0.35);
  const back = items.filter((it) => !inFront(it.depth));
  const front = items.filter((it) => inFront(it.depth));

  // Pill shadow on the track.
  addShadow(
    "pill",
    pill.pos,
    plan.w * 0.42,
    Math.max(0, pill.height),
    0.9 * pillAlpha,
  );

  // --- Shockwave rings on the floor -----------------------------------------
  const ring = (key: string, at: number, color: string, maxR: number) => {
    const tau = t - at;
    if (tau < 0 || tau > 0.9) return null;
    const rad = maxR * (1 - Math.exp(-tau * 3.4));
    const op = Math.pow(1 - tau / 0.9, 1.5);
    const N = 56;
    let d = "";
    let prevOk = false;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      const seg = projectSegment(
        { x: Math.cos(a0) * rad, y: 0, z: Math.sin(a0) * rad },
        { x: Math.cos(a1) * rad, y: 0, z: Math.sin(a1) * rad },
        cam,
        60,
      );
      if (!seg) {
        prevOk = false;
        continue;
      }
      const [p0, p1] = seg;
      if (!prevOk) d += `M${(cx + p0.x).toFixed(1)} ${(cy + p0.y).toFixed(1)}`;
      d += `L${(cx + p1.x).toFixed(1)} ${(cy + p1.y).toFixed(1)}`;
      prevOk = true;
    }
    return (
      <path
        key={key}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={px(10) * (1 - tau / 0.9) + px(2)}
        opacity={op}
      />
    );
  };

  // --- Blast light -----------------------------------------------------------
  const blastP = P(BLAST);
  const blastGlow = impulse(t, 0, 0.18) + 0.8 * impulse(t, FINAL_BURST, 0.16);
  const glowAt = t >= FINAL_BURST ? P({ x: 0, y: -200, z: 0 }) : blastP;
  const glowSize = t >= FINAL_BURST ? px(620) : px(1100);

  // --- Sky / haze ------------------------------------------------------------
  const horizonY = cy - Math.tan(cam.pitch * DEG) * cam.focal;

  // --- Whip blur in / out -----------------------------------------------------
  const blurIn = interpolate(t, [0, 0.12], [px(34), 0], {
    ...CLAMP,
    easing: EASE.out,
  });
  const blurOut = interpolate(
    t,
    [SCENE_SECONDS - 0.2, SCENE_SECONDS - 1 / fps],
    [0, px(30)],
    { ...CLAMP, easing: EASE.in },
  );

  // --- Pill styling -----------------------------------------------------------
  const pop = spring({ frame: frame + 2, fps, config: SPRING.bouncy });
  const pillScale = pillProj.scale * (0.3 + 0.7 * pop);
  const pillRing = interpolate(t, [0, 0.3], [0, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const H = plan.h;
  const W = plan.w;

  // Floor light pool (pulses with the beat, flashes on the hits).
  const pool =
    0.16 +
    0.08 * pulse +
    0.3 * impulse(t, 0, 0.25) +
    0.12 * impulse(t, FINAL_BURST, 0.15);
  const laneNumbers = [1, 2, 3, 4, 5, 6];

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur x={blurIn + blurOut} y={blurIn * 0.25}>
        <StadiumSky camera={cam} seconds={reel} lights={1} pulse={pulse} />
        {/* Twilight: lift the night sky toward steel with a warm horizon. */}
        <AbsoluteFill
          style={{
            overflow: "hidden",
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: -width * 0.3,
              top: -height * 0.3,
              width: width * 1.6,
              height: height * 1.6,
              rotate: `${-cam.roll}deg`,
              background: `linear-gradient(180deg, ${rgba(stadium.navyLight, 0.5)} 0px, ${rgba(stadium.navyLight, 0.62)} ${horizonY + height * 0.3 - px(900)}px, ${rgba(stadium.steel, 0.62)} ${horizonY + height * 0.3 - px(300)}px, ${rgba(stadium.signal, 0.16)} ${horizonY + height * 0.3 - px(40)}px, ${rgba(stadium.flood, 0.6)} ${horizonY + height * 0.3}px, ${rgba(stadium.steel, 0.2)} ${horizonY + height * 0.3 + px(200)}px)`,
            }}
          />
        </AbsoluteFill>
        <Stage3D camera={stageCam}>
          <FieldFloor variant="track" y={0}>
            <div
              style={{
                position: "absolute",
                left: px(5000 - 2600),
                top: px(5000 - 2600),
                width: px(5200),
                height: px(5200),
                borderRadius: "50%",
                background: `radial-gradient(closest-side, rgba(255,255,255,${pool}) 0%, rgba(255,255,255,${pool * 0.4}) 45%, rgba(255,255,255,0) 100%)`,
              }}
            />
            {/* Start line + painted lane numbers */}
            <div
              style={{
                position: "absolute",
                left: px(5000 - 1100),
                top: px(5000 + 560),
                width: px(1560),
                height: px(14),
                background: rgba(stadium.flood, 0.9),
              }}
            />
            {laneNumbers.map((n, i) => (
              <div
                key={n}
                style={{
                  position: "absolute",
                  left: px(5000 - 970 + i * 260 - 90),
                  top: px(5000 + 610),
                  width: px(180),
                  textAlign: "center",
                  fontFamily: fonts.stadium,
                  fontWeight: 900,
                  fontSize: px(190),
                  lineHeight: 1,
                  color: rgba(stadium.flood, 0.88),
                }}
              >
                {n}
              </div>
            ))}
          </FieldFloor>
        </Stage3D>
        {/* Distance haze over the far edge of the track */}
        <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: -width * 0.3,
              top: -height * 0.3,
              width: width * 1.6,
              height: height * 1.6,
              rotate: `${-cam.roll}deg`,
              background: `linear-gradient(180deg, rgba(0,0,0,0) ${horizonY + height * 0.3 - px(140)}px, ${rgba(stadium.steel, 0.55)} ${horizonY + height * 0.3 + px(6)}px, ${rgba(stadium.steel, 0.22)} ${horizonY + height * 0.3 + px(120)}px, rgba(0,0,0,0) ${horizonY + height * 0.3 + px(380)}px)`,
            }}
          />
        </AbsoluteFill>

        {/* Back layer: rings, shadows and everything behind the pill */}
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          <BallDefs prefix={prefix} />
          {ring("ring0", 0, stadium.volt, 2600)}
          {ring("ring1", 0.06, stadium.flood, 1900)}
          {ring("ring2", FINAL_BURST - 0.03, stadium.volt, 2400)}
          {shadows}
          {back.map((it) => it.node)}
          {blastGlow > 0.02 && glowAt.visible ? (
            <circle
              cx={cx + glowAt.x}
              cy={cy + glowAt.y}
              r={glowSize * glowAt.scale * (1.4 - 0.4 * blastGlow)}
              fill={`url(#${ids.glow})`}
              opacity={Math.min(1, blastGlow)}
              style={{ mixBlendMode: "screen" }}
            />
          ) : null}
        </svg>

        <Flash
          opacity={
            interpolate(t, [0, 0.1], [0.4, 0], {
              ...CLAMP,
              easing: EASE.out,
            }) +
            (t >= FINAL_BURST
              ? interpolate(t - FINAL_BURST, [0, 0.14], [0.3, 0], CLAMP)
              : 0)
          }
        />
      </WhipBlur>

      {/* The word badge: kept out of the whip blur so it reads on its cue frame */}
      {pillProj.visible && pillAlpha > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: cx + pillProj.x,
            top: cy + pillProj.y,
            width: 0,
            height: 0,
          }}
        >
          {pillRing < 1 ? (
            <div
              style={{
                position: "absolute",
                left: -W / 2,
                top: -H / 2,
                width: W,
                height: H,
                borderRadius: H / 2,
                border: `${H * 0.05}px solid ${stadium.flood}`,
                opacity: 1 - pillRing,
                scale: String(pillProj.scale * (0.85 + 0.75 * pillRing)),
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              left: -W / 2,
              top: -H / 2,
              width: W,
              height: H,
              transform: `scale(${pillScale}) perspective(${H * 6}px) rotateZ(${pill.roll}deg) rotateY(${pill.tip}deg)`,
            }}
          >
            {/* Thickness */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                top: H * 0.09,
                bottom: -H * 0.09,
                borderRadius: H / 2,
                background: stadium.signalDeep,
                boxShadow: `0 ${H * 0.16}px ${H * 0.22}px ${rgba(stadium.night, 0.45)}`,
              }}
            />
            {/* Face */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: H / 2,
                background: `linear-gradient(180deg, ${mixHex(stadium.signal, stadium.flood, 0.16)} 0%, ${stadium.signal} 46%, ${mixHex(stadium.signal, stadium.signalDeep, 0.7)} 100%)`,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: H * 0.3,
                  right: H * 0.3,
                  top: H * 0.07,
                  height: H * 0.34,
                  borderRadius: H,
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: H * 0.085,
                  borderRadius: H,
                  border: `${H * 0.022}px dashed ${rgba(stadium.flood, 0.62)}`,
                }}
              />
            </div>
            {/* Word */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: fonts.broadcast,
                fontStyle: "italic",
                fontWeight: 900,
                fontSize: plan.fontSize,
                lineHeight: 1,
                whiteSpace: "pre",
                color: stadium.flood,
                translate: `${-H * 0.03}px ${-plan.fontSize * 0.04}px`,
                textShadow: `0 ${plan.fontSize * 0.05}px 0 ${stadium.signalDeep}, 0 0 ${plan.fontSize * 0.25}px ${rgba(stadium.night, 0.25)}`,
              }}
            >
              {word}
            </div>
          </div>
        </div>
      ) : null}

      {/* Front layer: everything between the pill and the lens */}
      <WhipBlur x={blurIn + blurOut} y={blurIn * 0.25}>
        <svg
          width={width}
          height={height}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          {front.map((it) => it.node)}
        </svg>
      </WhipBlur>
      <BroadcastFinish grain={0.06} vignette={0.42} />
    </AbsoluteFill>
  );
};

const ballsSceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const BallsScene = Interactive.withSchema({
  Component: BallsSceneInner,
  componentName: "<BallsScene>",
  schema: ballsSceneSchema,
  wrapInSequence: true,
});
