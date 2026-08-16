import { describe, expect, test } from "bun:test";
import { collectDiffGroupTabs } from "@/app-shell/center-stage-tab-groups";
import { EDITOR_DIFF_GROUP_PREFIX } from "@/features/diff/lib/diff-editor-paths";
import type { OpenFile } from "@/features/editor/store/editor-store-types";

function file(path: string, lastOpenedAt: number): OpenFile {
  return {
    path,
    name: path.split("/").pop() ?? path,
    content: "",
    originalContent: "",
    language: "text",
    isSymlink: false,
    isDirty: false,
    isLoading: false,
    isPreview: false,
    lastOpenedAt,
    lastFocusedAt: lastOpenedAt,
  };
}

describe("collectDiffGroupTabs", () => {
  test("places Graph History in the diff group ahead of file diffs", () => {
    const tabs = collectDiffGroupTabs(
      [
        file("src/a.ts", 2),
        file(`${EDITOR_DIFF_GROUP_PREFIX}unstaged`, 3),
        file(`${EDITOR_DIFF_GROUP_PREFIX}staged`, 1),
      ],
      { visible: true, label: "Graph History" },
    );

    expect(tabs.map((tab) => tab.id)).toEqual([
      "git-history",
      `${EDITOR_DIFF_GROUP_PREFIX}staged`,
      `${EDITOR_DIFF_GROUP_PREFIX}unstaged`,
    ]);
    expect(tabs[0]).toMatchObject({
      kind: "git-history",
      value: "git-history",
      label: "Graph History",
    });
  });

  test("still opens a diff group when only Graph History is visible", () => {
    const tabs = collectDiffGroupTabs([file("src/a.ts", 1)], {
      visible: true,
      label: "Graph History",
    });
    expect(tabs).toEqual([
      {
        id: "git-history",
        label: "Graph History",
        value: "git-history",
        kind: "git-history",
      },
    ]);
  });

  test("omits Graph History when the tab is closed", () => {
    const tabs = collectDiffGroupTabs(
      [file(`${EDITOR_DIFF_GROUP_PREFIX}branch`, 1)],
      { visible: false, label: "Graph History" },
    );
    expect(tabs.map((tab) => tab.kind)).toEqual(["diff-group"]);
  });
});
