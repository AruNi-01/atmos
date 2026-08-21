import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("left sidebar workspace create jobs", () => {
  test("shallow-compares derived opening workspace ids so React 19 does not loop", () => {
    const source = readFileSync(join(import.meta.dir, "../LeftSidebar.tsx"), "utf8");
    expect(source).toContain("useShallow((s) =>");
    expect(source).toContain("s.jobs.map((job) => job.workspaceId)");
    expect(source).not.toMatch(
      /const openingWorkspaceIds = useWorkspaceCreationStore\(\s*\(s\) =>\s*s\.jobs\.map/,
    );
  });
});
