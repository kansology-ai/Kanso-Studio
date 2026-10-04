import { useVideoConfig } from "remotion";

/**
 * Resolution-independent sizing. Design at 1920×1080 and wrap sizes in `px()`:
 * values scale with the short side of the frame, so the same scene works in
 * 1080p, 4K, portrait and square.
 */
export const useLayout = () => {
  const { width, height } = useVideoConfig();
  const unit = Math.min(width, height) / 1080;
  const isPortrait = height > width;

  return {
    width,
    height,
    unit,
    isPortrait,
    px: (value: number) => value * unit,
    /** Horizontal / vertical safe margins for key content. */
    safeX: (isPortrait ? 80 : 160) * unit,
    safeY: (isPortrait ? 160 : 100) * unit,
  };
};
