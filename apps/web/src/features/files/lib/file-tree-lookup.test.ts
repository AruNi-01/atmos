import { describe, expect, test } from "bun:test";
import type { FileTreeNode } from "@/api/ws-api";
import { lookupPathInFileTrees } from "./file-tree-lookup";

function node(
  path: string,
  isDir: boolean,
  children?: FileTreeNode[],
): FileTreeNode {
  return {
    name: path.split("/").pop() || path,
    path,
    is_dir: isDir,
    is_symlink: false,
    is_ignored: false,
    children,
  };
}

const project = "/Users/me/project";
const trees = [
  {
    rootPath: project,
    tree: [
      node(`${project}/src`, true, [
        node(`${project}/src/app.ts`, false),
      ]),
      node(`${project}/package.json`, false),
    ],
  },
];

describe("lookupPathInFileTrees", () => {
  test("finds files and directories from a cached project tree", () => {
    expect(lookupPathInFileTrees(`${project}/src/app.ts`, trees)).toBe("file");
    expect(lookupPathInFileTrees(`${project}/src`, trees)).toBe("directory");
    expect(lookupPathInFileTrees(project, trees)).toBe("directory");
    expect(lookupPathInFileTrees(`${project}/package.json`, trees)).toBe("file");
  });

  test("treats names missing from a loaded tree as absent without fetching", () => {
    expect(lookupPathInFileTrees(`${project}/signals.json`, trees)).toBe("absent");
    expect(lookupPathInFileTrees(`${project}/chat_history.jsonl`, trees)).toBe("absent");
  });

  test("returns null when no cached tree covers the path", () => {
    expect(lookupPathInFileTrees("/Users/me/other/src/app.ts", trees)).toBeNull();
    expect(lookupPathInFileTrees(`${project}/src/app.ts`, [])).toBeNull();
  });
});
