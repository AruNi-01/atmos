import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("SidebarEmptyState", () => {
  it("uses compact Spectrum EmptyState with one CTA", () => {
    const source = read("../SidebarEmptyState.tsx");
    expect(source).toContain('density = "compact"');
    expect(source).toContain('medallionSize = "sm"');
    expect(source).toContain('backdrop = "stack"');
    expect(source).toContain("EmptyAction");
    expect(source).toContain('size="sm"');
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("h-full min-h-full");
    expect(source).toContain("items-center justify-center");
    expect(source).not.toContain("description=");
  });

  it("covers empty workspace and empty project scenes", () => {
    const source = read("../SidebarEmptyState.tsx");
    expect(source).toContain("SidebarEmptyWorkspaces");
    expect(source).toContain("SidebarEmptyProjects");
    expect(source).toContain("emptyWorkspaces.cta");
    expect(source).toContain("emptyProjects.cta");
    expect(source).toContain("<IconFolder");
    expect(source).toContain("<IconCategory");
    expect(source).toContain("<IconPlus");
  });
});

describe("left sidebar empty wiring", () => {
  it("replaces italic no-workspace copy with compact EmptyState", () => {
    const projectItem = read("../../../app-shell/sidebar/ProjectItem.tsx");
    const controls = read("../../../app-shell/left-sidebar-controls.tsx");
    expect(projectItem).toContain("SidebarEmptyWorkspaces");
    expect(projectItem).not.toContain("italic");
    expect(controls).toContain("SidebarEmptyWorkspaces");
    expect(controls).toContain("SidebarEmptyProjects");
    expect(controls).not.toContain("noWorkspaces");
  });

  it("offers add-project on an empty project list", () => {
    const sidebar = read("../../../app-shell/LeftSidebar.tsx");
    const controls = read("../../../app-shell/left-sidebar-controls.tsx");
    expect(sidebar).toContain("onAddProject={handleAddProject}");
    expect(sidebar).toContain("hasNoProjects={listProjects.length === 0}");
    expect(controls).toContain("showEmptyProjects");
    expect(controls).toContain("showPaneEmpty");
    expect(controls).toContain("flex items-center justify-center");
  });
});
