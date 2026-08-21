export type CenterSpaceFanPose = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
  opacity: number;
};

/**
 * Aceternity Images Badge–style fan: cards rest stacked, then spread into a
 * shallow arc. Hover lifts that card to the front without reshuffling others.
 */
export function centerSpaceFanPose(
  index: number,
  count: number,
  open: boolean,
  hoveredIndex: number | null,
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
