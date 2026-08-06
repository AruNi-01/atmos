import { describe, expect, it } from "vitest";
import {
  createDefaultManagementCenterItems,
  selectManagementCenterItemsByPlacement,
  type ManagementCenterItems,
} from "./experiment-settings-store";

describe("management center item placement helpers", () => {
  it("defaults always-on items to enabled inside, experiments off", () => {
    const items = createDefaultManagementCenterItems();
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside" });
    expect(items.skills).toEqual({ enabled: true, placement: "inside" });
    expect(items["disk-analyzer"]).toEqual({ enabled: true, placement: "inside" });
    expect(items.canvas).toEqual({ enabled: true, placement: "inside" });
    expect(items.kanban).toEqual({ enabled: true, placement: "inside" });
    expect(items["new-workspace"]).toEqual({ enabled: true, placement: "inside" });
    expect(items.terminals).toEqual({ enabled: false, placement: "inside" });
    expect(items.agents).toEqual({ enabled: false, placement: "inside" });
    expect(items.automations).toEqual({ enabled: false, placement: "inside" });
  });

  it("selects only enabled items for a placement", () => {
    const items: ManagementCenterItems = {
      ...createDefaultManagementCenterItems(),
      workspaces: { enabled: true, placement: "outside" },
      skills: { enabled: false, placement: "inside" },
      canvas: { enabled: true, placement: "outside" },
      terminals: { enabled: true, placement: "inside" },
    };

    expect(selectManagementCenterItemsByPlacement(items, "outside")).toEqual([
      "workspaces",
      "canvas",
    ]);
    expect(selectManagementCenterItemsByPlacement(items, "inside")).toEqual([
      "terminals",
      "disk-analyzer",
      "kanban",
      "new-workspace",
    ]);
  });
});
