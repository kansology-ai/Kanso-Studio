import type React from "react";
import { AbsoluteFill, Interactive, type InteractivitySchema } from "remotion";
import { useLayout } from "../../../lib/layout";
import { fonts, stadium } from "../../../theme";
import { useSceneClock } from "../kit/beat";
import { StadiumSky } from "../kit/StadiumSky";
import { BroadcastFinish } from "../kit/fx";
import { splitSlots } from "../timing";

/** PLACEHOLDER: replaced by the scene build. */

type RibbonSceneProps = {
  readonly lineA: string;
  readonly lineB: string;
  readonly lineC: string;
  readonly lineD: string;
  readonly style?: React.CSSProperties;
};

const RibbonSceneInner: React.FC<RibbonSceneProps> = ({
  lineA,
  lineB,
  lineC,
  lineD,
  style,
}) => {
  const { reel } = useSceneClock("ribbon");
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
        {[lineA, lineB, lineC, lineD]
          .map((l) => splitSlots(l).join(" "))
          .join(" | ")}
      </AbsoluteFill>
      <BroadcastFinish />
    </AbsoluteFill>
  );
};

const ribbonSceneSchema = {
  lineA: {
    type: "text-content",
    default: "",
    description: "Ribbon line 1 (4 slots, separated by /)",
  },
  lineB: {
    type: "text-content",
    default: "",
    description: "Ribbon line 2 (5 slots)",
  },
  lineC: {
    type: "text-content",
    default: "",
    description: "Ribbon line 3 (2 slots)",
  },
  lineD: {
    type: "text-content",
    default: "",
    description: "Ribbon line 4 (4 slots)",
  },
} as const satisfies InteractivitySchema;

export const RibbonScene = Interactive.withSchema({
  Component: RibbonSceneInner,
  componentName: "<RibbonScene>",
  schema: ribbonSceneSchema,
  wrapInSequence: true,
});
