import { describe, expect, it } from "bun:test";

import { parseWorkspaceKanbanGroupingMode } from "@/app-shell/workspace-view-settings";

describe("parseWorkspaceKanbanGroupingMode", () => {
  it("ignores sidebar grouping_mode", () => {
    expect(
      parseWorkspaceKanbanGroupingMode({
        workspace_sidebar: { grouping_mode: "priority" },
      }),
    ).toBeNull();
  });

  it("reads the tasks board grouping_mode sibling", () => {
    expect(
      parseWorkspaceKanbanGroupingMode({
        workspace_kanban_view: { grouping_mode: "label" },
        workspace_sidebar: { grouping_mode: "priority" },
      }),
    ).toBe("label");
  });

  it("falls back to grouping_mode nested in kanban state", () => {
    expect(
      parseWorkspaceKanbanGroupingMode({
        workspace_kanban_view: { state: { grouping_mode: "agent" } },
        workspace_sidebar: { grouping_mode: "time" },
      }),
    ).toBe("agent");
  });
});
