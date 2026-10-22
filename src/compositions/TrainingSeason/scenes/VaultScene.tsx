import type React from "react";
import { useMemo } from "react";
import {
  AbsoluteFill,
  Interactive,
  interpolate,
  random,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Box3D, ExtrudedText } from "../../../components/Solids3D";
import { Billboard, Node3D, Plane3D, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE, SPRING } from "../../../lib/animation";
import {
  aimCamera,
  project,
  shake,
  type Camera,
  type Vec3,
} from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { activeCue, useSceneClock } from "../kit/beat";
import { BroadcastFinish, FieldFloor, Flash, WhipBlur } from "../kit/fx";
import {
  textAdvance,
  useFontReady,
  type FontSpec,
} from "../kit/JerseyMeasure";
import { StadiumSky } from "../kit/StadiumSky";
import { localCues, splitSlots, TRAINING_SEASON_TIMING } from "../timing";

/**
 * Scene 2, VAULT (reel 1.8-4.55 s). The single slot is a giant 3D letter
 * that is also a pole-vault standard. "I" becomes a tall I-beam (top bar,
 * stem, base) with a volt height scale up the stem; any other short text
 * becomes a tall extruded stadium-type tower with a slim scale standard
 * beside it. A striped crossbar jumps up one step on every vault beat and
 * a broadcast tag reads out the height. The camera starts low at the base,
 * cranes up with the bar while orbiting ~60°, then pushes past the top
 * into the night sky.
 */

const DEG = Math.PI / 180;
const CUE = localCues("vault", TRAINING_SEASON_TIMING.cues.vault)[0];
const STEPS = localCues("vault", TRAINING_SEASON_TIMING.accents.vaultSteps);
const HEIGHTS = [4.8, 5.2, 5.65, 6.05, 6.2];
const START_M = 4.45;
const TAGS = ["4.80", "5.20", "5.65", "6.05", "6.20"];
const STADIUM: FontSpec = { family: fonts.stadium, weight: 900 };

// World layout in design px (+y is down, the turf is y = 0).
const TOTAL_H = 2200;
const BASE_H = 230;
const TOP_H = 280;
const STEM_W = 640;
const STEM_D = 480;
const TOP_W = 1500;
const BASE_W = 1600;
const SLAB_D = 620;
/** Height scale: metres at the top of the base, and px per metre. */
const M0 = 4.25;
const PPM = 800;
const yOf = (m: number) => -(BASE_H + (m - M0) * PPM);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Smooth cubic through keyframes (continuous velocity, no stops). */
const spline = (time: number, ts: number[], vs: number[]): number => {
  const n = ts.length;
  if (time <= ts[0]) return vs[0];
  if (time >= ts[n - 1]) return vs[n - 1];
  let k = 0;
  while (k < n - 2 && time >= ts[k + 1]) k++;
  const h = ts[k + 1] - ts[k];
  const u = (time - ts[k]) / h;
  const slope = (i: number) => {
    if (i <= 0) return (vs[1] - vs[0]) / (ts[1] - ts[0]);
    if (i >= n - 1) return (vs[n - 1] - vs[n - 2]) / (ts[n - 1] - ts[n - 2]);
    return (vs[i + 1] - vs[i - 1]) / (ts[i + 1] - ts[i - 1]);
  };
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * vs[k] +
    (u3 - 2 * u2 + u) * h * slope(k) +
    (-2 * u3 + 3 * u2) * vs[k + 1] +
    (u3 - u2) * h * slope(k + 1)
  );
};

/** Quick punch envelope: up in ~1 frame, settled by ~0.3 s. */
const punch = (x: number) =>
  x < 0 ? 0 : Math.min(1, x * 30) * Math.exp(-x * 10);

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const EDGE = (w: number) => `inset 0 0 0 ${w}px rgba(246,248,255,0.62)`;

