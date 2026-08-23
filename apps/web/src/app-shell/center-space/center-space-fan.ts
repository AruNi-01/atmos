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
export const CENTER_SPACE_CARD_WIDTH = 136;

/**
 * Aceternity ImagesBadge "Wide Spread" (`hoverSpread={35}`, `hoverRotation={20}`)
 * scaled from the 48px hover thumbnail to our 136px space cards.
 */
export const CENTER_SPACE_FAN_SPREAD = 99;
export const CENTER_SPACE_FAN_ROTATION = 20;
export const CENTER_SPACE_FAN_TRANSLATE_Y = 22;

function fanOuterT(count: number): number {
  return Math.max((count - 1) / 2, 0.5);
}

/** Per-step X for the ImagesBadge wide-spread envelope. */
export function centerSpaceFanSpread(count: number): number {
  if (count <= 3) return CENTER_SPACE_FAN_SPREAD;
  return CENTER_SPACE_FAN_SPREAD / fanOuterT(count);
}

export function centerSpaceFanRotationStep(count: number): number {
  if (count <= 3) return CENTER_SPACE_FAN_ROTATION;
  return CENTER_SPACE_FAN_ROTATION / fanOuterT(count);
}

export function centerSpaceFanStageWidth(count: number): number {
  const extent = fanOuterT(count) * centerSpaceFanSpread(count);
  return Math.ceil(CENTER_SPACE_CARD_WIDTH + extent * 2 + 64);
}

/**
 * ImagesBadge wide-spread: stacked rest → horizontal fan with ±20° rotation.
 * Per-card hover lift lives in CSS so it does not re-render the stage.
 */
export function centerSpaceFanPose(
  index: number,
  count: number,
  open: boolean,
  hoveredIndex: number | null = null,
): CenterSpaceFanPose {
  const mid = (count - 1) / 2;
  const t = index - mid;
  const spread = centerSpaceFanSpread(count);
  const rotStep = centerSpaceFanRotationStep(count);

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
    y: CENTER_SPACE_FAN_TRANSLATE_Y + (isHover ? -16 : 0),
    rotate: t * rotStep,
    scale: isHover ? 1.06 : hoveredIndex == null ? 1 : 0.96,
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
