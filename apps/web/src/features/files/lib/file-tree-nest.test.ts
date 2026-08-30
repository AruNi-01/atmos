import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    expect(branch).toContain("AnimatePresence");
    expect(branch).toContain("useReducedMotion");
    expect(branch).toContain('height: "auto"');
  });
});
