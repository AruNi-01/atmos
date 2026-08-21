// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import {
  workspaceCenterFramePropsAreEqual,
  type WorkspaceCenterFrameProps,
} from "@/app-shell/workspace-center-frame-equality";
import type { MountPlan } from "@/app-shell/workspace-surface-policies";

const emptyPlan: MountPlan = { mounted: [] };

function baseWarm(overrides: Partial<WorkspaceCenterFrameProps> = {}): WorkspaceCenterFrameProps {
  return {
    contextId: "ws-warm",
    isActiveContext: false,
    isUrlSyncedActive: false,
    mountPlanKeys: "terminal:ws-warm:terminal",
    mountedTabIds: ["terminal"],
    fallbackTerminalTitle: "Term",
    mountPlan: emptyPlan,
    activeValue: null,
    visibleTerminalTabs: undefined,
    openFiles: undefined,
    githubTabs: undefined,
    browserTabs: undefined,
    currentView: undefined,
    currentProject: undefined,
    currentWorkspace: undefined,
    currentBranch: undefined,
    currentRepoPath: undefined,
    reviewTarget: undefined,
    projectWikiTabVisible: false,
    codeReviewTabVisible: false,
    simulatorTabVisible: false,
    gitHistoryTabVisible: false,
    changesTabVisible: false,
    reviewTabVisible: false,
    runTabVisible: false,
    githubHubTabVisible: false,
    filesTabVisible: false,
    ptDesignTabVisible: false,
    terminalQuickOpenAgents: undefined,
    terminalGridRef: undefined,
    terminalGridRefs: undefined,
    projectWikiTerminalGridRef: undefined,
    codeReviewTerminalGridRef: undefined,
    handleCreateTerminalCenterTab: undefined,
    handleTerminalPaneClosed: undefined,
    handleCloseGithubTab: undefined,
    onGithubPullRequestChanged: undefined,
    ...overrides,
  };
}

describe("workspaceCenterFramePropsAreEqual", () => {
  it("skips warm frames when only URL-synced host chrome changes", () => {
    const prev = baseWarm();
    const next = baseWarm({
      // Host re-render after hop: active frame got new openFiles; warm sibling props
      // still receive undefined/null from host but parent recreated wrapper objects.
      openFiles: [] as never,
      activeValue: "a.ts",
      visibleTerminalTabs: [{ id: "terminal", title: "Term", closable: true }],
      handleCreateTerminalCenterTab: () => {},
    });
    expect(workspaceCenterFramePropsAreEqual(prev, next)).toBe(true);
  });

  it("re-renders when paint identity flips", () => {
    const prev = baseWarm({ isActiveContext: false });
    const next = baseWarm({ isActiveContext: true });
    expect(workspaceCenterFramePropsAreEqual(prev, next)).toBe(false);
  });

  it("treats hop-frame retained tab ids as paint identity, not ignored host chrome", () => {
    const hop = baseWarm({
      isActiveContext: true,
      isUrlSyncedActive: false,
      activeTabIds: null,
    });
    expect(
      workspaceCenterFramePropsAreEqual(hop, {
        ...hop,
        openFiles: [] as never,
        activeValue: "other.ts",
      }),
    ).toBe(true);
    expect(
      workspaceCenterFramePropsAreEqual(hop, {
        ...hop,
        activeTabIds: ["terminal", "overview"],
      }),
    ).toBe(false);
  });

  it("re-renders when this frame becomes URL-synced", () => {
    const prev = baseWarm({ isUrlSyncedActive: false, isActiveContext: true });
    const next = baseWarm({
      isUrlSyncedActive: true,
      isActiveContext: true,
      activeValue: "terminal",
    });
    expect(workspaceCenterFramePropsAreEqual(prev, next)).toBe(false);
  });

  it("re-renders when mount plan keys for this context change", () => {
    const prev = baseWarm({ mountPlanKeys: "terminal:ws-warm:terminal" });
    const next = baseWarm({
      mountPlanKeys: "terminal:ws-warm:terminal\0editor:ws-warm:a.ts",
    });
    expect(workspaceCenterFramePropsAreEqual(prev, next)).toBe(false);
  });

  it("compares live props when URL-synced active", () => {
    const handler = () => {};
    const prev = baseWarm({
      isActiveContext: true,
      isUrlSyncedActive: true,
      activeValue: "terminal",
      handleCreateTerminalCenterTab: handler,
    });
    const same = baseWarm({
      isActiveContext: true,
      isUrlSyncedActive: true,
      activeValue: "terminal",
      handleCreateTerminalCenterTab: handler,
    });
    const different = baseWarm({
      isActiveContext: true,
      isUrlSyncedActive: true,
      activeValue: "overview",
      handleCreateTerminalCenterTab: handler,
    });
    expect(workspaceCenterFramePropsAreEqual(prev, same)).toBe(true);
    expect(workspaceCenterFramePropsAreEqual(prev, different)).toBe(false);
  });
});
