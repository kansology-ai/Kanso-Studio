import type React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { CLAMP, EASE } from "../../../lib/animation";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { beatPulse } from "./beat";
import { TRAINING_SEASON_TIMING, type SceneKey } from "../timing";

const T = TRAINING_SEASON_TIMING;
const ORDER: SceneKey[] = [
  "jersey",
  "vault",
  "ribbon",
  "tickets",
  "chalk",
  "megaphone",
  "scoreboard",
  "balls",
];

const lapAt = (reel: number): number => {
  let lap = 1;
  ORDER.forEach((key, i) => {
    if (reel >= T.scenes[key].from) lap = i + 1;
  });
  return lap;
};

/**
 * Persistent sports-broadcast score bug, top-left inside the Reels safe
 * area. The game clock counts down to the drop, then flips to FINAL.
 */
export const ScoreBug: React.FC<{ readonly reel: number }> = ({ reel }) => {
  const { px, safeX } = useLayout();
  const drop = T.accents.drop;
  const ballsFrom = T.scenes.balls.from;
  const scoreboardFrom = T.scenes.scoreboard.from;
  const isFinal = reel >= ballsFrom;

  const enter = interpolate(reel, [0.25, 0.65], [0, 1], {
    ...CLAMP,
    easing: EASE.out,
  });
  const exit = interpolate(
    reel,
    [scoreboardFrom - 0.2, scoreboardFrom],
    [0, 1],
    {
      ...CLAMP,
      easing: EASE.in,
    },
  );
  const reenter = interpolate(
    reel,
    [ballsFrom + 0.9, ballsFrom + 1.3],
    [0, 1],
    {
      ...CLAMP,
      easing: EASE.out,
    },
  );
  const shown = isFinal ? reenter : enter * (1 - exit);
  if (shown <= 0.001) return null;

  const remaining = Math.max(0, drop - reel);
  const clock = `0:${remaining.toFixed(1).padStart(4, "0")}`;
  const pulse = beatPulse(reel, 7);
  const h = px(66);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: safeX,
          top: px(250),
          display: "flex",
          alignItems: "stretch",
          height: h,
          translate: `${(1 - shown) * -px(620)}px 0`,
          opacity: shown,
          boxShadow: `0 ${px(10)}px ${px(30)}px rgba(0,0,0,0.45)`,
        }}
      >
        <div
          style={{
            background: stadium.volt,
            color: stadium.navy,
            fontFamily: fonts.varsity,
            fontSize: px(38),
            display: "flex",
            alignItems: "center",
            padding: `0 ${px(18)}px`,
            letterSpacing: px(1),
          }}
        >
          TS
        </div>
        <div
          style={{
            background: stadium.navy,
            color: stadium.flood,
            fontFamily: fonts.broadcast,
            fontWeight: 600,
            fontSize: px(34),
            display: "flex",
            alignItems: "center",
            gap: px(14),
            padding: `0 ${px(20)}px`,
            letterSpacing: px(2),
          }}
        >
          <span style={{ color: stadium.steel }}>LAP</span>
          <span>{String(lapAt(reel)).padStart(2, "0")}/08</span>
        </div>
        <div
          style={{
            background: isFinal ? stadium.signal : stadium.flood,
            color: isFinal ? stadium.flood : stadium.navy,
            fontFamily: fonts.broadcast,
            fontStyle: "italic",
            fontWeight: 800,
            fontSize: px(40),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: px(150),
            padding: `0 ${px(18)}px`,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: px(1),
          }}
        >
          {isFinal ? "FINAL" : clock}
        </div>
        <div
          style={{
            background: stadium.navy,
            display: "flex",
            alignItems: "center",
            padding: `0 ${px(16)}px`,
          }}
        >
          <div
            style={{
              width: px(18),
              height: px(18),
              borderRadius: "50%",
              background: stadium.volt,
              opacity: 0.35 + 0.65 * pulse,
              boxShadow: `0 0 ${px(14) * pulse}px ${stadium.volt}`,
            }}
          />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: safeX,
          top: px(250) + h + px(12),
          fontFamily: fonts.mono,
          fontWeight: 500,
          fontSize: px(30),
          letterSpacing: px(3),
          color: stadium.steel,
          opacity: shown,
          translate: `${(1 - shown) * -px(620)}px 0`,
        }}
      >
        122.95 BPM · Q4
      </div>
    </AbsoluteFill>
  );
};

/**
 * Instagram Reels UI overlay for previewing (never render it for posting).
 * Red areas are covered by the app's header, caption and buttons.
 */
export const SafeZones: React.FC = () => {
  const { px } = useLayout();
  const zone: React.CSSProperties = {
    position: "absolute",
    background: "rgba(255, 40, 80, 0.28)",
    border: `${px(2)}px dashed rgba(255, 80, 120, 0.9)`,
    color: "white",
    fontFamily: fonts.mono,
    fontSize: px(28),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ ...zone, left: 0, right: 0, top: 0, height: px(220) }}>
        app header
      </div>
      <div style={{ ...zone, left: 0, right: 0, bottom: 0, height: px(420) }}>
        caption + audio
      </div>
      <div
        style={{
          ...zone,
          right: 0,
          top: px(220),
          bottom: px(420),
          width: px(140),
          writingMode: "vertical-rl",
        }}
      >
        buttons
      </div>
    </AbsoluteFill>
  );
};
