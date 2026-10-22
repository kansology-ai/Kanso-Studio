import type React from "react";
import {
  AbsoluteFill,
  Interactive,
  interpolate,
  random,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Box3D, ExtrudedText } from "../../../components/Solids3D";
import { Node3D, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE, SPRING } from "../../../lib/animation";
import { noise1, orbitCamera, shake, vec3 as vec } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { beatPulse, useSceneClock } from "../kit/beat";
import { BroadcastFinish, FieldFloor, Flash, LedText } from "../kit/fx";
import {
  capCenterOffset,
  fitSize,
  inkMetrics,
  letterLayout,
  textWidth,
  useFontsReady,
  type FontSpec,
} from "../kit/ScoreboardFit";
import { dollyCamera, kick, mixColor, snapTime } from "../kit/ScoreboardMath";
import { StadiumSky } from "../kit/StadiumSky";
import {
  BEAT_SECONDS,
  beatAt,
  localCues,
  sceneLength,
  sceneStart,
  splitSlots,
  TRAINING_SEASON_TIMING,
} from "../timing";

/**
 * Scene 7, SCOREBOARD (22.0–24.6 s): the song-title card on a giant
 * stadium scoreboard seen from the field. 'cause slides in with a volt
 * rule, TRAINING slams in letter by letter, SEASON whips in on a jersey
 * arch with an 's sticker, the stat line types on and the game clock runs
 * out exactly on the drop, where the board face shatters toward the lens.
 */

const KEY = "scoreboard" as const;
const T = TRAINING_SEASON_TIMING;
const START = sceneStart(KEY);
const LEN = sceneLength(KEY);
const CUES = localCues(KEY, T.cues.scoreboard).map(snapTime);
const STATS = snapTime(T.accents.scoreboardStats - START);
const DROP = snapTime(T.accents.drop - START);
/** Beat build before the drop. */
const BUILD = DROP - 0.2;

const CAUSE_FONT: FontSpec = {
  family: fonts.broadcast,
  weight: 800,
  style: "italic",
};
const TITLE_FONT: FontSpec = { family: fonts.stadium, weight: 900 };
const SEASON_FONT: FontSpec = { family: fonts.varsity, weight: 400 };
const LED_FONT: FontSpec = { family: fonts.led, weight: 900 };
const LABEL_FONT: FontSpec = { family: fonts.broadcast, weight: 600 };
const FONT_SPECS = [CAUSE_FONT, TITLE_FONT, SEASON_FONT, LED_FONT, LABEL_FONT];

const STATS_TEXT = "122.95 BPM · 30 SEC · 9:16";

/* Board geometry, design px. The LED face is centred on the board. */
const BOARD_W = 1060;
const BOARD_H = 1280;
const BOARD_D = 150;
const BAND = 46;
const LED_W = BOARD_W - BAND * 2;
const LED_H = BOARD_H - BAND * 2;
const PAD = 48;
/** Width lyric rows may use, so they stay inside the Reels safe area. */
const LYRIC_W = 760;
const FRONT_Z = BOARD_D / 2;
/** Vertical stretch of the headline (tall stadium lettering). */
const STRETCH = 1.3;

/* Rows inside the LED face (LED-local y, design px). */
const ROW = {
  cause: 52,
  title: 362,
  season: 664,
  stats: 836,
  divider: 876,
  panel: 900,
};

/* ------------------------------------------------------------------ */
/* Camera                                                              */
/* ------------------------------------------------------------------ */

const camAt = (t: number, reel: number, u: number) => {
  const io = { ...CLAMP, easing: EASE.inOut };
  const dropIn = 300 * Math.exp(-t / 0.13);
  const push = interpolate(t, [0, DROP], [0, 1], io);
  const kCause = kick(t, CUES[0] ?? 99);
  const kTitle = kick(t, CUES[1] ?? 99, 0.1);
  const kSeason = kick(t, CUES[2] ?? 99);
  const kSticker = kick(t, CUES[3] ?? 99, 0.06);
  const kStats = kick(t, STATS, 0.07);
  const kDrop = kick(t, DROP - 1 / 30, 0.08);
  const base = orbitCamera({
    target: vec(40 * u, -40 * u, 0),
    distance: (1230 - 230 * push + dropIn) * u,
    azimuth: interpolate(t, [0, DROP], [-6, 4], io),
    elevation: interpolate(t, [0, DROP], [-10, -7.5], io),
    roll: interpolate(t, [0, 1.2, DROP], [-2.5, 1, -1], io),
    focal: 950 * u,
  });
  const punched = dollyCamera(
    base,
    0,
    0,
    (16 * beatPulse(reel, 9) +
      40 * kCause +
      150 * kTitle +
      90 * kSeason +
      40 * kSticker +
      30 * kStats +
      160 * kDrop) *
      u,
  );
  const build = interpolate(t, [BUILD, DROP], [0, 1], CLAMP);
  return shake(
    {
      ...punched,
      roll:
        punched.roll +
        1.5 * kCause -
        3 * kTitle +
        2.5 * kSeason -
        1 * kSticker +
        4 * kDrop,
    },
    reel,
    {
      amount: 0.35 + 0.9 * (t / LEN) + 2.6 * build + 1.4 * kTitle + 2 * kDrop,
      speed: 4 + 10 * build,
      seed: "scoreboard",
    },
  );
};

