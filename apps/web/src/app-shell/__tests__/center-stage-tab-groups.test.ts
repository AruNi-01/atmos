import { describe, expect, test } from "bun:test";
import {
  collectAgentChatGroupTabs,
  collectDiffGroupTabs,
  filterGroupedTabItemsByAllowedIds,
} from "@/app-shell/center-stage-tab-groups";
import { EDITOR_DIFF_GROUP_PREFIX } from "@/features/diff/lib/diff-editor-paths";
import type { OpenFile } from "@/features/editor/store/editor-store-types";
import type { TabGroupItem } from "@/app-shell/center-stage-tabs";

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
      { gitHistory: { visible: true, label: "Graph History" } },
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
      gitHistory: { visible: true, label: "Graph History" },
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
      { gitHistory: { visible: false, label: "Graph History" } },
    );
    expect(tabs.map((tab) => tab.kind)).toEqual(["diff-group"]);
  });
});

describe("collectAgentChatGroupTabs", () => {
  test("orders chat tabs by openedAt and keeps draft/provider fields", () => {
    const tabs = collectAgentChatGroupTabs([
      {
        id: "agent-chat:later",
        value: "agent-chat:later",
        title: "Later",
        chatId: "later",
        providerId: "claude",
        openedAt: 20,
      },
      {
        id: "agent-chat:draft:1",
        value: "agent-chat:draft:1",
        title: "Chat",
        chatId: null,
        providerId: null,
        openedAt: 10,
      },
    ]);

    expect(tabs.map((tab) => tab.id)).toEqual([
      "agent-chat:draft:1",
      "agent-chat:later",
    ]);
    expect(tabs[0]).toMatchObject({
      kind: "agent-chat",
      label: "Chat",
      value: "agent-chat:draft:1",
      chatId: null,
      providerId: null,
    });
    expect(tabs[1]).toMatchObject({
      kind: "agent-chat",
      label: "Later",
      chatId: "later",
      providerId: "claude",
    });
  });

  test("omits an empty chat group", () => {
    expect(collectAgentChatGroupTabs([])).toEqual([]);
  });
});

describe("filterGroupedTabItemsByAllowedIds", () => {
  const groups = [
    {
      key: "terminal",
      label: "终端",
      tabs: [
        { id: "terminal", label: "Intro", value: "terminal", kind: "terminal" as const },
        { id: "2", label: "2", value: "2", kind: "terminal" as const },
      ] satisfies TabGroupItem[],
    },
    {
      key: "github",
      label: "GitHub",
      tabs: [
        { id: "github", label: "GitHub", value: "github", kind: "github" as const },
        { id: "issue-164", label: "议题 #164", value: "issue-164", kind: "github-issue" as const },
      ] satisfies TabGroupItem[],
    },
  ];

  test("keeps only the tabs owned by one pane", () => {
    const filtered = filterGroupedTabItemsByAllowedIds(groups, new Set(["2"]));
    expect(filtered).toEqual([
      {
        key: "terminal",
        label: "终端",
        tabs: [{ id: "2", label: "2", value: "2", kind: "terminal" }],
      },
    ]);
  });

  test("drops empty groups and returns nothing for an empty pane", () => {
    expect(filterGroupedTabItemsByAllowedIds(groups, new Set())).toEqual([]);
  });

  test("leaves all groups in place when no allow-list is set", () => {
    const filtered = filterGroupedTabItemsByAllowedIds(groups, null);
    expect(filtered.map((group) => group.tabs.map((tab) => tab.value))).toEqual([
      ["terminal", "2"],
      ["github", "issue-164"],
    ]);
  });
});
