import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isUsablePreviewRect,
  panePreviewBoxRelativeToLeaf,
} from "@/app-shell/center-pane/center-pane-drag-preview";

const grid = readFileSync(
  join(import.meta.dir, "../center-pane/CenterPaneGrid.tsx"),
  "utf8",
);
const preview = readFileSync(
  join(import.meta.dir, "../center-pane/center-pane-drag-preview.ts"),
  "utf8",
);
const css = readFileSync(
  join(import.meta.dir, "../center-pane/center-pane-grid.css"),
  "utf8",
);

describe("center pane drag preview", () => {
  it("places overlay content relative to the mosaic leaf", () => {
    expect(
      panePreviewBoxRelativeToLeaf(
        { left: 100, top: 40 },
        { left: 100, top: 80, width: 420, height: 260 },
      ),
    ).toEqual({ left: 0, top: 40, width: 420, height: 260 });
    expect(isUsablePreviewRect({ width: 8, height: 8 })).toBe(true);
    expect(isUsablePreviewRect({ width: 7, height: 40 })).toBe(false);
  });

  it("clones the leaf plus active overlay panels, including canvas pixels", () => {
    expect(preview).toContain("data-center-pane-owner");
    expect(preview).toContain('data-tier="active"');
    expect(preview).toContain("cloneNode(true)");
    expect(preview).toContain("drawImage");
    expect(preview).toContain("data-center-pane-live-preview");
    expect(grid).toContain("buildCenterPaneLivePreview");
    expect(grid).toContain("liveNode");
    expect(grid).not.toContain("capturePaneSnapshot");
    expect(css).toContain("center-pane-drag-ghost-live");
  });
});
