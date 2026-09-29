// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import type { FileTreeNode } from "@atmos/api-types/ws/dto/fs";
import {
  applyComposerPick,
  filterMentionFiles,
  filterSlashCommands,
  flattenMentionFiles,
  mergeSlashCommands,
  normalizeSlashCommands,
  readComposerTrigger,
} from "./composer-suggestions";

describe("readComposerTrigger", () => {
  test("reads a slash query at the end of the draft", () => {
    expect(readComposerTrigger("please /fo")).toEqual({ kind: "slash", query: "fo", offset: 7 });
  });

  test("reads an at query and ignores a finished slash token", () => {
    expect(readComposerTrigger("/fork @src/ap")).toEqual({ kind: "mention", query: "src/ap", offset: 6 });
  });

  test("ignores a trigger that already has a space", () => {
    expect(readComposerTrigger("/fork ")).toBeNull();
  });
});

describe("applyComposerPick", () => {
  test("replaces the slash query with the command", () => {
    const trigger = readComposerTrigger("run /fo");
    expect(trigger && applyComposerPick("run /fo", trigger, "/fork ")).toBe("run /fork ");
  });
});

describe("slash and mention filters", () => {
  test("normalizes names and lets the session command replace the catalog", () => {
    const merged = mergeSlashCommands(
      normalizeSlashCommands([{ name: "/fork", description: "Catalog" }]),
      normalizeSlashCommands([{ name: "fork", description: "Session" }]),
    );
    expect(merged).toEqual([{ name: "fork", description: "Session", hint: null }]);
    expect(filterSlashCommands(merged, "for").map((command) => command.name)).toEqual(["fork"]);
  });

  test("flattens the project tree and filters by path", () => {
    const tree: FileTreeNode[] = [{
      name: "src",
      path: "/repo/src",
      is_dir: true,
      is_symlink: false,
      is_ignored: false,
      children: [{
        name: "main.ts",
        path: "/repo/src/main.ts",
        is_dir: false,
        is_symlink: false,
        is_ignored: false,
      }],
    }];
    const files = flattenMentionFiles(tree, "/repo");
    expect(files.map((file) => file.path)).toEqual(["src", "src/main.ts"]);
    expect(filterMentionFiles(files, "main").map((file) => file.path)).toEqual(["src/main.ts"]);
  });
});
