import { describe, expect, it } from "bun:test";
import {
  inferSharedEdgeCollapse,
  planPaneTileMotion,
  seedFullStagePrevious,
} from "@/app-shell/center-pane/center-pane-layout-motion";
import { shouldSnapPaneTilesOnContextChange } from "@/app-shell/center-pane/center-pane-collapse-persist";

const left: { id: string; left: number; top: number; width: number; height: number } = {
  id: "pane-main",
  left: 0,
  top: 0,
  width: 0.5,
  height: 1,
};
const right = { id: "pane-2", left: 0.5, top: 0, width: 0.5, height: 1 };
const full = { id: "pane-main", left: 0, top: 0, width: 1, height: 1 };

describe("center pane layout motion", () => {
  it("collapses a right-hand pane onto the shared vertical edge", () => {
    const collapsed = inferSharedEdgeCollapse(right, left);
    expect(collapsed).toEqual({ ...right, width: 0 });
  });

  it("collapses a bottom pane onto the shared horizontal edge", () => {
    const top = { id: "a", left: 0, top: 0, width: 1, height: 0.5 };
    const bottom = { id: "b", left: 0, top: 0.5, width: 1, height: 0.5 };
    expect(inferSharedEdgeCollapse(bottom, top)).toEqual({ ...bottom, height: 0 });
  });

  it("opens a right split by growing the new pane from zero width", () => {
    const plan = planPaneTileMotion(seedFullStagePrevious([left, right]), [left, right]);
    expect(plan.entering).toHaveLength(1);
    expect(plan.entering[0]?.from).toMatchObject({ id: "pane-2", width: 0, left: 0.5 });
    expect(plan.staying[0]?.from).toEqual(full);
    expect(plan.staying[0]?.to).toEqual(left);
  });

  it("closes a right pane by shrinking it to the shared edge", () => {
    const plan = planPaneTileMotion([left, right], [full]);
    expect(plan.exiting).toHaveLength(1);
    expect(plan.exiting[0]?.to).toMatchObject({ id: "pane-2", width: 0, left: 0.5 });
    expect(plan.staying[0]?.to).toEqual(full);
  });

  it("snaps tiles when hopping workspaces instead of growing from the previous split", () => {
    expect(shouldSnapPaneTilesOnContextChange("ws-a", "ws-b")).toBe(true);
    expect(shouldSnapPaneTilesOnContextChange("ws-a", "ws-a")).toBe(false);
    expect(shouldSnapPaneTilesOnContextChange(null, "ws-b")).toBe(false);
  });
});