/** Volt height scale: ticks every 10 cm, labels every 50 cm. */
const HeightScale: React.FC<{
  readonly width: number;
  readonly height: number;
  /** Bar height in metres: the scale below it glows like a meter. */
  readonly fill?: number;
}> = ({ width, height, fill }) => {
  const { px } = useLayout();
  const ticks: number[] = [];
  const topM = M0 + height / PPM;
  for (let m = Math.ceil(M0 * 10); m <= Math.floor(topM * 10 - 0.5); m++) {
    ticks.push(m / 10);
  }
  const labelSize = Math.min(72, width * 0.2);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        width: px(width),
        height: px(height),
      }}
    >
      {fill !== undefined ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: px(Math.max(0, (fill - M0) * PPM)),
            background:
              "linear-gradient(0deg, rgba(215,255,46,0) 0%, rgba(215,255,46,0.10) 70%, rgba(215,255,46,0.32) 100%)",
            borderTop: `${px(5)}px solid rgba(215,255,46,0.9)`,
          }}
        />
      ) : null}
      {ticks.map((m) => {
        const major = Math.round(m * 10) % 5 === 0;
        const y = px(height - (m - M0) * PPM);
        const len = width * (major ? 0.26 : 0.14);
        return (
          <div key={m}>
            {[0, 1].map((side) => (
              <div
                key={side}
                style={{
                  position: "absolute",
                  left: side === 0 ? px(18) : px(width - 18 - len),
                  top: y - px(major ? 4 : 2.5),
                  width: px(len),
                  height: px(major ? 8 : 5),
                  background: stadium.volt,
                  opacity: major ? 1 : 0.8,
                  boxShadow: `0 0 ${px(8)}px rgba(215,255,46,0.45)`,
                }}
              />
            ))}
            {major ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  width: px(width),
                  top: y - px(labelSize * 0.52),
                  textAlign: "center",
                  fontFamily: fonts.broadcast,
                  fontWeight: 600,
                  fontSize: px(labelSize),
                  lineHeight: 1,
                  color: stadium.volt,
                  letterSpacing: px(2),
                  textShadow: `0 0 ${px(10)}px rgba(215,255,46,0.5)`,
                }}
              >
                {m.toFixed(2)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/** Two thin volt stripes, varsity-sleeve style, for slab faces. */
const Stripes: React.FC<{ readonly glow: number }> = ({ glow }) => {
  const { px } = useLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: "8%",
        right: "8%",
        top: "50%",
        translate: `0 ${-px(19)}px`,
      }}
    >
      {[0, 1].map((k) => (
        <div
          key={k}
          style={{
            height: px(10),
            marginBottom: px(18),
            background: stadium.volt,
            opacity: 0.7 + 0.3 * glow,
            boxShadow: `0 0 ${px(14)}px rgba(215,255,46,${0.3 + 0.4 * glow})`,
          }}
        />
      ))}
    </div>
  );
};

const slabColors = {
  front: `linear-gradient(180deg, ${stadium.navyMid} 0%, ${stadium.navy} 100%)`,
  side: `linear-gradient(180deg, ${stadium.navy} 0%, ${stadium.night} 100%)`,
  top: stadium.navyLight,
  bottom: stadium.night,
};

/** The "I": base, stem with the height scale, top bar. */
const IBeam: React.FC<{ readonly glow: number; readonly fill: number }> = ({
  glow,
  fill,
}) => {
  const { px } = useLayout();
  const stemH = TOTAL_H - BASE_H - TOP_H;
  return (
    <>
      <Node3D y={-px(BASE_H / 2)}>
        <Box3D
          width={px(BASE_W)}
          height={px(BASE_H)}
          depth={px(SLAB_D + 60)}
          colors={slabColors}
          faceStyle={{ boxShadow: EDGE(px(4)) }}
          faces={{ front: <Stripes glow={glow} /> }}
        />
      </Node3D>
      <Node3D y={-px(BASE_H + stemH / 2)}>
        <Box3D
          width={px(STEM_W)}
          height={px(stemH)}
          depth={px(STEM_D)}
          colors={{
            front: `linear-gradient(90deg, ${stadium.navy} 0%, ${stadium.navyMid} 50%, ${stadium.navy} 100%)`,
            side: `linear-gradient(90deg, ${stadium.navyMid} 0%, ${stadium.night} 100%)`,
            top: stadium.navyLight,
          }}
          faceStyle={{ boxShadow: EDGE(px(4)) }}
          faces={{
            front: <HeightScale width={STEM_W} height={stemH} fill={fill} />,
            back: <HeightScale width={STEM_W} height={stemH} />,
          }}
        />
      </Node3D>
      <Node3D y={-px(TOTAL_H - TOP_H / 2)}>
        <Box3D
          width={px(TOP_W)}
          height={px(TOP_H)}
          depth={px(SLAB_D)}
          colors={{ ...slabColors, top: stadium.steel }}
          faceStyle={{ boxShadow: EDGE(px(4)) }}
          faces={{ front: <Stripes glow={glow} /> }}
        />
      </Node3D>
    </>
  );
};

type TowerFit = {
  /** One row for short text; one letter per row (stacked) for longer. */
  readonly rows: string[];
  readonly fs: number;
  readonly width: number;
  readonly stretch: number;
  readonly rowH: number;
};

const TOWER_W = 860;
const STADIUM_CAP = 0.7;

const fitTower = (text: string, advOf: (s: string) => number): TowerFit => {
  const letters = Array.from(text.replace(/\s+/g, ""));
  const stacked = Array.from(text.replace(/\s+/g, "").toUpperCase());
  if (letters.length <= 4) {
    const adv = Math.max(0.05, advOf(text));
    const fs = clamp(TOWER_W / adv, 200, 1400);
    const stretch = clamp((TOTAL_H - 40) / (fs * STADIUM_CAP), 1, 2.4);
    return {
      rows: [text],
      fs,
      width: adv * fs,
      stretch,
      rowH: Math.min(TOTAL_H - 40, fs * STADIUM_CAP * stretch),
    };
  }
  const rowH = (TOTAL_H - 40) / letters.length;
  const maxAdv = Math.max(0.05, ...stacked.map((l) => advOf(l)));
  const fs = Math.min((rowH * 0.86) / STADIUM_CAP, TOWER_W / maxAdv);
  return {
    rows: stacked,
    fs,
    width: maxAdv * fs,
    stretch: clamp((rowH * 0.86) / (fs * STADIUM_CAP), 1, 1.8),
    rowH,
  };
};

/**
 * Any other text: tall extruded stadium type. Short text is one row
 * stretched up the full height; longer text stacks its letters like a
 * vertical stadium sign.
 */
const TextTower: React.FC<{ readonly fit: TowerFit }> = ({ fit }) => {
  const { px } = useLayout();
  const n = fit.rows.length;
  return (
    <>
      {fit.rows.map((row, i) => (
        <Node3D key={i} y={-px(20 + (n - 1 - i + 0.5) * fit.rowH)}>
          <div
            style={{
              transformStyle: "preserve-3d",
              transform: `scale3d(1, ${fit.stretch}, 1)`,
            }}
          >
            <ExtrudedText
              depth={px(Math.min(260, fit.fs * 0.3))}
              layers={n > 1 ? 12 : 18}
              face={stadium.flood}
              sideLight={stadium.navyLight}
              sideDark={stadium.night}
              stroke={{ color: stadium.volt, width: px(fit.fs * 0.025) }}
              textStyle={{
                fontFamily: fonts.stadium,
                fontWeight: 900,
                fontSize: px(fit.fs),
                lineHeight: STADIUM_CAP,
                textAlign: "center",
              }}
            >
              {row}
            </ExtrudedText>
          </div>
        </Node3D>
      ))}
    </>
  );
};

/** Slim scale standard (the rail the bar rides on in text mode). */
const Standard: React.FC<{
  readonly x: number;
  readonly w: number;
  readonly d: number;
  readonly fill: number;
}> = ({ x, w, d, fill }) => {
  const { px } = useLayout();
  const h = TOTAL_H - BASE_H;
  return (
    <>
      <Node3D x={px(x)} y={-px(BASE_H + h / 2)}>
        <Box3D
          width={px(w)}
          height={px(h)}
          depth={px(d)}
          colors={{
            front: stadium.navy,
            side: stadium.navyMid,
            top: stadium.navyLight,
          }}
          faceStyle={{ boxShadow: EDGE(px(3)) }}
          faces={{ front: <HeightScale width={w} height={h} fill={fill} /> }}
        />
      </Node3D>
      <Node3D x={px(x)} y={-px(BASE_H / 2)}>
        <Box3D
          width={px(w * 2.2)}
          height={px(BASE_H)}
          depth={px(d * 3)}
          colors={slabColors}
          faceStyle={{ boxShadow: EDGE(px(3)) }}
        />
      </Node3D>
    </>
  );
};

/** Striped crossbar with the sliding collar that holds it on the rail. */
const Crossbar: React.FC<{
  readonly railX: number;
  readonly railW: number;
  readonly railD: number;
  readonly barX: number;
  readonly barW: number;
  readonly tilt: number;
  readonly glow: number;
}> = ({ railX, railW, railD, barX, barW, tilt, glow }) => {
  const { px } = useLayout();
  const stripe = `repeating-linear-gradient(90deg, ${stadium.flood} 0 ${px(110)}px, ${stadium.signal} ${px(110)}px ${px(220)}px)`;
  const barZ = railD / 2 + 70;
  return (
    <>
      {/* Collar around the rail, with a volt index marker */}
      <Node3D x={px(railX)}>
        <Box3D
          width={px(railW + 46)}
          height={px(84)}
          depth={px(railD + 46)}
          colors={{
            front: `linear-gradient(180deg, ${stadium.navyLight} 0%, ${stadium.navyMid} 100%)`,
            side: stadium.navyMid,
            top: stadium.steel,
            bottom: stadium.night,
          }}
          faceStyle={{ boxShadow: EDGE(px(3)) }}
          faces={{
            front: (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: `0 ${px(10)}px`,
                }}
              >
                {[0, 1].map((k) => (
                  <div
                    key={k}
                    style={{
                      width: 0,
                      height: 0,
                      borderTop: `${px(18)}px solid transparent`,
                      borderBottom: `${px(18)}px solid transparent`,
                      [k === 0 ? "borderLeft" : "borderRight"]: `${px(30)}px solid ${stadium.volt}`,
                      filter: `drop-shadow(0 0 ${px(8)}px rgba(215,255,46,${0.5 + 0.4 * glow}))`,
                    }}
                  />
                ))}
              </div>
            ),
          }}
        />
      </Node3D>
      {/* The bar */}
      <Node3D x={px(barX)} z={px(barZ)} rz={tilt}>
        <Box3D
          width={px(barW)}
          height={px(40)}
          depth={px(40)}
          colors={{
            front: stripe,
            side: stadium.flood,
            top: stripe,
            bottom: stripe,
            back: stripe,
          }}
        />
      </Node3D>
    </>
  );
};

