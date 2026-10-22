import type React from "react";
import { useId, useMemo } from "react";
import {
  AbsoluteFill,
  Interactive,
  interpolate,
  random,
  spring,
  type InteractivitySchema,
} from "remotion";
import { Box3D } from "../../../components/Solids3D";
import { Node3D, Plane3D, Stage3D } from "../../../components/Stage3D";
import { CLAMP, EASE, SPRING } from "../../../lib/animation";
import { noise1, orbitCamera, shake, vec3 } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { BroadcastFinish, FieldFloor, Flash, WhipBlur } from "../kit/fx";
import { StadiumSky } from "../kit/StadiumSky";
import {
  fitSize,
  inkOf,
  useFontsReady,
  type FontSpec,
  type Ink,
} from "../kit/TicketChalkText";
import {
  localCues,
  sceneLength,
  splitSlots,
  TRAINING_SEASON_TIMING,
} from "../timing";

/**
 * Scene 4, TICKETS: a ransom note made of torn ticket stubs. Slot 1 is
 * printed on a big game ticket that flips in, slot 2 is rubber-stamped on a
 * stub, and slot 3 is split into syllables; each syllable slaps on as a row
 * of letters cut from tickets, pennants, patches, scoreboard cards,
 * stickers, programme clippings and label tape.
 */

const LEN = sceneLength("tickets");
const CUES = localCues("tickets", TRAINING_SEASON_TIMING.cues.tickets);
const SYLLABLE_CUES = localCues(
  "tickets",
  TRAINING_SEASON_TIMING.cues.ticketSyllables,
);
/** Absorbs float error so a word shows on its cue frame, never one late. */
const EPS = 1e-3;
/** Horizontal centre of the lyric safe band (x 80…940) in world px. */
const CX = -30;

const F = {
  broadcast: { family: fonts.broadcast, weight: 900, style: "italic" },
  label: { family: fonts.broadcast, weight: 600 },
  stadium: { family: fonts.stadium, weight: 900 },
  varsity: { family: fonts.varsity, weight: 400 },
  led: { family: fonts.led, weight: 900 },
  serif: { family: fonts.serif, weight: 500 },
  mono: { family: fonts.mono, weight: 500 },
} as const satisfies Record<string, FontSpec>;

const FONT_LIST: FontSpec[] = Object.values(F);

/* ------------------------------------------------------------------ */
/* Letter pieces                                                       */
/* ------------------------------------------------------------------ */

type PieceKind =
  | "ticket"
  | "pennant"
  | "patch"
  | "scorecard"
  | "sticker"
  | "clipping"
  | "tape";

type PieceStyle = {
  readonly kind: PieceKind;
  readonly font: FontSpec;
  readonly ink: string;
  readonly upper: boolean;
  /** Cap height as a fraction of the piece height. */
  readonly cap: number;
};

const PIECES: readonly PieceStyle[] = [
  { kind: "sticker", font: F.broadcast, ink: stadium.navy, upper: false, cap: 0.6 },
  { kind: "pennant", font: F.varsity, ink: stadium.flood, upper: true, cap: 0.5 },
  { kind: "scorecard", font: F.led, ink: stadium.volt, upper: true, cap: 0.56 },
  { kind: "clipping", font: F.serif, ink: stadium.night, upper: false, cap: 0.62 },
  { kind: "patch", font: F.stadium, ink: stadium.flood, upper: true, cap: 0.6 },
  { kind: "ticket", font: F.mono, ink: stadium.navy, upper: true, cap: 0.5 },
  { kind: "tape", font: F.stadium, ink: stadium.navy, upper: false, cap: 0.6 },
];

type Piece = {
  readonly ch: string;
  readonly style: PieceStyle;
  readonly size: number;
  readonly ink: Ink;
  readonly w: number;
  readonly h: number;
  /** Area the letter is centred in (x range). */
  readonly cx0: number;
  readonly cx1: number;
  readonly x: number;
  readonly y: number;
  readonly rot: number;
  readonly seed: string;
};

type Row = {
  readonly pieces: Piece[];
  readonly y: number;
  /** Syllable (and so cue) this row belongs to. */
  readonly syl: number;
};

const jag = (
  seed: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  amp: number,
  nx: number,
  ny: number,
): string => {
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const off = (random(`${seed}-${i}`) - 0.5) * 2 * amp;
    pts.push(
      `${(x0 + (x1 - x0) * k + nx * off).toFixed(1)},${(y0 + (y1 - y0) * k + ny * off).toFixed(1)}`,
    );
  }
  return pts.join(" ");
};

