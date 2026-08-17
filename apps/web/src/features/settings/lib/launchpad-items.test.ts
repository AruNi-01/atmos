import { describe, expect, it } from "bun:test";
import {
  applyLaunchpadReorder,
  createDefaultLaunchpadItems,
  LAUNCHPAD_DROP_INSIDE,
  LAUNCHPAD_DROP_OUTSIDE,
  launchpadPreviewPlacement,
  readLaunchpadItems,
  selectLaunchpadItemsByPlacement,
  type LaunchpadItems,
} from "./launchpad-items";

describe("launchpad item placement helpers", () => {
  it("defaults always-on items enabled; skills/automations/token-usage/canvas/tasks/new-workspace outside, rest inside; terminals/agents off", () => {
    const items = createDefaultLaunchpadItems();
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside", order: 0 });
    expect(items.skills).toEqual({ enabled: true, placement: "outside", order: 1 });
    expect(items["disk-analyzer"]).toEqual({ enabled: true, placement: "inside", order: 5 });
    expect(items["token-usage"]).toEqual({ enabled: true, placement: "outside", order: 6 });
    expect(items.canvas).toEqual({ enabled: true, placement: "outside", order: 7 });
    expect(items["pt-design"]).toEqual({ enabled: true, placement: "outside", order: 8 });
    expect(items.tasks).toEqual({ enabled: true, placement: "outside", order: 9 });
    expect(items["new-workspace"]).toEqual({ enabled: true, placement: "outside", order: 10 });
    expect(items.terminals).toEqual({ enabled: false, placement: "inside", order: 2 });
    expect(items.agents).toEqual({ enabled: false, placement: "inside", order: 3 });
    expect(items.automations).toEqual({ enabled: true, placement: "outside", order: 4 });
  });

  it("selects only enabled items for a placement", () => {
    const items: LaunchpadItems = {
      ...createDefaultLaunchpadItems(),
      workspaces: { enabled: true, placement: "outside", order: 0 },
      skills: { enabled: false, placement: "inside", order: 1 },
      canvas: { enabled: true, placement: "outside", order: 7 },
      terminals: { enabled: true, placement: "inside", order: 2 },
      "token-usage": { enabled: false, placement: "outside", order: 6 },
    };

    expect(selectLaunchpadItemsByPlacement(items, "outside")).toEqual([
      "workspaces",
      "automations",
      "canvas",
      "pt-design",
      "tasks",
      "new-workspace",
    ]);
    expect(selectLaunchpadItemsByPlacement(items, "inside")).toEqual([
      "terminals",
      "disk-analyzer",
    ]);
  });

  it("uses defaults when launchpad_items is absent", () => {
    const items = readLaunchpadItems({});
    expect(items.terminals).toEqual({ enabled: false, placement: "inside", order: 2 });
    expect(items.agents).toEqual({ enabled: false, placement: "inside", order: 3 });
    expect(items.automations).toEqual({ enabled: true, placement: "outside", order: 4 });
    expect(items.workspaces).toEqual({ enabled: true, placement: "inside", order: 0 });
  });

  it("merges persisted launchpad_items over defaults", () => {
    const items = readLaunchpadItems({
      launchpad_items: {
        terminals: { enabled: false, placement: "outside" },
        agents: { enabled: true, placement: "outside" },
        workspaces: { enabled: false, placement: "inside" },
      },
    });
    expect(items.terminals).toEqual({ enabled: false, placement: "outside", order: 2 });
    expect(items.agents).toEqual({ enabled: true, placement: "outside", order: 3 });
    expect(items.automations).toEqual({ enabled: true, placement: "outside", order: 4 });
    expect(items.workspaces).toEqual({ enabled: false, placement: "inside", order: 0 });
  });

  it("sorts enabled items by persisted order", () => {
    const items: LaunchpadItems = {
      ...createDefaultLaunchpadItems(),
      skills: { enabled: true, placement: "outside", order: 20 },
      automations: { enabled: true, placement: "outside", order: 1 },
    };
    expect(selectLaunchpadItemsByPlacement(items, "outside")[0]).toBe("automations");
  });

  it("reorders within a list and can move onto the other placement", () => {
    const items = createDefaultLaunchpadItems();
    const swapped = applyLaunchpadReorder(items, "automations", "skills");
    expect(swapped).not.toBeNull();
    expect(selectLaunchpadItemsByPlacement(swapped!, "outside")[0]).toBe("automations");

    const moved = applyLaunchpadReorder(items, "skills", "workspaces");
    expect(moved?.skills).toEqual({ enabled: true, placement: "inside", order: 0 });
    expect(selectLaunchpadItemsByPlacement(moved!, "inside")[0]).toBe("skills");

    const toOutsideTray = applyLaunchpadReorder(items, "workspaces", LAUNCHPAD_DROP_OUTSIDE);
    expect(toOutsideTray?.workspaces.placement).toBe("outside");
    expect(selectLaunchpadItemsByPlacement(toOutsideTray!, "outside").at(-1)).toBe(
      "workspaces",
    );

    expect(applyLaunchpadReorder(items, "skills", LAUNCHPAD_DROP_OUTSIDE)).toBeNull();

    const movedOntoLater = applyLaunchpadReorder(items, "skills", "token-usage");
    expect(selectLaunchpadItemsByPlacement(movedOntoLater!, "outside").slice(0, 3)).toEqual([
      "automations",
      "token-usage",
      "skills",
    ]);
  });

  it("maps the drag overlay to the hovered launchpad zone or item placement", () => {
    const items = createDefaultLaunchpadItems();
    expect(launchpadPreviewPlacement(null, items, "outside")).toBe("outside");
    expect(launchpadPreviewPlacement(LAUNCHPAD_DROP_INSIDE, items, "outside")).toBe("inside");
    expect(launchpadPreviewPlacement(LAUNCHPAD_DROP_OUTSIDE, items, "inside")).toBe("outside");
    expect(launchpadPreviewPlacement("workspaces", items, "outside")).toBe("inside");
    expect(launchpadPreviewPlacement("skills", items, "inside")).toBe("outside");
    expect(launchpadPreviewPlacement("not-an-item", items, "inside")).toBe("inside");
  });
});
