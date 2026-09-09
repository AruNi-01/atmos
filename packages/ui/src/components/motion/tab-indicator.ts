/** Layout box for the sliding tab pill, in the list's unscaled CSS pixels. */
export type TabIndicatorBox = { x: number; y: number; w: number; h: number };

/**
 * Map a viewport-space tab rect onto the list's layout pixels.
 *
 * Morph popovers animate `scale` on an ancestor. `getBoundingClientRect()`
 * includes that transform, but `position: absolute` / `translate` inside the
 * list do not — treating the scaled rect as CSS pixels drifts the pill up
 * (scale < 1) or down (spring overshoot > 1).
 */
export function indicatorLayoutFromViewport(input: {
  tabLeft: number;
  tabTop: number;
  listLeft: number;
  listTop: number;
  listViewportWidth: number;
  listViewportHeight: number;
  listOffsetWidth: number;
  listOffsetHeight: number;
  tabOffsetWidth: number;
  tabOffsetHeight: number;
  scrollLeft: number;
  scrollTop: number;
}): TabIndicatorBox {
  const sx =
    input.listOffsetWidth === 0 ? 1 : input.listViewportWidth / input.listOffsetWidth;
  const sy =
    input.listOffsetHeight === 0 ? 1 : input.listViewportHeight / input.listOffsetHeight;
  return {
    x: (input.tabLeft - input.listLeft) / sx + input.scrollLeft,
    y: (input.tabTop - input.listTop) / sy + input.scrollTop,
    w: input.tabOffsetWidth,
    h: input.tabOffsetHeight,
  };
}
