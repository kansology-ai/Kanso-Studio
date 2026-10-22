import type React from "react";
import { AbsoluteFill, Interactive, type InteractivitySchema } from "remotion";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { StadiumSky } from "../kit/StadiumSky";
import { BroadcastFinish } from "../kit/fx";
import { splitSlots } from "../timing";

/** PLACEHOLDER: replaced by the scene build. */

type BallsSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const BallsSceneInner: React.FC<BallsSceneProps> = ({ words, style }) => {
  const { reel } = useSceneClock("balls");
  const { px } = useLayout();
  return (
    <AbsoluteFill style={{ background: stadium.night, ...style }}>
      <StadiumSky
        camera={{
          x: 0,
          y: 0,
          z: 0,
          yaw: reel * 4,
          pitch: -6,
          roll: 0,
          focal: px(1000),
        }}
        seconds={reel}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          fontFamily: fonts.varsity,
          fontSize: px(90),
          color: stadium.flood,
          textAlign: "center",
        }}
      >
        {splitSlots(words).join(" · ")}
      </AbsoluteFill>
      <BroadcastFinish />
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