/** Broadcast readout tag: navy with a volt edge, italic numbers. */
const HeightTag: React.FC<{
  readonly value: string;
  readonly pb: boolean;
  readonly glow: number;
}> = ({ value, pb, glow }) => {
  const { px } = useLayout();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: px(18),
        padding: `${px(14)}px ${px(30)}px ${px(12)}px ${px(26)}px`,
        background: `linear-gradient(180deg, ${stadium.navyMid} 0%, ${stadium.navy} 100%)`,
        borderLeft: `${px(14)}px solid ${stadium.volt}`,
        boxShadow: `inset 0 0 0 ${px(3)}px rgba(215,255,46,0.85), 0 0 ${px(30)}px rgba(215,255,46,${0.18 + 0.3 * glow})`,
        borderRadius: px(6),
        whiteSpace: "nowrap",
        transform: "skewX(-8deg)",
      }}
    >
      <span
        style={{
          fontFamily: fonts.broadcast,
          fontStyle: "italic",
          fontWeight: 900,
          fontSize: px(150),
          lineHeight: 1,
          color: stadium.flood,
          letterSpacing: px(1),
        }}
      >
        {value}
        <span style={{ fontSize: px(96), color: stadium.volt, marginLeft: px(12) }}>
          M
        </span>
      </span>
      {pb ? (
        <span
          style={{
            fontFamily: fonts.broadcast,
            fontStyle: "italic",
            fontWeight: 900,
            fontSize: px(80),
            lineHeight: 1,
            color: stadium.flood,
            background: stadium.signal,
            padding: `${px(8)}px ${px(14)}px ${px(6)}px`,
            borderRadius: px(4),
          }}
        >
          PB
        </span>
      ) : null}
    </div>
  );
};