/* ------------------------------------------------------------------ */
/* Shatter                                                             */
/* ------------------------------------------------------------------ */

const SHATTER_START = DROP - 1 / 30;
const S_COLS = 6;
const S_ROWS = 8;

type Shard = {
  readonly pts: [number, number][];
  readonly cx: number;
  readonly cy: number;
  readonly color: string;
  readonly vr: number;
  readonly vz: number;
  readonly spin: [number, number, number];
};

/** Jittered grid over the LED face, each cell split into two triangles. */
const SHARDS: Shard[] = (() => {
  const vx = (i: number, j: number) => {
    const edgeX = i === 0 || i === S_COLS;
    const edgeY = j === 0 || j === S_ROWS;
    const jx = edgeX ? 0 : (random(`sb-vx-${i}-${j}`) - 0.5) * 0.7;
    const jy = edgeY ? 0 : (random(`sb-vy-${i}-${j}`) - 0.5) * 0.7;
    return [((i + jx) / S_COLS) * LED_W, ((j + jy) / S_ROWS) * LED_H] as [
      number,
      number,
    ];
  };
  const out: Shard[] = [];
  for (let j = 0; j < S_ROWS; j++) {
    for (let i = 0; i < S_COLS; i++) {
      const a = vx(i, j);
      const b = vx(i + 1, j);
      const c = vx(i + 1, j + 1);
      const d = vx(i, j + 1);
      const flip = random(`sb-flip-${i}-${j}`) > 0.5;
      const tris: [number, number][][] = flip
        ? [
            [a, b, c],
            [a, c, d],
          ]
        : [
            [a, b, d],
            [b, c, d],
          ];
      tris.forEach((pts, k) => {
        const id = `${i}-${j}-${k}`;
        const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
        const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
        const r = random(`sb-col-${id}`);
        const inTitle = cy > ROW.title - 150 && cy < ROW.title + 170;
        const inSeason = cy > ROW.season - 110 && cy < ROW.season + 110;
        const color = inTitle
          ? r < 0.7
            ? stadium.flood
            : stadium.navyMid
          : inSeason
            ? r < 0.7
              ? stadium.volt
              : stadium.navy
            : r < 0.62
              ? stadium.navy
              : r < 0.82
                ? stadium.navyMid
                : r < 0.92
                  ? stadium.volt
                  : stadium.flood;
        out.push({
          pts,
          cx,
          cy,
          color,
          vr: 700 + random(`sb-vr-${id}`) * 1900,
          vz: 3600 + random(`sb-vz-${id}`) * 5600,
          spin: [
            (random(`sb-sx-${id}`) - 0.5) * 1500,
            (random(`sb-sy-${id}`) - 0.5) * 1500,
            (random(`sb-sz-${id}`) - 0.5) * 1100,
          ],
        });
      });
    }
  }
  return out;
})();

