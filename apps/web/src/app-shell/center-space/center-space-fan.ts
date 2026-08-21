export type CenterSpaceFanPose = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
  opacity: number;
};

export const CENTER_SPACE_FAN_MS = 280;
export const CENTER_SPACE_FAN_EXIT_MS = 200;

/**
 * Aceternity Images Badge–style fan: cards rest stacked, then spread into a
 * shallow arc. Hover lift lives in CSS so it does not re-render the stage.
 */
export function centerSpaceFanPose(
  index: number,
  count: number,
  open: boolean,
  hoveredIndex: number | null = null,
): CenterSpaceFanPose {
  const mid = (count - 1) / 2;
  const t = index - mid;
  const spread =
    count <= 2 ? 48 : count === 3 ? 54 : Math.min(42, 168 / Math.max(1, count - 1));
  const rotStep = count <= 3 ? 11 : 6.5;

  if (!open) {
    return {
      x: t * 5,
      y: -8,
      rotate: t * 2.4,
      scale: 0.4,
      z: index,
      opacity: 0,
    };
  }

  const isHover = hoveredIndex === index;
  return {
    x: t * spread,
    y: 14 + Math.abs(t) * 10 + (isHover ? -16 : 0),
    rotate: t * rotStep * (isHover ? 0.22 : 1),
    scale: isHover ? 1.08 : hoveredIndex == null ? 1 : 0.96,
    z: isHover ? 80 : 12 + index,
    opacity: 1,
  };
}

export function centerSpaceFanCssVars(
  pose: CenterSpaceFanPose,
): Record<string, string> {
  return {
    "--fan-x": `${pose.x}px`,
    "--fan-y": `${pose.y}px`,
    "--fan-rotate": `${pose.rotate}deg`,
    "--fan-rotate-deg": String(pose.rotate),
    "--fan-scale": String(pose.scale),
    "--fan-opacity": String(pose.opacity),
    "--fan-z": String(pose.z),
  };
}
