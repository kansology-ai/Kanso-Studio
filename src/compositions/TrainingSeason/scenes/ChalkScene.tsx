import type React from "react";
import { AbsoluteFill, Interactive, type InteractivitySchema } from "remotion";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { StadiumSky } from "../kit/StadiumSky";
import { BroadcastFinish } from "../kit/fx";
import { splitSlots } from "../timing";

/** PLACEHOLDER: replaced by the scene build. */

type ChalkSceneProps = {
  readonly words: string;
  readonly style?: React.CSSProperties;
};

const ChalkSceneInner: React.FC<ChalkSceneProps> = ({ words, style }) => {
  const { reel } = useSceneClock("chalk");
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