/** Explosion offset for anything sitting at LED-local (lx, ly). */
const blastOffset = (lx: number, ly: number, s: number, seed: string) => {
  if (s <= 0) return { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  const dx = lx - LED_W / 2;
  const dy = ly - LED_H * 0.45;
  const len = Math.hypot(dx, dy) || 1;
  const vr = 900 + random(`${seed}-vr`) * 1500;
  const vz = 4200 + random(`${seed}-vz`) * 4000;
  return {
    x: (dx / len) * vr * s,
    y: (dy / len) * vr * s,
    z: vz * s,
    rx: (random(`${seed}-rx`) - 0.5) * 1200 * s,
    ry: (random(`${seed}-ry`) - 0.5) * 1200 * s,
    rz: (random(`${seed}-rz`) - 0.5) * 900 * s,
  };
};

/* ------------------------------------------------------------------ */
/* Board face (2D content on the Box3D front)                          */
/* ------------------------------------------------------------------ */

const ledDots = (u: number, alpha = 0.12) =>
  `radial-gradient(circle, rgba(135,150,192,${alpha}) 0 ${1.3 * u}px, rgba(0,0,0,0) ${1.9 * u}px) 0 0 / ${9 * u}px ${9 * u}px`;

const BoardFace: React.FC<{
  readonly u: number;
  readonly t: number;
  readonly reel: number;
  readonly frame: number;
  readonly fps: number;
  readonly pulse: number;
  readonly cause: string;
  readonly causeFs: number;
  readonly shattered: boolean;
  readonly blast: number;
}> = ({ u, t, reel, frame, fps, pulse, cause, causeFs, shattered, blast }) => {
  const W = BOARD_W * u;
  const H = BOARD_H * u;
  const band = BAND * u;

  // Marquee bulbs: chase on 16ths, all on at hits, strobe in the build.
  const sixteenth = BEAT_SECONDS / 4;
  const step = Math.floor((reel - beatAt(0)) / sixteenth);
  const hit = Math.max(
    ...CUES.map((c) => kick(t, c, 0.06)),
    kick(t, STATS, 0.06),
  );
  const strobe = t >= BUILD;
  const bulbs: { x: number; y: number }[] = [];
  const nx = 18;
  const ny = 22;
  for (let i = 0; i < nx; i++)
    bulbs.push({ x: band / 2 + ((W - band) * i) / nx, y: band / 2 });
  for (let i = 0; i < ny; i++)
    bulbs.push({ x: W - band / 2, y: band / 2 + ((H - band) * i) / ny });
  for (let i = 0; i < nx; i++)
    bulbs.push({ x: W - band / 2 - ((W - band) * i) / nx, y: H - band / 2 });
  for (let i = 0; i < ny; i++)
    bulbs.push({ x: band / 2, y: H - band / 2 - ((H - band) * i) / ny });

  // 'cause + volt rule
  const causeOn = CUES[0] !== undefined && cause !== "" && t >= CUES[0];
  const causeIn = causeOn
    ? spring({
        frame: frame - CUES[0] * fps,
        fps,
        config: SPRING.smooth,
        durationInFrames: Math.round(0.3 * fps),
      })
    : 0;
  const causeW = cause ? textWidth(cause, CAUSE_FONT, causeFs, -0.01) : 0;
  const ruleFrom = (PAD + 26) * u + causeW;
  const ruleTo = (LED_W - PAD) * u;
  const rule = causeOn
    ? interpolate(t, [CUES[0] + 0.08, CUES[0] + 0.4], [0, 1], {
        ...CLAMP,
        easing: EASE.out,
      })
    : 0;

  // Stats line typing on
  const typed = Math.floor(
    interpolate(
      t,
      [STATS, STATS + 0.42],
      [0, Array.from(STATS_TEXT).length],
      CLAMP,
    ),
  );
  const statsFs = fitSize(STATS_TEXT, LED_FONT, (LED_W - PAD * 2) * u, {
    max: 58 * u,
  });
  const cursorOn =
    t >= STATS &&
    (t < STATS + 0.42 || Math.floor(t / (BEAT_SECONDS / 2)) % 2 === 0);

  // Light sweep across the glass
  const sweep = interpolate(t, [0.05, 1.0], [-0.6, 1.4], {
    ...CLAMP,
    easing: EASE.inOut,
  });
  const sweep2 = interpolate(t, [1.75, 2.45], [-0.6, 1.4], {
    ...CLAMP,
    easing: EASE.inOut,
  });

  const panelLabel: React.CSSProperties = {
    fontFamily: fonts.broadcast,
    fontWeight: 600,
    fontSize: 34 * u,
    letterSpacing: 4 * u,
    color: stadium.steel,
    lineHeight: 1,
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(180deg, ${stadium.navyLight} 0%, ${stadium.navyMid} 14%, ${stadium.navy} 70%, ${stadium.night} 100%)`,
      }}
    >
      {bulbs.map((b, i) => {
        const on = strobe
          ? (frame + (i % 2)) % 2 === 0
          : hit > 0.4 || (i + step) % 4 === 0;
        const r = 9.5 * u;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: b.x - r,
              top: b.y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              background: on
                ? `radial-gradient(circle at 40% 35%, #FFFFFF 0%, ${stadium.flood} 35%, ${stadium.volt} 85%)`
                : `radial-gradient(circle at 40% 35%, ${stadium.navyLight}, ${stadium.night} 80%)`,
              boxShadow: on
                ? `0 0 ${(12 + 10 * pulse) * u}px ${4 * u}px rgba(215,255,46,0.65)`
                : undefined,
            }}
          />
        );
      })}
      {/* LED face */}
      <div
        style={{
          position: "absolute",
          left: band,
          top: band,
          width: LED_W * u,
          height: LED_H * u,
          overflow: "hidden",
          borderRadius: 6 * u,
          background: shattered
            ? `radial-gradient(60% 50% at 50% 45%, #FFFFFF 0%, ${stadium.flood} 30%, ${stadium.volt} 70%, ${stadium.voltDeep} 100%)`
            : `${ledDots(u)}, radial-gradient(90% 60% at 50% 38%, ${stadium.navy} 0%, ${stadium.night} 80%)`,
          boxShadow: `inset 0 0 ${40 * u}px rgba(0,0,0,0.85), 0 0 0 ${3 * u}px ${mixColor(stadium.voltDeep, stadium.navy, 0.35)}`,
          opacity: shattered ? 0.75 + 0.25 * blast : 1,
        }}
      >
        {shattered ? null : (
          <>
            {/* Glow pools behind the headline rows */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (ROW.title - 230) * u,
                height: 460 * u,
                background: `radial-gradient(60% 50% at 50% 50%, rgba(43,74,156,${0.35 + 0.15 * pulse}) 0%, rgba(43,74,156,0) 100%)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: (ROW.season - 140) * u,
                height: 280 * u,
                background: `radial-gradient(55% 50% at 50% 50%, rgba(215,255,46,${t >= (CUES[2] ?? 99) ? 0.07 + 0.05 * pulse : 0}) 0%, rgba(215,255,46,0) 100%)`,
              }}
            />
            {/* 'cause */}
            {causeOn ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: PAD * u,
                    top: ROW.cause * u,
                    fontFamily: fonts.broadcast,
                    fontStyle: "italic",
                    fontWeight: 800,
                    fontSize: causeFs,
                    letterSpacing: "-0.01em",
                    lineHeight: 1,
                    color: stadium.flood,
                    whiteSpace: "pre",
                    opacity: interpolate(causeIn, [0, 0.4], [0.35, 1], CLAMP),
                    translate: `${(1 - causeIn) * -160 * u}px 0`,
                    textShadow: `0 0 ${18 * u}px rgba(246,248,255,0.35)`,
                  }}
                >
                  {cause}
                </div>
                <div
                  style={{
                    position: "absolute",
                    left: ruleFrom,
                    top: ROW.cause * u + causeFs * 0.5,
                    width: Math.max(0, ruleTo - ruleFrom) * rule,
                    height: 8 * u,
                    background: stadium.volt,
                    boxShadow: `0 0 ${14 * u}px rgba(215,255,46,0.7)`,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left:
                      ruleFrom + Math.max(0, ruleTo - ruleFrom) * rule - 9 * u,
                    top: ROW.cause * u + causeFs * 0.5 - 5 * u,
                    width: 18 * u,
                    height: 18 * u,
                    borderRadius: "50%",
                    background: stadium.volt,
                    opacity: rule > 0.02 ? 1 : 0,
                    boxShadow: `0 0 ${16 * u}px ${stadium.volt}`,
                  }}
                />
              </>
            ) : null}
            {/* Stats row */}
            {t >= STATS ? (
              <div
                style={{
                  position: "absolute",
                  left: PAD * u,
                  top: ROW.stats * u - statsFs / 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <LedText style={{ fontSize: statsFs }}>
                  {Array.from(STATS_TEXT).slice(0, typed).join("")}
                </LedText>
                <div
                  style={{
                    width: statsFs * 0.55,
                    height: statsFs * 0.9,
                    marginLeft: statsFs * 0.12,
                    background: stadium.volt,
                    opacity: cursorOn ? 0.9 : 0,
                    boxShadow: `0 0 ${12 * u}px ${stadium.volt}`,
                  }}
                />
              </div>
            ) : null}
            {/* Divider */}
            <div
              style={{
                position: "absolute",
                left: PAD * u,
                right: PAD * u,
                top: ROW.divider * u,
                height: 3 * u,
                background: `linear-gradient(90deg, rgba(135,150,192,0) 0%, ${stadium.steel} 20%, ${stadium.steel} 80%, rgba(135,150,192,0) 100%)`,
                opacity: 0.6,
              }}
            />
            {/* Scoreboard panel: HOME / AWAY (the clock is its own module) */}
            {(
              [
                ["HOME", "24", 170],
                ["AWAY", "30", LED_W - 170],
              ] as const
            ).map(([label, score, x]) => (
              <div
                key={label}
                style={{
                  position: "absolute",
                  left: (x - 150) * u,
                  width: 300 * u,
                  top: (ROW.panel + 18) * u,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 18 * u,
                }}
              >
                <div style={panelLabel}>{label}</div>
                <LedText
                  color={stadium.flood}
                  glow={0.7}
                  style={{ fontSize: 118 * u }}
                >
                  {score}
                </LedText>
              </div>
            ))}
            <div
              style={{
                ...panelLabel,
                position: "absolute",
                left: 0,
                right: 0,
                textAlign: "center",
                top: (ROW.panel + 18) * u,
              }}
            >
              QTR <span style={{ color: stadium.volt }}>4</span>
            </div>
            {/* Glass sweeps */}
            {[sweep, sweep2].map((s, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: -LED_H * 0.2 * u,
                  bottom: -LED_H * 0.2 * u,
                  left: `${s * 100}%`,
                  width: 220 * u,
                  rotate: "18deg",
                  background:
                    "linear-gradient(90deg, rgba(246,248,255,0) 0%, rgba(246,248,255,0.07) 50%, rgba(246,248,255,0) 100%)",
                }}
              />
            ))}
          </>
        )}
      </div>
      {/* Top plate */}
      <div
        style={{
          position: "absolute",
          left: W / 2 - 90 * u,
          top: 6 * u,
          width: 180 * u,
          height: band - 12 * u,
          borderRadius: 6 * u,
          background: stadium.volt,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fonts.varsity,
          fontSize: 28 * u,
          color: stadium.navy,
          letterSpacing: 2 * u,
        }}
      >
        TS
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Clock module (mounted on the face, flies off in the blast)          */
/* ------------------------------------------------------------------ */

const clockText = (remaining: number): string => {
  // Tenths, changing to 0.0 on the first frame at (or nearest to) the drop.
  const tenths = Math.max(0, Math.ceil(remaining * 10 - 0.25));
  const s = tenths / 10;
  return `0:${s.toFixed(1).padStart(4, "0")}`;
};

const ClockModule: React.FC<{
  readonly u: number;
  readonly t: number;
  readonly pulse: number;
}> = ({ u, t, pulse }) => {
  const w = 360 * u;
  const h = 150 * u;
  const remaining = DROP - t;
  const last = remaining < 0.75;
  return (
    <Box3D
      width={w}
      height={h}
      depth={26 * u}
      colors={{
        front: stadium.night,
        side: stadium.navyMid,
        top: stadium.navyLight,
      }}
      faces={{
        front: (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `${ledDots(u, 0.16)}, ${stadium.night}`,
              border: `${3 * u}px solid ${stadium.navyLight}`,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10 * u,
            }}
          >
            <LedText
              color={last ? stadium.signal : stadium.volt}
              glow={0.8 + (last ? 0.5 * pulse : 0)}
              style={{ fontSize: 70 * u }}
            >
              {clockText(remaining)}
            </LedText>
          </div>
        ),
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type ScoreboardSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const ScoreboardSceneInner: React.FC<ScoreboardSceneProps> = ({
  words,
  style,
}) => {
  const { t, reel, frame, fps, pulse, phase } = useSceneClock(KEY);
  const { px, unit: u } = useLayout();
  useFontsReady(FONT_SPECS);
  const slots = splitSlots(words);
  const [cause = "", title = "", season = "", tag = ""] = slots;

  const cam = camAt(t, reel, u);
  const s = Math.max(0, t - SHATTER_START);
  const shattered = t >= SHATTER_START;

  // Board shudder in the beat build.
  const build = interpolate(t, [BUILD, DROP], [0, 1], CLAMP);
  const shudder = build * 10 * u + kick(t, CUES[1] ?? 99, 0.05) * 6 * u;
  const bx = noise1("sb-bx", t * 40) * shudder;
  const by = noise1("sb-by", t * 40 + 9) * shudder;

  const ledX = (lx: number) => (lx - LED_W / 2) * u;
  const ledY = (ly: number) => (ly - LED_H / 2) * u;

  /* --- 'cause --- */
  const causeFs = cause
    ? fitSize(cause, CAUSE_FONT, 420 * u, {
        max: 104 * u,
        min: 40 * u,
        letterSpacingEm: -0.01,
      })
    : 0;

  /* --- TRAINING (slot 2), letter by letter --- */
  const titleW = LYRIC_W * u;
  const capRatio = inkMetrics("H", TITLE_FONT, 100).ascent / 100 || 0.75;
  const titleMaxFs = (300 * u) / (capRatio * STRETCH);
  const titleFs = title
    ? fitSize(title, TITLE_FONT, titleW, { max: titleMaxFs })
    : 0;
  const titleLetters = title ? letterLayout(title, TITLE_FONT, titleFs) : [];
  const titleTotal = title ? textWidth(title, TITLE_FONT, titleFs) : 0;
  const titleOffset = title ? capCenterOffset(TITLE_FONT, titleFs) : 0;
  const titleCue = CUES[1];
  const titleStagger =
    titleLetters.length > 1 ? 0.2 / (titleLetters.length - 1) : 0;

  /* --- SEASON (slot 3) on a jersey arch, then the 's sticker (slot 4) --- */
  const tagFs = tag
    ? fitSize(tag, SEASON_FONT, 130 * u, { max: 92 * u, min: 40 * u })
    : 0;
  const tagTextW = tag ? textWidth(tag, SEASON_FONT, tagFs) : 0;
  const tagW = tag ? Math.max(tagFs * 1.5, tagTextW + tagFs * 0.9) : 0;
  const tagRoom = tag ? tagW * 0.85 : 0;
  const seasonRoom = LYRIC_W * u - tagRoom;
  const seasonFs = season
    ? fitSize(season, SEASON_FONT, seasonRoom, {
        max: 190 * u,
        letterSpacingEm: 0.02,
      })
    : 0;
  const seasonLetters = season
    ? letterLayout(season, SEASON_FONT, seasonFs, 0.02)
    : [];
  const seasonTotal = season
    ? textWidth(season, SEASON_FONT, seasonFs, 0.02)
    : 0;
  const seasonOffset = season ? capCenterOffset(SEASON_FONT, seasonFs) : 0;
  const seasonLeft = -(seasonTotal + tagRoom) / 2;
  const arcR = 2200 * u;
  const seasonCue = CUES[2];
  const tagCue = CUES[3];

  const letterDepth = 56 * u;
  const zFront = FRONT_Z * u;

  const titleNodes = titleLetters.map((l, i) => {
    if (titleCue === undefined || l.char === " ") return null;
    const t0 = titleCue + i * titleStagger;
    if (t < t0) return null;
    const age = t - t0;
    const fly = interpolate(age, [0, 0.09], [1, 0], {
      ...CLAMP,
      easing: EASE.in,
    });
    const settle = spring({
      frame: (age - 0.09) * fps,
      fps,
      config: SPRING.snappy,
    });
    const impact = age >= 0.09 ? 1 - settle : 0;
    const x = -titleTotal / 2 + l.left + l.width / 2;
    const y = ledY(ROW.title) - titleOffset * STRETCH;
    const lx = LED_W / 2 + x / u;
    const bo = blastOffset(lx, ROW.title, s, `sb-title-${i}`);
    const side = random(`sb-t-side-${i}`) - 0.5;
    // A volt glint chases across the word on every beat once it has landed.
    const settled = titleCue !== undefined && t > titleCue + 0.4 && s <= 0;
    const glint = settled
      ? Math.exp(-((phase * (titleLetters.length + 3) - 1.5 - i) ** 2) / 0.6)
      : 0;
    return (
      <Node3D
        key={`t${i}`}
        x={x + side * 90 * u * fly + bo.x * u}
        y={y + 70 * u * fly + bo.y * u}
        z={zFront + letterDepth + 2 * u + 340 * u * fly + bo.z * u}
        rx={-35 * fly + 10 * impact + bo.rx}
        ry={side * 40 * fly + bo.ry}
        rz={side * 30 * fly + bo.rz}
        scale={1 + 0.1 * impact + 0.5 * fly}
      >
        <div style={{ transformStyle: "preserve-3d", scale: `1 ${STRETCH}` }}>
          <ExtrudedText
            depth={letterDepth}
            layers={12}
            face={stadium.flood}
            sideLight={stadium.navyLight}
            sideDark={stadium.night}
            textStyle={{
              fontFamily: fonts.stadium,
              fontWeight: 900,
              fontSize: titleFs,
            }}
            faceStyle={{
              backgroundImage: `linear-gradient(180deg, #FFFFFF 0%, ${stadium.flood} 55%, ${mixColor(stadium.flood, stadium.steel, 0.3)} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter:
                glint > 0.02
                  ? `drop-shadow(0 0 ${(14 * glint * u).toFixed(1)}px rgba(215,255,46,${(0.95 * glint).toFixed(2)}))`
                  : undefined,
            }}
          >
            {l.char}
          </ExtrudedText>
        </div>
      </Node3D>
    );
  });

  const seasonNodes = seasonLetters.map((l, i) => {
    if (seasonCue === undefined || l.char === " ") return null;
    if (t < seasonCue) return null;
    // One whip from the left; letters further back trail a little more,
    // so the word stretches but never scrambles. One frame of lead-in so
    // the word is already on screen at its cue frame.
    const k = spring({
      frame: (t - seasonCue) * fps + 1,
      fps,
      config: SPRING.snappy,
    });
    const trail = 1 + (seasonLetters.length - 1 - i) * 0.12;
    const x = seasonLeft + l.left + l.width / 2;
    const theta = Math.asin(Math.max(-0.9, Math.min(0.9, x / arcR)));
    const arcY = arcR * (1 - Math.cos(theta));
    const lx = LED_W / 2 + x / u;
    const bo = blastOffset(lx, ROW.season, s, `sb-season-${i}`);
    return (
      <Node3D
        key={`s${i}`}
        x={x - (1 - k) * 380 * trail * u + bo.x * u}
        y={ledY(ROW.season) + arcY - seasonOffset + bo.y * u}
        z={zFront + 44 * u + 2 * u + (1 - k) * 160 * u + bo.z * u}
        rx={bo.rx}
        ry={(1 - k) * -24 + bo.ry}
        rz={(theta * 180) / Math.PI + (1 - k) * -14 + bo.rz}
      >
        <ExtrudedText
          depth={44 * u}
          layers={11}
          face={stadium.volt}
          sideLight={stadium.navyMid}
          sideDark={stadium.night}
          stroke={{ color: stadium.navy, width: seasonFs * 0.07 }}
          textStyle={{
            fontFamily: fonts.varsity,
            fontSize: seasonFs,
            letterSpacing: "0.02em",
          }}
          faceStyle={{ textShadow: `0 0 ${18 * u}px rgba(215,255,46,0.35)` }}
        >
          {l.char}
        </ExtrudedText>
      </Node3D>
    );
  });

  // 's sticker: pops after SEASON's last letter, tilted.
  const lastSeason = seasonLetters[seasonLetters.length - 1];
  const tagX =
    season && lastSeason
      ? Math.min(
          seasonLeft + seasonTotal + tagW * 0.5,
          (LYRIC_W / 2 + 40) * u - tagW / 2,
        )
      : 0;
  const tagTheta = Math.asin(Math.max(-0.9, Math.min(0.9, tagX / arcR)));
  const tagY =
    ledY(ROW.season) -
    (season ? seasonFs * 0.42 : 0) +
    arcR * (1 - Math.cos(tagTheta));
  const tagPop =
    tagCue !== undefined && t >= tagCue
      ? spring({
          frame: (t - tagCue) * fps + 1,
          fps,
          config: SPRING.bouncy,
          durationInFrames: Math.round(0.4 * fps),
        })
      : 0;
  const tagBo = blastOffset(LED_W / 2 + tagX / u, ROW.season - 60, s, "sb-tag");

  // Clock module
  const clockBo = blastOffset(LED_W / 2, ROW.panel + 130, s, "sb-clock");

  // Drop flash and opening flash
  const openFlash = interpolate(t, [0, 0.15], [1, 0], {
    ...CLAMP,
    easing: EASE.out,
  });
  const dropFlash = interpolate(
    t,
    [SHATTER_START - 0.005, DROP, LEN],
    [0, 0.5, 0.42],
    CLAMP,
  );
  const bloom = interpolate(t, [SHATTER_START - 0.005, LEN], [0, 1], CLAMP);

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <StadiumSky camera={cam} seconds={reel} pulse={pulse} horizon={0.55} />
      <Stage3D camera={cam}>
        <FieldFloor y={px(1900)} z={px(600)} />
        <Node3D x={bx} y={by}>
          <div
            style={{
              position: "relative",
              width: 0,
              height: 0,
              transformStyle: "preserve-3d",
            }}
          >
            {/* Legs */}
            {[-1, 1].map((side) => (
              <Node3D
                key={side}
                x={side * px(330)}
                y={px(BOARD_H / 2 + 600)}
                z={px(-20)}
              >
                <Box3D
                  width={px(100)}
                  height={px(1200)}
                  depth={px(100)}
                  colors={{
                    front: stadium.navyMid,
                    side: stadium.navy,
                    top: stadium.navyLight,
                  }}
                />
              </Node3D>
            ))}
            {/* Crown light bar */}
            <Node3D y={px(-BOARD_H / 2 - 36)}>
              <Box3D
                width={px(BOARD_W * 0.62)}
                height={px(56)}
                depth={px(110)}
                colors={{
                  front: stadium.navy,
                  side: stadium.night,
                  top: stadium.navyLight,
                }}
                faces={{
                  front: (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-evenly",
                      }}
                    >
                      {new Array(9).fill(0).map((_, i) => (
                        <div
                          key={i}
                          style={{
                            width: px(30),
                            height: px(30),
                            borderRadius: "50%",
                            background: `radial-gradient(circle, #FFFFFF 0%, ${stadium.flood} 45%, rgba(246,248,255,0.2) 100%)`,
                            boxShadow: `0 0 ${px(18 + 14 * pulse)}px rgba(246,248,255,0.8)`,
                          }}
                        />
                      ))}
                    </div>
                  ),
                }}
              />
            </Node3D>
            {/* The board */}
            <Box3D
              width={px(BOARD_W)}
              height={px(BOARD_H)}
              depth={px(BOARD_D)}
              colors={{
                front: stadium.navy,
                side: stadium.navyMid,
                top: stadium.navyLight,
                bottom: stadium.night,
              }}
              faces={{
                front: (
                  <BoardFace
                    u={u}
                    t={t}
                    reel={reel}
                    frame={frame}
                    fps={fps}
                    pulse={pulse}
                    cause={cause}
                    causeFs={causeFs}
                    shattered={shattered}
                    blast={kick(t, SHATTER_START, 0.05)}
                  />
                ),
              }}
            />
            {/* Clock module */}
            <Node3D
              x={clockBo.x * u}
              y={ledY(ROW.panel + 130) + clockBo.y * u}
              z={zFront + px(14) + clockBo.z * u}
              rx={clockBo.rx}
              ry={clockBo.ry}
              rz={clockBo.rz}
            >
              <ClockModule u={u} t={t} pulse={pulse} />
            </Node3D>
            {/* Shards */}
            {shattered
              ? SHARDS.map((sh, i) => {
                  const xs = sh.pts.map((p) => p[0]);
                  const ys = sh.pts.map((p) => p[1]);
                  const minX = Math.min(...xs);
                  const minY = Math.min(...ys);
                  const w = Math.max(...xs) - minX;
                  const h = Math.max(...ys) - minY;
                  const dx = sh.cx - LED_W / 2;
                  const dy = sh.cy - LED_H * 0.45;
                  const len = Math.hypot(dx, dy) || 1;
                  const near = 1 - Math.min(1, len / (LED_H * 0.6));
                  const vz = sh.vz * (0.6 + 0.6 * near);
                  const poly = sh.pts
                    .map(
                      (p) =>
                        `${(((p[0] - minX) / (w || 1)) * 100).toFixed(2)}% ${(((p[1] - minY) / (h || 1)) * 100).toFixed(2)}%`,
                    )
                    .join(", ");
                  return (
                    <Node3D
                      key={i}
                      x={ledX(sh.cx) + (dx / len) * sh.vr * s * u}
                      y={ledY(sh.cy) + (dy / len) * sh.vr * s * u}
                      z={zFront + px(2) + vz * s * u}
                      rx={sh.spin[0] * s}
                      ry={sh.spin[1] * s}
                      rz={sh.spin[2] * s}
                    >
                      <div
                        style={{
                          width: w * u,
                          height: h * u,
                          translate: `${(minX + w / 2 - sh.cx) * u}px ${(minY + h / 2 - sh.cy) * u}px`,
                          clipPath: `polygon(${poly})`,
                          background: `${ledDots(u, sh.color === stadium.navy || sh.color === stadium.navyMid ? 0.18 : 0.08)}, linear-gradient(135deg, ${mixColor(sh.color === stadium.navy ? stadium.navyMid : sh.color, "#FFFFFF", 0.25)} 0%, ${sh.color} 60%)`,
                        }}
                      />
                    </Node3D>
                  );
                })
              : null}
            {/* Slot 2 */}
            {titleNodes}
            {/* Slot 3 */}
            {seasonNodes}
            {/* Slot 4 sticker */}
            {tag && tagPop > 0 ? (
              <Node3D
                x={tagX + tagBo.x * u}
                y={tagY + tagBo.y * u}
                z={zFront + px(70) + tagBo.z * u}
                rx={tagBo.rx}
                ry={tagBo.ry}
                rz={-12 + (1 - tagPop) * 40 + tagBo.rz}
                scale={0.45 + 0.55 * tagPop}
              >
                <div
                  style={{
                    position: "relative",
                    width: tagW,
                    height: tagFs * 1.45,
                    borderRadius: tagFs * 0.72,
                    background: stadium.signal,
                    border: `${7 * u}px solid ${stadium.flood}`,
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: fonts.varsity,
                    fontSize: tagFs,
                    lineHeight: 1,
                    color: stadium.flood,
                    whiteSpace: "pre",
                    boxShadow: `${6 * u}px ${10 * u}px 0 ${stadium.navy}`,
                  }}
                >
                  {tag}
                </div>
              </Node3D>
            ) : null}
          </div>
        </Node3D>
      </Stage3D>
      {/* Light bursting out of the board at the drop */}
      {bloom > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(55% 40% at 50% 47%, rgba(255,255,255,${0.85 * bloom}) 0%, rgba(215,255,46,${0.35 * bloom}) 45%, rgba(215,255,46,0) 100%)`,
          }}
        />
      ) : null}
      <Flash opacity={Math.max(openFlash, dropFlash)} />
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const scoreboardSceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const ScoreboardScene = Interactive.withSchema({
  Component: ScoreboardSceneInner,
  componentName: "<ScoreboardScene>",
  schema: scoreboardSceneSchema,
  wrapInSequence: true,
});