const PieceShape: React.FC<{ readonly p: Piece; readonly glow: number }> = ({
  p,
  glow,
}) => {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { w, h, style } = p;
  const pad = 14;
  const vw = w + pad * 2;
  const vh = h + pad * 2;
  const cx = (p.cx0 + p.cx1) / 2;
  const tx = pad + cx - (p.ink.right - p.ink.left) / 2;
  const ty = pad + h / 2 + (p.ink.ascent - p.ink.descent) / 2;
  const text = (
    <text
      x={tx}
      y={ty}
      fill={style.ink}
      style={{
        fontFamily: style.font.family,
        fontWeight: style.font.weight,
        fontStyle: style.font.style ?? "normal",
        fontSize: p.size,
      }}
    >
      {p.ch}
    </text>
  );
  const o = pad;
  let body: React.ReactNode = null;
  switch (style.kind) {
    case "ticket": {
      const r = h * 0.09;
      const d = `M${o},${o} H${o + w} V${o + h / 2 - r} A${r},${r} 0 0 0 ${o + w},${o + h / 2 + r} V${o + h} H${o} V${o + h / 2 + r} A${r},${r} 0 0 0 ${o},${o + h / 2 - r} Z`;
      body = (
        <>
          <path d={d} fill={stadium.flood} />
          <line
            x1={o + 10}
            x2={o + w - 10}
            y1={o + h * 0.15}
            y2={o + h * 0.15}
            stroke={stadium.navy}
            strokeOpacity={0.55}
            strokeWidth={4}
            strokeDasharray="3 9"
            strokeLinecap="round"
          />
          <rect
            x={o + 10}
            y={o + h * 0.84}
            width={w - 20}
            height={h * 0.05}
            fill={stadium.volt}
          />
          {text}
        </>
      );
      break;
    }
    case "pennant": {
      const b = h * 0.17;
      body = (
        <>
          <polygon
            points={`${o + b},${o} ${o + w},${o + h * 0.16} ${o + w},${o + h * 0.84} ${o + b},${o + h}`}
            fill={stadium.signal}
          />
          <rect x={o} y={o} width={b} height={h} fill={stadium.volt} />
          <rect
            x={o + b}
            y={o}
            width={6}
            height={h}
            fill={stadium.signalDeep}
          />
          {text}
        </>
      );
      break;
    }
    case "patch": {
      const r = h * 0.18;
      body = (
        <>
          <rect x={o} y={o} width={w} height={h} rx={r} fill={stadium.navy} />
          <rect
            x={o + 10}
            y={o + 10}
            width={w - 20}
            height={h - 20}
            rx={r * 0.7}
            fill="none"
            stroke={stadium.volt}
            strokeWidth={4}
            strokeDasharray="11 7"
          />
          <text
            x={tx}
            y={ty}
            fill={style.ink}
            stroke={stadium.volt}
            strokeWidth={p.size * 0.07}
            paintOrder="stroke fill"
            strokeLinejoin="round"
            style={{
              fontFamily: style.font.family,
              fontWeight: style.font.weight,
              fontSize: p.size,
            }}
          >
            {p.ch}
          </text>
        </>
      );
      break;
    }
    case "scorecard": {
      body = (
        <>
          <defs>
            <filter id={`${id}-g`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={p.size * 0.05} />
            </filter>
          </defs>
          <rect x={o} y={o} width={w} height={h} rx={12} fill={stadium.night} />
          <rect
            x={o}
            y={o}
            width={w}
            height={h / 2}
            rx={12}
            fill={stadium.navy}
          />
          <rect
            x={o + 6}
            y={o + 6}
            width={w - 12}
            height={h - 12}
            rx={8}
            fill="none"
            stroke={stadium.navyLight}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
          <g filter={`url(#${id}-g)`} opacity={0.65 + 0.35 * glow}>
            {text}
          </g>
          {text}
          <rect
            x={o}
            y={o + h / 2 - 2.5}
            width={w}
            height={5}
            fill={stadium.night}
          />
          <circle cx={o + 9} cy={o + h / 2} r={4} fill={stadium.steel} />
          <circle cx={o + w - 9} cy={o + h / 2} r={4} fill={stadium.steel} />
        </>
      );
      break;
    }
    case "sticker": {
      const r = h * 0.26;
      body = (
        <>
          <rect
            x={o + 5}
            y={o + 5}
            width={w - 10}
            height={h - 10}
            rx={r}
            fill={stadium.volt}
            stroke={stadium.flood}
            strokeWidth={10}
          />
          <rect
            x={o + 14}
            y={o + 14}
            width={w - 28}
            height={h * 0.3}
            rx={r * 0.7}
            fill="#FFFFFF"
            fillOpacity={0.22}
          />
          {text}
        </>
      );
      break;
    }
    case "clipping": {
      const pts = [
        jag(`${p.seed}t`, o, o + 6, o + w, o + 2, 9, 4, 0, 1),
        jag(`${p.seed}r`, o + w - 3, o, o + w - 3, o + h, 7, 4, 1, 0),
        jag(`${p.seed}b`, o + w, o + h - 4, o, o + h - 2, 9, 5, 0, 1),
        jag(`${p.seed}l`, o + 3, o + h, o + 3, o, 7, 4, 1, 0),
      ].join(" ");
      body = (
        <>
          <polygon points={pts} fill={stadium.flood} />
          <line
            x1={o + 8}
            x2={o + w - 8}
            y1={o + h * 0.1}
            y2={o + h * 0.1}
            stroke={stadium.steel}
            strokeWidth={3}
          />
          <line
            x1={o + 8}
            x2={o + w - 8}
            y1={o + h * 0.9}
            y2={o + h * 0.9}
            stroke={stadium.steel}
            strokeWidth={3}
          />
          {text}
        </>
      );
      break;
    }
    case "tape": {
      const z = h * 0.06;
      const zig = (x: number, dir: number) =>
        new Array(7)
          .fill(0)
          .map((_, i) => `${x + (i % 2 === 0 ? 0 : dir * z)},${o + (h * i) / 6}`)
          .join(" ");
      body = (
        <>
          <polygon
            points={`${zig(o, 1)} ${zig(o + w, -1).split(" ").reverse().join(" ")}`}
            fill={stadium.volt}
          />
          <rect
            x={o}
            y={o + h * 0.1}
            width={w}
            height={h * 0.8}
            fill={stadium.voltDeep}
            fillOpacity={0.25}
          />
          {text}
        </>
      );
      break;
    }
    default:
      body = text;
  }
  return (
    <svg
      width={vw}
      height={vh}
      viewBox={`0 0 ${vw} ${vh}`}
      style={{ display: "block", overflow: "visible" }}
    >
      {body}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/* The big game ticket (slot 1)                                        */
/* ------------------------------------------------------------------ */

const TICKET_W = 860;
const TICKET_H = 430;
const TICKET_STUB = 190;
const SMALL_PRINT = "ADMIT ONE · SEC 122 · ROW 95 · SEAT 30";

const Barcode: React.FC<{ readonly width: number; readonly height: number }> = ({
  width,
  height,
}) => {
  const bars = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    let x = 0;
    let i = 0;
    while (x < width) {
      const w = 2 + Math.floor(random(`bar-${i}`) * 4) * 2;
      out.push({ x, w });
      x += w + 3 + Math.floor(random(`gap-${i}`) * 3) * 2;
      i++;
    }
    return out.filter((b) => b.x + b.w <= width);
  }, [width]);
  return (
    <div style={{ position: "relative", width, height }}>
      {bars.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: b.x,
            top: 0,
            width: b.w,
            height,
            background: stadium.navy,
          }}
        />
      ))}
    </div>
  );
};

