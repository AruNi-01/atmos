import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relativePath: string) {
  return readFileSync(join(import.meta.dir, relativePath), "utf8");
}

describe("project agent status rollup", () => {
  it("only folds child marks into a one-column collapsed project", () => {
    const source = read("../sidebar/ProjectItem.tsx");
    expect(source).toContain("rollupChildren={rollupChildren}");
    expect(source).toContain(
      "const rollupChildren =\n    !hideWorkspaceList && !isExpanded && project.workspaces.length > 0;",
    );
    expect(source).not.toContain("rollupAttention");
  });

  it("does not copy a workspace bell onto grouped project chips", () => {
    const source = read("../sidebar/GroupedProjectRow.tsx");
    expect(source).toContain("<ProjectAgentStatusMark");
    expect(source).not.toContain("rollupChildren");
    expect(source).not.toContain("rollupAttention");
  });
});
