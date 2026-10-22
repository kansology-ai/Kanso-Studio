import type React from "react";
import { AbsoluteFill, random } from "remotion";
import type { Camera } from "../../../lib/camera3d";
import { noise1 } from "../../../lib/camera3d";
import { useLayout } from "../../../lib/layout";
import { stadium } from "../../../theme";

/**
 * Night-stadium backdrop: sky gradient, floodlight banks with bloom and
 * rays, haze beams and a band of crowd bokeh. It is a 2D panorama that pans
 * with the camera's yaw/pitch/roll, so it reads as the far distance behind
 * a <Stage3D>. Put it under the stage (earlier in the JSX).
 */

const BANKS = 4;

const FloodBank: React.FC<{
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly on: number;
  readonly flicker: number;
  readonly tilt: number;
}> = ({ x, y, size, on, flicker, tilt }) => {
  const cols = 6;
  const rows = 4;
  const cell = size / cols;
  const lamps = new Array(cols * rows).fill(0).map((_, i) => i);
  const glow = on * (0.85 + 0.15 * flicker);
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - (rows * cell) / 2,
        width: size,
        height: rows * cell,
        rotate: `${tilt}deg`,
      }}
    >
      {/* Bloom */}
      <div
        style={{
          position: "absolute",
          left: -size * 1.6,
          top: -size * 1.6,
          width: size * 4.2,
          height: rows * cell + size * 3.2,
          background: `radial-gradient(closest-side, rgba(246,248,255,${0.55 * glow}) 0%, rgba(160,190,255,${0.18 * glow}) 40%, rgba(80,110,220,0) 100%)`,
          mixBlendMode: "screen",
        }}
      />
      {/* Lamp grid */}
      <div
        style={{
          position: "absolute",
          inset: -cell * 0.2,
          background: stadium.navy,
          borderRadius: cell * 0.2,
          opacity: 0.9,
        }}
      />
      {lamps.map((i) => {
        const c = i % cols;
        const r = Math.floor(i / cols);
        const lampOn = on > random(`lamp-${i}`) * 0.9 ? 1 : 0.15;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: c * cell + cell * 0.12,
              top: r * cell + cell * 0.12,
              width: cell * 0.76,
              height: cell * 0.76,
              borderRadius: "50%",
              background: `radial-gradient(circle, #FFFFFF 0%, ${stadium.flood} 45%, rgba(200,215,255,0.6) 70%, rgba(200,215,255,0) 100%)`,
              opacity: lampOn * (0.75 + 0.25 * glow),
            }}
          />
        );
      })}
      {/* Horizontal anamorphic streak */}
      <div
        style={{
          position: "absolute",
          left: -size * 2.5,
          top: (rows * cell) / 2 - cell * 0.15,
          width: size * 6,
          height: cell * 0.3,
          background: `linear-gradient(90deg, rgba(150,190,255,0) 0%, rgba(190,215,255,${0.5 * glow}) 50%, rgba(150,190,255,0) 100%)`,
          filter: `blur(${cell * 0.15}px)`,
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
};

export const StadiumSky: React.FC<{
  readonly camera: Camera;
  /** Reel seconds, drives flicker and crowd twinkle. */
  readonly seconds: number;
  /** 0 = lights off, 1 = full floodlights. */
  readonly lights?: number;
  /** Beat pulse 0-1; brightens the bloom on the beat. */
  readonly pulse?: number;
  /**
   * Screen-space y of the horizon (fraction of height) at pitch 0. 0.5 is
   * the true horizon of a level camera; lower values fake a raised field.
   */
  readonly horizon?: number;
  readonly crowd?: boolean;
  readonly style?: React.CSSProperties;
}> = ({
  camera,
  seconds,
  lights = 1,
  pulse = 0,
  horizon = 0.5,
  crowd = true,
  style,
}) => {
  const { width, height, px } = useLayout();
  // The panorama is drawn inside a layer scaled by ZOOM (so rolls never
  // show its edges); shifts are divided by it to land on screen 1:1.
  const ZOOM = 1.25;
  const pxPerDeg = (camera.focal * Math.PI) / 180 / ZOOM;
  const pano = width * 2.2;
  const shiftX = (((camera.yaw * pxPerDeg) % pano) + pano) % pano;
  const shiftY =
    -Math.tan((Math.max(-80, Math.min(80, camera.pitch)) * Math.PI) / 180) *
    (camera.focal / ZOOM);
  const horizonY = height * horizon;
  const copies = [-1, 0, 1];
  const bokeh = new Array(70).fill(0).map((_, i) => i);
  const palette = [stadium.flood, stadium.volt, stadium.signal, stadium.steel];
  const flick = noise1("flood", seconds * 9);

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: `linear-gradient(180deg, ${stadium.night} 0%, ${stadium.navy} 55%, ${stadium.navyMid} 100%)`,
        ...style,
      }}
    >
      <AbsoluteFill
        style={{
          rotate: `${-camera.roll}deg`,
          scale: String(ZOOM),
        }}
      >
        {copies.map((k) => (
          <div
            key={k}
            style={{
              position: "absolute",
              left: (width - pano) / 2 + shiftX + k * pano,
              top: shiftY,
              width: pano,
              height,
            }}
          >
            {/* Upper-stand glow along the horizon */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: horizonY - px(520),
                width: pano,
                height: px(760),
                background: `linear-gradient(180deg, rgba(43,74,156,0) 0%, rgba(43,74,156,${0.35 * lights}) 60%, rgba(11,22,51,0) 100%)`,
              }}
            />
            {crowd
              ? bokeh.map((i) => {
                  const bx = random(`bokeh-x-${i}`) * pano;
                  const by =
                    horizonY -
                    px(120) +
                    (random(`bokeh-y-${i}`) - 0.5) * px(220);
                  const size = px(10 + random(`bokeh-s-${i}`) * 34);
                  const color = palette[Math.floor(random(`bokeh-c-${i}`) * 4)];
                  const tw =
                    0.35 +
                    0.65 * (0.5 + 0.5 * noise1(`tw-${i}`, seconds * 2.2));
                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: bx,
                        top: by,
                        width: size,
                        height: size,
                        borderRadius: "50%",
                        background: color,
                        opacity: 0.35 * tw * lights,
                        filter: `blur(${size * 0.25}px)`,
                      }}
                    />
                  );
                })
              : null}
            {new Array(BANKS).fill(0).map((_, b) => (
              <FloodBank
                key={b}
                x={(pano / BANKS) * (b + 0.5)}
                y={horizonY - px(b % 2 === 0 ? 560 : 700)}
                size={px(b % 2 === 0 ? 230 : 170)}
                on={lights}
                flicker={flick + pulse}
                tilt={b % 2 === 0 ? -6 : 5}
              />
            ))}
          </div>
        ))}
      </AbsoluteFill>
      {/* Haze: floodlight beams falling through the air */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(90% 55% at 50% 18%, rgba(190,210,255,${(0.1 + 0.08 * pulse) * lights}) 0%, rgba(190,210,255,0) 70%)`,
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};