const GameTicket: React.FC<{
  readonly word: string;
  readonly glint: number;
}> = ({ word, glint }) => {
  const { px } = useLayout();
  const w = px(TICKET_W);
  const h = px(TICKET_H);
  const mainW = w - px(TICKET_STUB);
  const header = px(64);
  const footer = px(62);
  const wordBoxW = mainW - px(90);
  const wordBoxH = h - header - footer;
  const size = Math.min(
    fitSize(word, F.broadcast, wordBoxW, px(260)),
    px(260),
  );
  const ink = inkOf(word, F.broadcast, size);
  const notch = px(20);
  const tx = mainW / 2 - (ink.right - ink.left) / 2;
  const ty = header + wordBoxH / 2 + (ink.ascent - ink.descent) / 2;
  const mask = [
    `radial-gradient(circle at ${mainW}px 0px, transparent ${notch}px, #000 ${notch + 1}px)`,
    `radial-gradient(circle at ${mainW}px ${h}px, transparent ${notch}px, #000 ${notch + 1}px)`,
  ].join(", ");
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      {/* Volt paper with a fine security pattern */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: mainW,
          height: h,
          background: [
            `repeating-linear-gradient(135deg, rgba(11,22,51,0.07) 0 ${px(2)}px, rgba(0,0,0,0) ${px(2)}px ${px(13)}px)`,
            `radial-gradient(120% 90% at 30% 40%, ${stadium.volt} 0%, ${stadium.voltDeep} 140%)`,
          ].join(", "),
        }}
      />
      {/* Stub: floodlight-white paper */}
      <div
        style={{
          position: "absolute",
          left: mainW,
          top: 0,
          width: w - mainW,
          height: h,
          background: stadium.flood,
        }}
      />
      {/* Header band */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: mainW,
          height: header,
          background: stadium.navy,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `0 ${px(30)}px`,
          boxSizing: "border-box",
          fontFamily: fonts.broadcast,
          fontWeight: 600,
          fontSize: px(32),
          letterSpacing: "0.16em",
          color: stadium.volt,
        }}
      >
        <span>TRAINING SEASON</span>
        <span style={{ color: stadium.flood }}>GAME 04</span>
      </div>
      {/* The lyric word */}
      <svg
        width={mainW}
        height={h}
        style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
      >
        <text
          x={tx + px(6)}
          y={ty + px(7)}
          fill={stadium.voltDeep}
          style={{
            fontFamily: F.broadcast.family,
            fontWeight: 900,
            fontStyle: "italic",
            fontSize: size,
          }}
        >
          {word}
        </text>
        <text
          x={tx}
          y={ty}
          fill={stadium.navy}
          style={{
            fontFamily: F.broadcast.family,
            fontWeight: 900,
            fontStyle: "italic",
            fontSize: size,
          }}
        >
          {word}
        </text>
      </svg>
      {/* Small print */}
      <div
        style={{
          position: "absolute",
          left: px(30),
          right: px(30) + (w - mainW),
          bottom: 0,
          height: footer,
          borderTop: `${px(3)}px solid ${stadium.navy}`,
          display: "flex",
          alignItems: "center",
          fontFamily: fonts.mono,
          fontWeight: 500,
          fontSize: px(24),
          letterSpacing: "0.04em",
          color: stadium.navy,
          whiteSpace: "nowrap",
        }}
      >
        {SMALL_PRINT}
      </div>
      {/* Stub contents */}
      <div
        style={{
          position: "absolute",
          left: mainW,
          top: 0,
          width: w - mainW,
          height: h,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: `${px(34)}px 0 ${px(30)}px`,
          boxSizing: "border-box",
          color: stadium.navy,
        }}
      >
        <div
          style={{
            fontFamily: fonts.broadcast,
            fontWeight: 600,
            fontSize: px(30),
            letterSpacing: "0.14em",
            lineHeight: 1.05,
            textAlign: "center",
          }}
        >
          ADMIT
          <br />
          ONE
        </div>
        <div
          style={{
            fontFamily: fonts.stadium,
            fontWeight: 900,
            fontSize: px(118),
            lineHeight: 0.9,
          }}
        >
          30
        </div>
        <Barcode width={px(128)} height={px(70)} />
      </div>
      {/* Perforation */}
      <div
        style={{
          position: "absolute",
          left: mainW - px(5),
          top: notch,
          width: px(10),
          height: h - notch * 2,
          background: `radial-gradient(circle, rgba(11,22,51,0.8) ${px(3.5)}px, rgba(0,0,0,0) ${px(4.5)}px) 0 0 / ${px(10)}px ${px(17)}px repeat-y`,
        }}
      />
      {/* Glint sweep */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(105deg, rgba(255,255,255,0) ${glint * 100 - 14}%, rgba(255,255,255,0.55) ${glint * 100}%, rgba(255,255,255,0) ${glint * 100 + 14}%)`,
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* The stub with the rubber stamp (slot 2)                             */
/* ------------------------------------------------------------------ */

const STUB_W = 860;
const STUB_H = 380;

const Stamp: React.FC<{ readonly word: string }> = ({ word }) => {
  const { px } = useLayout();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const text = word.toUpperCase();
  const size = fitSize(text, F.varsity, px(600), px(200));
  const ink = inkOf(text, F.varsity, size);
  const inkW = ink.left + ink.right;
  const small = px(28);
  const w = Math.max(inkW + px(90), px(360));
  const h = ink.ascent + ink.descent + px(150);
  const tx = w / 2 - (ink.right - ink.left) / 2;
  const ty = px(68) + ink.ascent + px(10);
  const smallStyle: React.CSSProperties = {
    fontFamily: F.varsity.family,
    fontSize: small,
    letterSpacing: "0.2em",
  };
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <filter id={`${id}-ink`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency={0.045}
            numOctaves={2}
            seed={4}
            result="warp"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="warp"
            scale={px(6)}
            xChannelSelector="R"
            yChannelSelector="G"
            result="rough"
          />
          <feTurbulence
            type="fractalNoise"
            baseFrequency={0.55}
            numOctaves={2}
            seed={11}
            result="grain"
          />
          <feColorMatrix
            in="grain"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4.2 0 0 0 2.9"
            result="holes"
          />
          <feComposite in="rough" in2="holes" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`} opacity={0.93}>
        <rect
          x={px(6)}
          y={px(6)}
          width={w - px(12)}
          height={h - px(12)}
          rx={px(22)}
          fill="none"
          stroke={stadium.signal}
          strokeWidth={px(9)}
        />
        <rect
          x={px(20)}
          y={px(20)}
          width={w - px(40)}
          height={h - px(40)}
          rx={px(12)}
          fill="none"
          stroke={stadium.signal}
          strokeWidth={px(3)}
        />
        <text
          x={w / 2}
          y={px(58)}
          textAnchor="middle"
          fill={stadium.signal}
          style={smallStyle}
        >
          ★ ADMITTED ★
        </text>
        <text
          x={tx}
          y={ty}
          fill={stadium.signal}
          style={{ fontFamily: F.varsity.family, fontSize: size }}
        >
          {text}
        </text>
        <text
          x={w / 2}
          y={h - px(36)}
          textAnchor="middle"
          fill={stadium.signal}
          style={smallStyle}
        >
          GAME DAY
        </text>
      </g>
    </svg>
  );
};

