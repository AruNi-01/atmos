import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("task board settings isolation", () => {
  test("Tasks grouping persists to workspace_kanban_view, not workspace_sidebar", () => {
    const source = readFileSync(
      join(import.meta.dir, "../TaskManagementView.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'update("workspace_kanban_view", "grouping_mode"',
    );
    expect(source).toContain("parseWorkspaceKanbanGroupingMode");
    expect(source).not.toMatch(/update\(\s*["']workspace_sidebar["']/);
    expect(source).not.toContain(
      "left-sidebar grouping stays aligned",
    );
  });
});
