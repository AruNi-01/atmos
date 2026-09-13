import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

function count(source: string, snippet: string) {
  return source.split(snippet).length - 1;
}

describe("left sidebar workspace list scroll areas", () => {
  it("fades the one-column grouped list in the same viewport as sticky titles", () => {
    const source = read("../left-sidebar-controls.tsx");
    expect(source).toContain("<ScrollArea scrollFade className=\"h-full\">");
    expect(source).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(source).toContain("data-sidebar-sticky-group-header");
    expect(source).not.toContain("data-sidebar-group-body-scroll");
    expect(source).not.toContain("overflow-y-auto");
    expect(source).not.toContain("scrollbar-on-hover");
    expect(count(source, "scrollFade")).toBeGreaterThanOrEqual(4);
  });

  it("keeps project titles sticky inside the faded one-column project list", () => {
    const list = read("../left-sidebar-controls.tsx");
    const projectItem = read("../sidebar/ProjectItem.tsx");
    expect(list).toContain("<ScrollArea scrollFade className=\"h-full\" viewportClassName={className}>");
    expect(projectItem).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(projectItem).not.toContain("data-sidebar-group-body-scroll");
  });

  it("fades the one-column user-group list in the same viewport as sticky titles", () => {
    const source = read("../sidebar/UserGroupSidebarContent.tsx");
    expect(source).toContain("<ScrollArea scrollFade className=\"h-full\">");
    expect(source).toContain("LEFT_SIDEBAR_STICKY_GROUP_HEADER_CLASS");
    expect(source).toContain("data-sidebar-sticky-group-header");
    expect(source).not.toContain("data-sidebar-group-body-scroll");
    expect(source).not.toContain("overflow-y-auto");
    expect(source).not.toContain("scrollbar-on-hover");
  });
});
