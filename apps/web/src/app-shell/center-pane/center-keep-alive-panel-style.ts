import type { CSSProperties } from "react";

import { paneHiddenByCenterFullscreen } from "@/app-shell/center-stage-fullscreen";
import {
  isUsablePaneSlotBox,
  type PaneSlotBox,
} from "@/app-shell/center-pane/use-center-pane-slot-boxes";
import { CENTER_STAGE_RADIUS_CSS } from "@/app-shell/sidebar-layout-constants";

const COLLAPSED_SLOT_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  right: "auto",
  bottom: "auto",
  left: 0,
  width: 0,
  height: 0,
  overflow: "hidden",
  pointerEvents: "none",
  opacity: 0,
};

/**
 * Slot geometry for a keep-alive center panel.
 *
 * Inactive panels keep the same box as the active one. Dropping the inline
 * box falls through to `absolute inset-0` on the full card (tab bar included),
 * which resizes the chat scrollport on every tab hop and springs the scrollbar.
 */
export function centerKeepAlivePanelStyle(
  visible: boolean,
  paneId: string | undefined,
  paneSlotBoxes: Readonly<Record<string, PaneSlotBox>> | null | undefined,
  fullscreenPaneId?: string | null,
): CSSProperties | undefined {
  if (!paneId || !paneSlotBoxes) return undefined;
  if (paneHiddenByCenterFullscreen(fullscreenPaneId, paneId)) {
    return COLLAPSED_SLOT_STYLE;
  }
  const box = paneSlotBoxes[paneId];
  // Missing box: do not fall back to inset-0 (covers sibling panes).
  if (!isUsablePaneSlotBox(box)) return COLLAPSED_SLOT_STYLE;
  return {
    position: "absolute",
    top: box.top,
    right: "auto",
    bottom: "auto",
    left: box.left,
    width: box.width,
    height: box.height,
    zIndex: visible ? 1 : 0,
    pointerEvents: visible ? undefined : "none",
    opacity: visible ? undefined : 0,
    borderBottomLeftRadius: CENTER_STAGE_RADIUS_CSS,
    borderBottomRightRadius: CENTER_STAGE_RADIUS_CSS,
  };
}
