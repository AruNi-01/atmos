import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("left sidebar sticky group headers", () => {
  it("defines an opaque sticky class so titles cover scrolling workspace rows", () => {
    const constants = read("../sidebar-layout-constants.ts");
    expect(constants).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(constants).toContain("sticky top-0 z-10 bg-sidebar");
  });

  it("sticks agent/status/label group titles in the one-column list", () => {
    const source = read("../left-sidebar-controls.tsx");
    expect(source).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(source).toContain("data-sidebar-sticky-group-header");
    expect(source).toContain("transform.x !== 0 || transform.y !== 0");
  });

  it("sticks user-group titles in the one-column list", () => {
    const source = read("../sidebar/UserGroupSidebarContent.tsx");
    expect(source).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(source).toContain("data-sidebar-sticky-group-header");
  });

  it("sticks project titles in the one-column project list, not nested By Group rows", () => {
    const projectItem = read("../sidebar/ProjectItem.tsx");
    const sortable = read("../sidebar/SortableProject.tsx");
    expect(projectItem).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(sortable).toContain("stickyHeader={!props.hideWorkspaceList}");
  });
});
