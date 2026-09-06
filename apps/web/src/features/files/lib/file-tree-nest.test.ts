import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isFileTreeBranchOpen } from "./file-tree-branch-open";
import { nestTreeItemsByParent } from "./file-tree-nest";

describe("nestTreeItemsByParent", () => {
  test("nests visible rows under their parent for folder expand animation", () => {
    const nested = nestTreeItemsByParent(
      [
        { id: "src", parentId: "root" },
        { id: "src/lib", parentId: "src" },
        { id: "src/app.ts", parentId: "src" },
        { id: "README.md", parentId: "root" },
      ],
      (item) => item.id,
      (item) => item.parentId,
    );

    expect(nested.map((node) => node.item.id)).toEqual(["src", "README.md"]);
    expect(nested[0]?.children.map((node) => node.item.id)).toEqual([
      "src/lib",
      "src/app.ts",
    ]);
    expect(nested[1]?.children).toEqual([]);
  });
});

describe("isFileTreeBranchOpen", () => {
  test("stays closed while expanded but lazy children have not arrived yet", () => {
    // First click: isExpanded flips true before listDir/cache fills rows.
    expect(isFileTreeBranchOpen(true, 0)).toBe(false);
    expect(isFileTreeBranchOpen(false, 0)).toBe(false);
    expect(isFileTreeBranchOpen(false, 3)).toBe(false);
  });

  test("opens only after children exist so enter animation has content to measure", () => {
    expect(isFileTreeBranchOpen(true, 1)).toBe(true);
    expect(isFileTreeBranchOpen(true, 12)).toBe(true);
  });
});

describe("file tree expand animation wiring", () => {
  test("expands and collapses folder children as one motion group", () => {
    const tree = readFileSync(
      join(import.meta.dir, "../components/FileTree.tsx"),
      "utf8",
    );
    const branch = readFileSync(
      join(import.meta.dir, "../components/FileTreeBranch.tsx"),
      "utf8",
    );
    expect(tree).toContain("FileTreeBranch");
    expect(tree).toContain("nestTreeItemsByParent");
    expect(tree).toContain("isFileTreeBranchOpen");
    expect(branch).toContain("gridTemplateRows");
    expect(branch).toContain("requestAnimationFrame");
    expect(branch).toContain("useReducedMotion");
    expect(branch).toContain("0fr");
    expect(branch).toContain("1fr");
    // First lazy expand: mount content closed, then open so enter runs.
    expect(branch).toContain("setRenderChildren(true)");
    expect(branch).toContain("setVisualOpen(true)");
  });
});
