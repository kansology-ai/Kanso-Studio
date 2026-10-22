import type React from "react";
import { createContext, useContext } from "react";
import { AbsoluteFill } from "remotion";
import {
  cameraTransform,
  project,
  type Camera,
  type Projected,
  type Vec3,
} from "../lib/camera3d";

/**
 * CSS 3D stage. Everything inside is placed in world space (px, +y down,
 * +z toward the viewer) and seen through `camera`. Use <Node3D> to place
 * things; nest <Node3D> for groups. JS-projected overlays (balls, particles)
 * can use useStage().project() to land on the same pixels.
 *
 * The 3D context is flattened at this element, so filters/blur belong on a
 * wrapper around <Stage3D>, never on nodes inside it.
 */

type StageContextValue = {
  camera: Camera;
  /** Project a world point to screen coordinates relative to the frame centre. */
  project: (p: Vec3) => Projected;
};

const StageContext = createContext<StageContextValue | null>(null);

export const useStage = (): StageContextValue => {
  const ctx = useContext(StageContext);
  if (!ctx) {
    throw new Error("useStage() must be used inside <Stage3D>");
  }
  return ctx;
};

export const Stage3D: React.FC<{
  readonly camera: Camera;
  readonly children?: React.ReactNode;
  readonly style?: React.CSSProperties;
  /** 2D overlays drawn on top of the 3D world, sharing its camera context. */
  readonly overlay?: React.ReactNode;
}> = ({ camera, children, style, overlay }) => {
  return (
    <StageContext.Provider
      value={{ camera, project: (p) => project(p, camera) }}
    >
      <AbsoluteFill
        style={{
          perspective: `${camera.focal}px`,
          perspectiveOrigin: "50% 50%",
          overflow: "hidden",
          ...style,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 0,
            height: 0,
            transformStyle: "preserve-3d",
            transformOrigin: "0 0",
            transform: cameraTransform(camera),
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
      {overlay}
    </StageContext.Provider>
  );
};

export type Node3DProps = {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  /** Rotations in degrees, applied Y, then X, then Z (like a camera). */
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly scale?: number;
  /**
   * Content is centred on the node's origin by default. Set false to anchor
   * the content's top-left corner at the origin instead.
   */
  readonly center?: boolean;
  readonly opacity?: number;
  readonly children?: React.ReactNode;
  readonly style?: React.CSSProperties;
};

/**
 * A positioned group in world space. Children are centred on (x, y, z).
 * Width/height of the content come from the children themselves.
 */
export const Node3D: React.FC<Node3DProps> = ({
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  scale = 1,
  center = true,
  opacity,
  children,
  style,
}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        transformStyle: "preserve-3d",
        transform: `translate3d(${x}px, ${y}px, ${z}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg) scale3d(${scale}, ${scale}, ${scale})`,
        opacity,
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          transformStyle: "preserve-3d",
          transform: center ? "translate(-50%, -50%)" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** A node that always faces the camera (sprites, labels, glows). */
export const Billboard: React.FC<Omit<Node3DProps, "rx" | "ry" | "rz">> = (
  props,
) => {
  const { camera } = useStage();
  return (
    <Node3D {...props} rx={camera.pitch} ry={camera.yaw} rz={camera.roll} />
  );
};

/**
 * A flat rectangle in 3D, e.g. a floor (rx = 90) or a wall. Size in px.
 * Put patterns on it with `background` (repeating gradients work well).
 */
export const Plane3D: React.FC<
  Node3DProps & {
    readonly width: number;
    readonly height: number;
    readonly background?: string;
  }
> = ({ width, height, background, children, style, ...node }) => {
  return (
    <Node3D {...node}>
      <div
        style={{
          width,
          height,
          background,
          position: "relative",
          transformStyle: "preserve-3d",
          ...style,
        }}
      >
        {children}
      </div>
    </Node3D>
  );
};
