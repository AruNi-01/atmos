import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("left sidebar workspace create jobs", () => {
  test("sidebar grouping and filters stay on workspace_sidebar, not the tasks board", () => {
    const source = readFileSync(join(import.meta.dir, "../LeftSidebar.tsx"), "utf8");
    expect(source).toContain("settings.workspace_sidebar?.grouping_mode");
    expect(source).toContain("parseWorkspaceSidebarFilters(settings)");
    expect(source).not.toContain("parseWorkspaceKanbanGroupingMode");
    expect(source).not.toMatch(
      /update\(\s*["']workspace_kanban_view["']\s*,\s*["']grouping_mode["']/,
    );
  });

  test("sidebar view is written on choice and a cancelled settings read is retried", () => {
    const source = readFileSync(join(import.meta.dir, "../LeftSidebar.tsx"), "utf8");
    expect(source).toContain("persistWorkspaceSidebarSetting('view', next)");
    expect(source).toContain("onListViewChange={handleSidebarListViewChange}");
    expect(source).toContain("sidebarListViewToApply(");
    expect(source).not.toMatch(/if \(isCancelledError\(error\)\) return;/);
  });

  test("shallow-compares derived opening workspace ids so React 19 does not loop", () => {
    const source = readFileSync(join(import.meta.dir, "../LeftSidebar.tsx"), "utf8");
    expect(source).toContain("useShallow((s) =>");
    expect(source).toContain("s.jobs.map((job) => job.workspaceId)");
    expect(source).not.toMatch(
      /const openingWorkspaceIds = useWorkspaceCreationStore\(\s*\(s\) =>\s*s\.jobs\.map/,
    );
  });
});
