import { CENTER_STAGE_FULLSCREEN_Z_INDEX } from "@/app-shell/center-stage-fullscreen";

/** Gap between adjacent mosaic cards. Outer edges sit on the stage gutter. */
export const CENTER_PANE_LEAF_GAP_PX = 4;
const EDGE_EPS = 0.001;

export type CenterPaneLeafBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CenterPaneLeafInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Inset only shared/internal edges so header/footer spacing matches one pane. */
export function centerPaneLeafEdgeInsets(
  leaf: CenterPaneLeafBox,
): CenterPaneLeafInsets {
  return {
    left: leaf.left <= EDGE_EPS ? 0 : CENTER_PANE_LEAF_GAP_PX,
    top: leaf.top <= EDGE_EPS ? 0 : CENTER_PANE_LEAF_GAP_PX,
    right: leaf.left + leaf.width >= 1 - EDGE_EPS ? 0 : CENTER_PANE_LEAF_GAP_PX,
    bottom: leaf.top + leaf.height >= 1 - EDGE_EPS ? 0 : CENTER_PANE_LEAF_GAP_PX,
  };
}

export function centerPaneLeafTileStyle(
  leaf: CenterPaneLeafBox,
): {
  left: string;
  top: string;
  width: string;
  height: string;
} {
  const inset = centerPaneLeafEdgeInsets(leaf);
  const pct = (value: number) => `${String(value * 100)}%`;
  return {
    left: `calc(${pct(leaf.left)} + ${inset.left}px)`,
    top: `calc(${pct(leaf.top)} + ${inset.top}px)`,
    width: `calc(${pct(leaf.width)} - ${inset.left + inset.right}px)`,
    height: `calc(${pct(leaf.height)} - ${inset.top + inset.bottom}px)`,
  };
}

/** Fill the mosaic so this pane covers sibling center regions, not the footer. */
export function centerPaneFullscreenTileStyle(): {
  left: string;
  top: string;
  width: string;
  height: string;
  zIndex: string;
} {
  return {
    left: "calc(0% + 0px)",
    top: "calc(0% + 0px)",
    width: "calc(100% - 0px)",
    height: "calc(100% - 0px)",
    zIndex: String(CENTER_STAGE_FULLSCREEN_Z_INDEX),
  };
}
