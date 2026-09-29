import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSidebarListView } from "@/app-shell/sidebar/sidebar-list-view";

describe("left sidebar settings isolation", () => {
  test("sidebar filters parse only workspace_sidebar, never workspace_kanban_view", () => {
    const source = readFileSync(join(import.meta.dir, "left-sidebar-settings.ts"), "utf8");
    expect(source).toContain('const raw = settings.workspace_sidebar?.filters;');
    expect(source).toContain("Left-sidebar list filters only — do not read `workspace_kanban_view`.");
    expect(source).not.toContain("const raw = workspaceKanbanViewState(settings)");
    expect(source).toContain("parseSidebarListView(settings.workspace_sidebar?.view)");
    expect(source).not.toContain("workspace_kanban_view?.view");
  });

  test("missing workspace_sidebar.view parses as workspace", () => {
    expect(parseSidebarListView(undefined)).toBe("workspace");
    expect(parseSidebarListView("session")).toBe("session");
  });
});
