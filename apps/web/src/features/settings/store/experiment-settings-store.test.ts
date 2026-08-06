import { describe, expect, it } from "vitest";
import {
  createDefaultManagementCenterItems,
  readManagementCenterItems,
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

  it("migrates legacy experiment flags when mgmt_center_items is absent", () => {
    const items = readManagementCenterItems({
      mgmt_terminals: true,
      mgmt_agents: true,
      automations: true,
    });
    expect(items.terminals).toEqual({ enabled: true, placement: "inside" });
    expect(items.agents).toEqual({ enabled: true, placement: "inside" });
    expect(items.automations).toEqual({ enabled: true, placement: "inside" });
    // Defaults still apply for always-on entries.
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside" });
  });

  it("lets persisted mgmt_center_items win over conflicting legacy flags", () => {
    const items = readManagementCenterItems({
      mgmt_terminals: true,
      mgmt_agents: true,
      automations: true,
      mgmt_center_items: {
        terminals: { enabled: false, placement: "outside" },
        agents: { enabled: true, placement: "outside" },
        workspaces: { enabled: false, placement: "inside" },
      },
    });
    expect(items.terminals).toEqual({ enabled: false, placement: "outside" });
    expect(items.agents).toEqual({ enabled: true, placement: "outside" });
    // Not listed in the map — falls back to legacy-enabled defaults for automations.
    expect(items.automations).toEqual({ enabled: true, placement: "inside" });
    expect(items.workspaces).toEqual({ enabled: false, placement: "inside" });
  });
});
