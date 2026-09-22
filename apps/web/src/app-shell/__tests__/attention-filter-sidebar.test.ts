import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("attention filter sidebar", () => {
  it("expands only projects that still have latched workspaces", () => {
    const source = read("../LeftSidebar.tsx");
    expect(source).toContain("const listExpandedProjectIds = React.useMemo");
    expect(source).toContain("expandedProjectIds={listExpandedProjectIds}");
    expect(source).not.toContain("expandedProjectIds={expandedProjects}");
    expect(source).toContain(
      "return listProjects\n            .filter((project) => project.workspaces.length > 0)",
    );
  });

  it("does not show an empty workspace placeholder in the attention list", () => {
    const projectItem = read("../sidebar/ProjectItem.tsx");
    expect(projectItem).toContain(
      "project.workspaces.length === 0 && !attentionFilterMode",
    );

    const twoColumn = read("../left-sidebar-controls.tsx");
    expect(twoColumn).toContain(
      "selectedProjectUnpinnedWorkspaces.length === 0 && !attentionFilterMode",
    );
  });
});