/** Flat ring of ticks (a radial gauge) lying in the XZ plane. */
const TickRing: React.FC<{
  readonly radius: number;
  readonly ticks: number;
  readonly color: string;
  readonly opacity: number;
  readonly stroke?: number;
}> = ({ radius, ticks, color, opacity, stroke = 4 }) => {
  const size = radius * 2 + 40;
  const c = size / 2;
  const marks = new Array(ticks).fill(0).map((_, i) => i);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", opacity, overflow: "visible" }}
    >
      <circle cx={c} cy={c} r={radius} fill="none" stroke={color} strokeWidth={stroke} />
      {marks.map((i) => {
        const a = (i / ticks) * Math.PI * 2;
        const long = i % 5 === 0;
        const r2 = radius - (long ? radius * 0.07 : radius * 0.035);
        return (
          <line
            key={i}
            x1={c + Math.cos(a) * radius}
            y1={c + Math.sin(a) * radius}
            x2={c + Math.cos(a) * r2}
            y2={c + Math.sin(a) * r2}
            stroke={color}
            strokeWidth={long ? stroke * 1.4 : stroke * 0.8}
          />
        );
      })}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

type VaultSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const VaultSceneInner: React.FC<VaultSceneProps> = ({ words, style }) => {
  const { t, reel, fps, frame, pulse } = useSceneClock("vault");
  const { px, width, height } = useLayout();
  const ready = useFontReady(STADIUM);

  const slot = splitSlots(words)[0] ?? "";
  const mode: "beam" | "text" | "post" =
    slot.trim().toUpperCase() === "I" ? "beam" : slot.trim() ? "text" : "post";

  const fit = useMemo<TowerFit>(
    () =>
      fitTower(slot, (x) =>
        ready ? textAdvance(x, STADIUM) : Array.from(x).length * 0.45,
      ),
    [slot, ready],
  );

  // Rail = where the scale, collar and bar live.
  const rail =
    mode === "beam"
      ? { x: 0, w: STEM_W, d: STEM_D }
      : { x: mode === "text" ? fit.width / 2 + 190 : 0, w: 240, d: 120 };
  const barW = mode === "beam" ? 1900 : Math.max(1900, rail.x * 2 + 500);
  const barX = mode === "beam" ? 0 : rail.x - barW / 2 + 220;
  const centreX =
    mode === "text" ? (rail.x + rail.w / 2 - fit.width / 2) / 2 : 0;

  // --- Timing -------------------------------------------------------------
  const cueF = Math.ceil(CUE * fps - 1e-6);
  const stepF = STEPS.map((s) => Math.ceil(s * fps - 1e-6));
  const shown = frame >= cueF;
  const rise = shown
    ? spring({
        frame: frame - cueF + 2,
        fps,
        config: { damping: 12, stiffness: 230, mass: 0.55 },
      })
    : 0;

  const barSpring = { ...SPRING.snappy, stiffness: 340, mass: 0.5 };
  let barM = START_M;
  let tilt = 0;
  stepF.forEach((sf, i) => {
    const prev = i === 0 ? START_M : HEIGHTS[i - 1];
    barM += (HEIGHTS[i] - prev) * spring({ frame: frame - sf, fps, config: barSpring });
    const x = (frame - sf) / fps;
    if (x > 0) {
      tilt += (i % 2 === 0 ? 2.4 : -2.4) * Math.exp(-x * 7) * Math.sin(x * 26);
    }
  });
  const step = activeCue(t, STEPS);
  const tagPop =
    step >= 0
      ? spring({ frame: frame - stepF[step], fps, config: SPRING.bouncy })
      : 0;
  const stepGlow = step >= 0 ? Math.exp(-(t - STEPS[step]) * 7) : 0;
  const glow = Math.max(pulse * 0.7, stepGlow);

  // --- Camera -------------------------------------------------------------
  const F = px(860);
  const KT = [0, 0.3, STEPS[1], STEPS[2], STEPS[3], STEPS[4], 2.5];
  const DIST_K = [2150, 2050, 1600, 1400, 1290, 1240, 1180];
  const camAt = (time: number): Camera => {
    const camY = spline(time, KT, [-170, -230, -600, -1030, -1420, -1720, -1960]);
    const tgtY = spline(time, KT, [-1020, -1070, -1170, -1430, -1720, -1930, -2120]);
    const dist = spline(time, KT, DIST_K);
    const az = spline(time, KT, [-34, -30, -18, -6, 7, 19, 26]);
    // Shift the aim right of the rail so the readout tag fits in frame.
    const tx = spline(time, KT, [0, 30, 220, 300, 300, 300, 260]);
    const ex = interpolate(time, [2.5, 2.75], [0, 1], { ...CLAMP, easing: EASE.in });
    const d = dist - 600 * ex;
    const pos: Vec3 = {
      x: px(centreX + d * Math.sin(az * DEG)),
      y: px(camY - 1000 * ex),
      z: px(d * Math.cos(az * DEG)),
    };
    let cam = aimCamera(pos, { x: px(centreX + tx), y: px(tgtY), z: 0 }, F, 1.2);
    // Open: resolving out of the previous scene's upward whip.
    const open = interpolate(time, [0, 0.13], [1, 0], { ...CLAMP, easing: EASE.out });
    cam = { ...cam, pitch: cam.pitch + 30 * open - 70 * ex, roll: cam.roll + az * 0.06 };
    const slam = punch(time - CUE) * 1.4;
    let k = slam;
    STEPS.forEach((s) => {
      k += punch(time - s) * 0.45;
    });
    cam = {
      ...cam,
      focal: cam.focal * (1 + 0.06 * k),
      pitch: cam.pitch + 1.2 * k,
    };
    return shake(cam, time + 2, { amount: 0.8 + 2.2 * slam, speed: 3.4, seed: "vault" });
  };
  const cam = camAt(t);
  const tagScale = clamp(
    spline(t, KT, DIST_K) / 1450,
    0.8,
    1.15,
  );
  const prevCam = camAt(t - 1 / fps);
  const motionY = Math.abs(cam.pitch - prevCam.pitch) * (cam.focal * DEG) * 0.3;
  const blurY = Math.max(
    interpolate(t, [0, 0.12], [px(40), 0], { ...CLAMP, easing: EASE.out }),
    interpolate(t, [2.5, 2.75], [0, px(40)], { ...CLAMP, easing: EASE.in }),
    Math.min(px(40), motionY * 0.7),
  );

  // --- Floodlight flare behind the top ------------------------------------
  const topW: Vec3 = { x: px(centreX), y: px(-TOTAL_H + 40), z: 0 };
  const dir = { x: topW.x - cam.x, y: topW.y - cam.y, z: topW.z - cam.z };
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const flareW: Vec3 = {
    x: topW.x + (dir.x / dl) * px(3200),
    y: topW.y + (dir.y / dl) * px(3200) - px(500),
    z: topW.z + (dir.z / dl) * px(3200),
  };
  const flareP = project(flareW, cam);
  const flareOn =
    interpolate(t, [0.9, 2.2], [0.25, 1], CLAMP) * (0.8 + 0.35 * pulse);

  // --- Slam FX --------------------------------------------------------------
  const sinceSlam = t - CUE;
  const dust = new Array(26).fill(0).map((_, i) => i);
  const flash =
    (sinceSlam >= 0 ? 0.32 * Math.exp(-sinceSlam * 14) : 0) +
    interpolate(t, [2.6, 2.75], [0, 0.1], CLAMP);
  const dark = interpolate(t, [2.6, 2.75], [0, 0.45], CLAMP);

  const barY = yOf(barM) * rise;
  const pb = step === TAGS.length - 1;

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur y={blurY}>
        <StadiumSky camera={cam} seconds={reel} pulse={pulse} horizon={0.5} />
        {flareP.visible ? (
          <AbsoluteFill style={{ pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                left: width / 2 + flareP.x - px(700),
                top: height / 2 + flareP.y - px(700),
                width: px(1400),
                height: px(1400),
                borderRadius: "50%",
                background: `radial-gradient(closest-side, rgba(255,255,255,${0.95 * flareOn}) 0%, rgba(246,248,255,${0.5 * flareOn}) 12%, rgba(160,190,255,${0.2 * flareOn}) 38%, rgba(80,110,220,0) 100%)`,
              }}
            />
          </AbsoluteFill>
        ) : null}
        <Stage3D camera={cam}>
          <FieldFloor variant="turf" y={0} />
          {/* Measuring circle painted on the turf */}
          <Plane3D y={-px(2)} rx={90} width={px(2840)} height={px(2840)}>
            <div style={{ transform: `scale(${px(1)})`, transformOrigin: "0 0" }}>
              <TickRing radius={1400} ticks={120} color={stadium.flood} opacity={0.3} stroke={6} />
            </div>
          </Plane3D>
          {/* Shockwave on the turf */}
          {sinceSlam >= 0 && sinceSlam < 0.7 ? (
            <Plane3D
              y={-px(4)}
              rx={90}
              width={px(800 + 3600 * (1 - Math.exp(-sinceSlam * 6)))}
              height={px(800 + 3600 * (1 - Math.exp(-sinceSlam * 6)))}
              opacity={Math.exp(-sinceSlam * 4.5)}
              background={`radial-gradient(closest-side, rgba(215,255,46,0) 80%, rgba(215,255,46,0.85) 92%, rgba(246,248,255,0.9) 96%, rgba(215,255,46,0) 100%)`}
            />
          ) : null}
          {shown ? (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: 0,
                height: 0,
                transformStyle: "preserve-3d",
                transformOrigin: "0 0",
                transform: `scale3d(1, ${Math.max(0.001, rise)}, 1)`,
              }}
            >
              {mode === "beam" ? <IBeam glow={glow} fill={barM} /> : null}
              {mode === "text" ? (
                <TextTower fit={fit} />
              ) : null}
              {mode !== "beam" ? <Standard x={rail.x} w={rail.w} d={rail.d} fill={barM} /> : null}
            </div>
          ) : null}
          {shown ? (
            <Node3D y={px(barY)}>
              <Crossbar
                railX={rail.x}
                railW={rail.w}
                railD={rail.d}
                barX={barX}
                barW={barW}
                tilt={tilt}
                glow={glow}
              />
              {/* Gauge ring around the rail at the bar height */}
              <Node3D x={px(rail.x)} rx={90}>
                <div style={{ transform: `scale(${px(1)})`, transformOrigin: "50% 50%" }}>
                  <TickRing
                    radius={900}
                    ticks={90}
                    color={stadium.volt}
                    opacity={0.35 + 0.35 * glow}
                    stroke={5}
                  />
                </div>
              </Node3D>
            </Node3D>
          ) : null}
          {step >= 0 && shown ? (
            <Billboard
              x={px(rail.x + rail.w / 2 + 160)}
              y={px(barY - 120)}
              z={px(rail.d / 2 + 90)}
              scale={(0.7 + 0.3 * tagPop) * tagScale}
            >
              <HeightTag value={TAGS[step]} pb={pb} glow={glow} />
            </Billboard>
          ) : null}
          {/* Dust kicked up by the slam */}
          {sinceSlam >= 0 && sinceSlam < 0.9
            ? dust.map((i) => {
                const a = random(`dust-a-${i}`) * Math.PI * 2;
                const speed = 500 + random(`dust-s-${i}`) * 1300;
                const r = 700 + speed * (1 - Math.exp(-sinceSlam * 4));
                const lift = (60 + random(`dust-l-${i}`) * 260) * (1 - Math.exp(-sinceSlam * 6));
                const size = 90 + random(`dust-z-${i}`) * 220;
                const o = Math.exp(-sinceSlam * 3.2) * (0.35 + 0.4 * random(`dust-o-${i}`));
                return (
                  <Billboard
                    key={i}
                    x={px(Math.cos(a) * r)}
                    y={-px(lift + 30)}
                    z={px(Math.sin(a) * r)}
                  >
                    <div
                      style={{
                        width: px(size * (1 + sinceSlam)),
                        height: px(size * (1 + sinceSlam) * 0.7),
                        borderRadius: "50%",
                        background:
                          i % 7 === 0
                            ? `radial-gradient(closest-side, rgba(215,255,46,${o}) 0%, rgba(215,255,46,0) 100%)`
                            : `radial-gradient(closest-side, rgba(200,210,235,${o}) 0%, rgba(135,150,192,0) 100%)`,
                      }}
                    />
                  </Billboard>
                );
              })
            : null}
        </Stage3D>
      </WhipBlur>
      {/* Anamorphic streak through the flare */}
      {flareP.visible ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            width,
            top: height / 2 + flareP.y - px(10),
            height: px(20),
            background: `linear-gradient(90deg, rgba(160,190,255,0) 0%, rgba(210,225,255,${0.45 * flareOn}) 50%, rgba(160,190,255,0) 100%)`,
            filter: `blur(${px(4)}px)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      ) : null}
      <Flash opacity={flash} />
      <Flash opacity={dark} color={stadium.night} />
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const vaultSceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const VaultScene = Interactive.withSchema({
  Component: VaultSceneInner,
  componentName: "<VaultScene>",
  schema: vaultSceneSchema,
  wrapInSequence: true,
});