const StubCard: React.FC<{
  readonly word: string;
  readonly stamped: boolean;
  readonly stampScale: number;
  readonly stampRot: number;
  readonly ring: number;
}> = ({ word, stamped, stampScale, stampRot, ring }) => {
  const { px } = useLayout();
  const torn = useMemo(() => {
    const n = 16;
    const pts: string[] = [];
    for (let i = 0; i <= n; i++) {
      const y = (i / n) * 100;
      const x = (i % 2 === 0 ? 0 : 2.2) + random(`torn-${i}`) * 1.6;
      pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
    }
    return `polygon(${pts.join(", ")}, 100% 100%, 100% 0%)`;
  }, []);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        clipPath: torn,
        background: [
          `repeating-linear-gradient(0deg, rgba(11,22,51,0.05) 0 ${px(2)}px, rgba(0,0,0,0) ${px(2)}px ${px(40)}px)`,
          stadium.flood,
        ].join(", "),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: px(26),
          background: stadium.volt,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: px(44),
          top: px(24),
          fontFamily: fonts.mono,
          fontWeight: 500,
          fontSize: px(24),
          letterSpacing: "0.06em",
          color: stadium.navy,
          opacity: 0.8,
        }}
      >
        SEC 122 · ROW 95
      </div>
      <div
        style={{
          position: "absolute",
          right: px(30),
          top: px(24),
          fontFamily: fonts.mono,
          fontWeight: 500,
          fontSize: px(24),
          color: stadium.navy,
          opacity: 0.8,
        }}
      >
        No. 004417
      </div>
      <div
        style={{
          position: "absolute",
          right: px(18),
          top: px(70),
          bottom: px(40),
          width: px(10),
          background: `radial-gradient(circle, rgba(11,22,51,0.6) ${px(3)}px, rgba(0,0,0,0) ${px(4)}px) 0 0 / ${px(10)}px ${px(16)}px repeat-y`,
        }}
      />
      {stamped ? (
        <>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "54%",
              width: 0,
              height: 0,
            }}
          >
            {/* Ink flecks thrown off by the stamp impact */}
            {new Array(14).fill(0).map((_, i) => {
              const a = random(`fleck-a-${i}`) * Math.PI * 2;
              const rr = px(250 + random(`fleck-r-${i}`) * 140) * (0.8 + 0.2 * ring);
              const size = px(4 + random(`fleck-s-${i}`) * 10);
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: Math.cos(a) * rr * 1.25 - size / 2,
                    top: Math.sin(a) * rr * 0.42 - size / 2,
                    width: size,
                    height: size * (0.7 + random(`fleck-h-${i}`) * 0.6),
                    borderRadius: "50%",
                    background: stadium.signal,
                    opacity: 0.75,
                  }}
                />
              );
            })}
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "54%",
              translate: "-50% -50%",
              scale: String(stampScale),
              rotate: `${stampRot}deg`,
            }}
          >
            <Stamp word={word} />
          </div>
        </>
      ) : null}
    </div>
  );
};

