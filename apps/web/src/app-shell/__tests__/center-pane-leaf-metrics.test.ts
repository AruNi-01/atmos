import { describe, expect, it } from "bun:test";
import {
  CENTER_PANE_LEAF_GAP_PX,
  centerPaneFullscreenTileStyle,
  centerPaneLeafEdgeInsets,
  centerPaneLeafTileStyle,
} from "@/app-shell/center-pane/center-pane-leaf-metrics";

describe("center pane leaf insets", () => {
  it("does not add extra gap against header and footer on a full-height split", () => {
    const left = centerPaneLeafEdgeInsets({
      left: 0,
      top: 0,
      width: 0.5,
      height: 1,
    });
    const right = centerPaneLeafEdgeInsets({
      left: 0.5,
      top: 0,
      width: 0.5,
      height: 1,
    });
    expect(left.top).toBe(0);
    expect(left.bottom).toBe(0);
    expect(left.left).toBe(0);
    expect(left.right).toBe(CENTER_PANE_LEAF_GAP_PX);
    expect(right.top).toBe(0);
    expect(right.bottom).toBe(0);
    expect(right.left).toBe(CENTER_PANE_LEAF_GAP_PX);
    expect(right.right).toBe(0);
  });

  it("keeps a gap only on the shared edge of a stacked split", () => {
    const topLeaf = { left: 0, top: 0, width: 1, height: 0.5 };
    const bottomLeaf = { left: 0, top: 0.5, width: 1, height: 0.5 };
    const top = centerPaneLeafEdgeInsets(topLeaf);
    const bottom = centerPaneLeafEdgeInsets(bottomLeaf);
    expect(top.top).toBe(0);
    expect(top.bottom).toBe(CENTER_PANE_LEAF_GAP_PX);
    expect(bottom.top).toBe(CENTER_PANE_LEAF_GAP_PX);
    expect(bottom.bottom).toBe(0);
    expect(centerPaneLeafTileStyle(topLeaf).top).toBe("calc(0% + 0px)");
    expect(centerPaneLeafTileStyle(bottomLeaf).top).toBe("calc(50% + 4px)");
    expect(centerPaneLeafTileStyle(bottomLeaf).height).toBe("calc(50% - 4px)");
  });

  it("fullscreen tile fills the mosaic without the sibling gap insets", () => {
    const style = centerPaneFullscreenTileStyle();
    expect(style.left).toBe("calc(0% + 0px)");
    expect(style.width).toBe("calc(100% - 0px)");
    expect(style.height).toBe("calc(100% - 0px)");
  });
});