/** Soft contact shadow a little behind a card (inside its Node3D). */
const CardShadow: React.FC<{ readonly w: number; readonly h: number }> = ({
  w,
  h,
}) => {
  const { px } = useLayout();
  return (
    <div
      style={{
        position: "absolute",
        left: -w / 2 + px(26),
        top: -h / 2 + px(34),
        width: w,
        height: h,
        background: "rgba(2,5,14,0.5)",
        filter: `blur(${px(20)}px)`,
        transform: `translateZ(${-px(50)}px)`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type TicketSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const SCRAP_COLORS = [
  stadium.volt,
  stadium.flood,
  stadium.signal,
  stadium.navyLight,
  stadium.flood,
  stadium.volt,
];

const TicketSceneInner: React.FC<TicketSceneProps> = ({ words, style }) => {
  const { frame, fps, t, reel, pulse } = useSceneClock("tickets");
  const { px, unit } = useLayout();
  const ready = useFontsReady(FONT_LIST);

  const slots = splitSlots(words);
  const word1 = slots[0] ?? "";
  const word2 = slots[1] ?? "";
  const word3 = slots[2] ?? "";

  const c0 = CUES[0];
  const c1 = CUES[1];
  const has1 = word1.length > 0;
  const has2 = word2.length > 0;

  /* ---- syllable rows (layout) ---- */
  const rows: Row[] = useMemo(() => {
    if (!ready || word3.length === 0) return [];
    let syl = word3
      .split("-")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (syl.length > SYLLABLE_CUES.length) {
      syl = [
        ...syl.slice(0, SYLLABLE_CUES.length - 1),
        syl.slice(SYLLABLE_CUES.length - 1).join(""),
      ];
    }
    const u = (v: number) => v * unit;
    // Rows fill the band between the parked stub and the bottom of the
    // safe area (world y -378…540 ≈ screen y 590…1500).
    const gapY = u(-14);
    const regionTop = u(-378);
    const regionH = u(918);
    const maxW = u(820);
    // A long syllable wraps onto extra rows that land on the same cue, so
    // its letters never shrink to confetti. At most 6 rows in total.
    const lettersOf = (sy: string) =>
      Array.from(sy).filter((ch) => ch.trim().length > 0);
    let perRow = Math.max(3, Math.floor(maxW / (0.78 * u(240) * 0.7)));
    let visual: { syl: number; chars: string[] }[] = [];
    for (;;) {
      visual = [];
      syl.forEach((sy, si) => {
        const chars = lettersOf(sy);
        const n = Math.max(1, Math.ceil(chars.length / perRow));
        const per = Math.ceil(chars.length / n);
        for (let j = 0; j < n; j++) {
          visual.push({ syl: si, chars: chars.slice(j * per, (j + 1) * per) });
        }
      });
      if (visual.length <= 6) break;
      perRow++;
    }
    const R = visual.length;
    const H = Math.min(u(250), (regionH - gapY * (R - 1)) / Math.max(1, R));
    const blockH = R * H + (R - 1) * gapY;
    const blockTop = regionTop + (regionH - blockH) / 2;
    const capRatio = new Map<PieceStyle, number>();
    PIECES.forEach((s) => {
      capRatio.set(s, Math.max(1, inkOf("H", s.font, 100).ascent) / 100);
    });
    let g = 0;
    return visual.map(({ syl: si, chars }, r) => {
      const raw = chars.map((ch0) => {
        const style = PIECES[g % PIECES.length];
        g++;
        const ch = style.upper ? ch0.toUpperCase() : ch0;
        const size = (H * style.cap) / (capRatio.get(style) ?? 0.7);
        const ink = inkOf(ch, style.font, size);
        const inkW = Math.max(ink.left + ink.right, size * 0.25);
        const pad = H * 0.15;
        let lead = 0;
        let tail = 0;
        if (style.kind === "pennant") {
          lead = H * 0.17;
          tail = H * 0.2;
        } else if (style.kind === "tape") {
          lead = H * 0.05;
          tail = H * 0.05;
        }
        const w = Math.max(inkW + pad * 2 + lead + tail, H * 0.66);
        return { ch, style, size, ink, w, lead, tail };
      });
      const gaps = raw.map((_, i) =>
        i === 0 ? 0 : (random(`gap-${r}-${i}`) - 0.6) * u(22),
      );
      const total = raw.reduce((a, b, i) => a + b.w + gaps[i], 0);
      const s = Math.min(1, maxW / total);
      const slack = maxW - total * s;
      const k = [0.3, 0.66, 0.4, 0.58][r % 4];
      const tilt = [-2.5, 2, -1.5, 2.5][r % 4];
      const left = u(CX) - maxW / 2 + slack * k;
      const y = blockTop + H / 2 + r * (H + gapY);
      let cursor = left;
      const rowCx = left + (total * s) / 2;
      const pieces = raw.map((p, i) => {
        cursor += gaps[i] * s;
        const w = p.w * s;
        const h = H * s * (0.94 + random(`hs-${r}-${i}`) * 0.12);
        const x = cursor + w / 2;
        cursor += w;
        return {
          ch: p.ch,
          style: p.style,
          size: p.size * s * (h / (H * s)),
          ink: inkOf(p.ch, p.style.font, p.size * s * (h / (H * s))),
          w,
          h,
          cx0: (p.lead / p.w) * w + w * 0.0,
          cx1: w - (p.tail / p.w) * w,
          x,
          y:
            y +
            (random(`dy-${r}-${i}`) - 0.5) * u(24) +
            (x - rowCx) * Math.sin((tilt * Math.PI) / 180),
          rot: tilt + (random(`rot-${r}-${i}`) - 0.5) * 14,
          seed: `p-${r}-${i}`,
        } satisfies Piece;
      });
      return { pieces, y, syl: si };
    });
  }, [ready, word3, unit]);
  const sylCount = rows.length > 0 ? rows[rows.length - 1].syl + 1 : 0;

  /* ---- camera ---- */
  const prog = t / LEN;
  const whipIn = interpolate(t, [0, 0.14], [1, 0], {
    ...CLAMP,
    easing: EASE.out,
  });
  // Whip-out reaches full strength on the scene's last frame.
  const out = interpolate(t, [LEN - 0.17, LEN - 1 / fps], [0, 1], {
    ...CLAMP,
    easing: EASE.in,
  });
  const hitCues = [
    ...(has1 ? [c0] : []),
    ...(has2 ? [c1] : []),
    ...SYLLABLE_CUES.slice(0, sylCount),
  ];
  let push = 0;
  let rollKick = 0;
  hitCues.forEach((c, i) => {
    const s = t - c;
    if (s >= -EPS) {
      const d = Math.exp(-Math.max(0, s) / 0.075);
      push = Math.max(push, d);
      rollKick += d * (i % 2 === 0 ? -1.8 : 1.8);
    }
  });
  const camera = shake(
    orbitCamera({
      target: vec3(0, px(10), 0),
      distance: px(
        interpolate(prog, [0, 1], [1065, 1005]) * (1 - 0.075 * push),
      ),
      azimuth: interpolate(prog, [0, 1], [-8, 6]) - 24 * whipIn + 34 * out,
      elevation: interpolate(prog, [0, 1], [11, 5]),
      roll: interpolate(prog, [0, 1], [-5, 3]) + rollKick + 6 * out,
      focal: px(1000),
    }),
    reel,
    { amount: 0.7, speed: 2.6, seed: "tickets" },
  );

  /* ---- slot 1: game ticket ---- */
  const since0 = t - c0;
  const showTicket = has1 && since0 >= -EPS && (!has2 || t < c1 + 0.12);
  const flip = spring({
    frame: frame - c0 * fps + EPS * fps,
    fps,
    config: SPRING.snappy,
  });
  const knock = has2
    ? interpolate(t, [c1 - 0.1, c1 + 0.08], [0, 1], {
        ...CLAMP,
        easing: EASE.out,
      })
    : 0;
  const ticketIdle = noise1("ticket-idle", t * 1.5);
  const glint = interpolate(t, [c0 + 0.06, c0 + 0.5], [-0.2, 1.25], CLAMP);

  /* ---- slot 2: stub + stamp ---- */
  const stubIn = interpolate(t, [c1 - 0.15, c1 - 0.03], [0, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const showStub = has2 && t >= c1 - 0.15;
  const since1 = t - c1;
  const stamped = since1 >= -EPS;
  const stampScale = interpolate(since1, [0, 0.1], [1.3, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const stampRot = interpolate(since1, [0, 0.12], [-13, -7], {
    ...CLAMP,
    easing: EASE.out,
  });
  const dip = stamped ? Math.exp(-Math.max(0, since1) / 0.06) : 0;
  const ring = interpolate(since1, [0, 0.22], [0, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const toCorner =
    rows.length > 0
      ? interpolate(
          t,
          [SYLLABLE_CUES[0] - 0.12, SYLLABLE_CUES[0] + 0.04],
          [0, 1],
          { ...CLAMP, easing: EASE.inOut },
        )
      : 0;

  /* ---- flashes ---- */
  const flash0 = has1
    ? interpolate(since0, [0, 0.1], [0.18, 0], CLAMP) * (since0 >= -EPS ? 1 : 0)
    : 0;
  const flash1 = has2
    ? interpolate(since1, [0, 0.08], [0.1, 0], CLAMP) * (stamped ? 1 : 0)
    : 0;
  const blur = 40 * whipIn + 42 * out;

  /* ---- decorative scraps ---- */
  const scraps = new Array(20).fill(0).map((_, i) => {
    const w = px(36 + random(`scw-${i}`) * 70);
    return {
      i,
      x: (random(`scx-${i}`) - 0.5) * px(2000),
      y: (random(`scy-${i}`) - 0.55) * px(2600) + t * px(150 + 90 * random(`scv-${i}`)),
      z: px(-1900 + random(`scz-${i}`) * 1600),
      w,
      h: w * (0.4 + random(`sch-${i}`) * 0.5),
      color: SCRAP_COLORS[i % SCRAP_COLORS.length],
      rx: (random(`srx-${i}`) * 360 + t * 200 * (random(`srs-${i}`) - 0.5)) % 360,
      ry: (random(`sry-${i}`) * 360 + t * 160) % 360,
      rz: random(`srz-${i}`) * 360,
    };
  });

  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <WhipBlur x={blur} y={blur * 0.12}>
        <StadiumSky
          camera={camera}
          seconds={reel}
          lights={0.8}
          pulse={pulse}
          horizon={0.46}
        />
        <Stage3D camera={camera}>
          <FieldFloor variant="grid" y={px(880)} ry={14} />
          {/* Volt light pool behind the collage */}
          <Plane3D
            z={px(-1400)}
            y={px(-80)}
            width={px(3800)}
            height={px(3800)}
            background={`radial-gradient(closest-side, rgba(215,255,46,${0.07 + 0.06 * pulse}) 0%, rgba(43,74,156,0.26) 38%, rgba(5,10,24,0) 100%)`}
          />
          {scraps.map((s) => (
            <Node3D key={s.i} x={s.x} y={s.y} z={s.z} rx={s.rx} ry={s.ry} rz={s.rz}>
              <div
                style={{
                  width: s.w,
                  height: s.h,
                  background: s.color,
                  opacity: 0.85,
                  borderLeft:
                    s.i % 3 === 0
                      ? `${px(4)}px dotted ${stadium.navy}`
                      : undefined,
                }}
              />
            </Node3D>
          ))}
        </Stage3D>
        {/* Foreground stage: same camera, always layered over the backdrop */}
        <Stage3D camera={camera}>
          {showTicket ? (
            <Node3D
              x={px(CX) + px(-1150) * knock}
              y={px(-40) + px(-420) * knock}
              z={interpolate(flip, [0, 1], [px(-320), 0]) + px(160) * knock}
              rx={interpolate(flip, [0, 1], [28, 5]) + ticketIdle * 2}
              ry={interpolate(flip, [0, 1], [-72, -9]) + ticketIdle * 3 + 55 * knock}
              rz={interpolate(flip, [0, 1], [14, -3]) - 40 * knock}
            >
              <CardShadow w={px(TICKET_W)} h={px(TICKET_H)} />
              <Box3D
                width={px(TICKET_W)}
                height={px(TICKET_H)}
                depth={px(12)}
                colors={{
                  front: "transparent",
                  side: stadium.voltDeep,
                  top: stadium.volt,
                  back: stadium.navy,
                }}
                faces={{
                  front: <GameTicket word={word1} glint={glint} />,
                  back: (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: `repeating-linear-gradient(135deg, ${stadium.navy} 0 ${px(18)}px, ${stadium.navyMid} ${px(18)}px ${px(36)}px)`,
                      }}
                    />
                  ),
                }}
              />
            </Node3D>
          ) : null}

          {showStub ? (
            <Node3D
              x={
                (px(CX) + px(1150) * (1 - stubIn)) * (1 - toCorner) +
                px(CX - 190) * toCorner
              }
              y={
                (px(40) + px(280) * (1 - stubIn)) * (1 - toCorner) +
                px(-466) * toCorner
              }
              z={px(-45) * dip + px(30)}
              rx={4 * (1 - toCorner)}
              ry={-30 * (1 - stubIn) - 5 * (1 - toCorner)}
              rz={30 * (1 - stubIn) - 4 - 3 * toCorner}
              scale={(1 - 0.03 * dip) * (1 - 0.56 * toCorner)}
            >
              <CardShadow w={px(STUB_W)} h={px(STUB_H)} />
              <Box3D
                width={px(STUB_W)}
                height={px(STUB_H)}
                depth={px(8)}
                colors={{
                  front: "transparent",
                  side: stadium.steel,
                  top: stadium.flood,
                  back: stadium.navy,
                }}
                faces={{
                  front: (
                    <StubCard
                      word={word2}
                      stamped={stamped}
                      stampScale={stampScale}
                      stampRot={stampRot}
                      ring={ring}
                    />
                  ),
                }}
              />
            </Node3D>
          ) : null}

          {rows.map((row, r) => {
            const cue = SYLLABLE_CUES[row.syl];
            if (t < cue - EPS) return null;
            return row.pieces.map((p, i) => {
              const start = cue + i * 0.012;
              const local = Math.max(0, t - start);
              const k = spring({
                frame: local * fps,
                fps,
                config: SPRING.snappy,
                durationInFrames: Math.round(0.3 * fps),
              });
              const lift = 1 - k;
              const dir = random(`dir-${p.seed}`) > 0.5 ? 1 : -1;
              return (
                <Node3D
                  key={p.seed}
                  x={p.x + lift * dir * px(40)}
                  y={p.y - lift * px(30)}
                  z={lift * px(140) + r * 2 + i * 1.5}
                  rx={-lift * 28}
                  ry={lift * dir * 18}
                  rz={p.rot + lift * dir * 24}
                  scale={1 + lift * 0.2}
                >
                  <div
                    style={{
                      filter: `drop-shadow(${px(8 + lift * 26)}px ${px(10 + lift * 30)}px 0px rgba(2,5,14,${0.6 - lift * 0.25}))`,
                    }}
                  >
                    <PieceShape p={p} glow={pulse} />
                  </div>
                </Node3D>
              );
            });
          })}
        </Stage3D>
      </WhipBlur>
      <Flash opacity={flash0} color={stadium.flood} />
      <Flash opacity={flash1} color={stadium.signal} />
      <Flash opacity={0.92 * out * out} color={stadium.volt} />
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const ticketSceneSchema = {
  words: {
    type: "text-content",
    default: "",
    description: "Lyric slots, separated by /",
  },
} as const satisfies InteractivitySchema;

export const TicketScene = Interactive.withSchema({
  Component: TicketSceneInner,
  componentName: "<TicketScene>",
  schema: ticketSceneSchema,
  wrapInSequence: true,
});
