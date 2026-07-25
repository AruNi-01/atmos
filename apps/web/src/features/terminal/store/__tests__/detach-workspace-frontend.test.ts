// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { beforeEach, describe, expect, it } from "bun:test";
import {
  detachTerminalWorkspaceFrontendState,
  evictTerminalWorkspaceRuntimeState,
  getTerminalWorkspaceScopeKey,
} from "../terminal-store-helpers";
import {
  FIXED_TERMINAL_TAB_VALUE,
  useTerminalStore,
} from "../use-terminal-store";

const initialState = useTerminalStore.getInitialState();

function seedWorkspace(workspaceId: string) {
  const scope = getTerminalWorkspaceScopeKey(workspaceId, false);
  useTerminalStore.setState({
    workspaceTerminalTabs: {
      [workspaceId]: [
        { id: FIXED_TERMINAL_TAB_VALUE, title: "Term", closable: true },
        { id: "terminal-tab:extra", title: "Extra", closable: true },
      ],
    },
    workspaceActiveTerminalTabIds: {
      [workspaceId]: FIXED_TERMINAL_TAB_VALUE,
    },
    workspacePanes: {
      [workspaceId]: {
        pane1: {
          id: "pane1",
          workspaceId,
          tmuxWindowName: "1",
        } as never,
      },
    },
    workspaceLayouts: {
      [workspaceId]: "pane1",
    },
    workspaceMaximizedIds: {
      [workspaceId]: null,
    },
    workspaceContexts: {
      [workspaceId]: false,
    },
    loadedWorkspaces: new Set([scope]),
    hydratedTerminalScopes: new Set([workspaceId, `${workspaceId}::terminal-tab:extra`]),
    initializingWorkspaces: new Set(),
    initializingTerminalScopes: new Set(),
    tmuxWindowsCache: {
      [scope]: [],
    },
    persistedTerminalLayouts: {
      [scope]: {
        schemaVersion: 1,
        tabs: [],
      } as never,
    },
    projectWikiPanes: { [workspaceId]: {} },
    projectWikiLayouts: { [workspaceId]: null },
    projectWikiMaximizedIds: { [workspaceId]: null },
    projectWikiLoadedWorkspaces: new Set([workspaceId]),
    projectWikiInitializingWorkspaces: new Set(),
    codeReviewPanes: { [workspaceId]: {} },
    codeReviewLayouts: { [workspaceId]: null },
    codeReviewMaximizedIds: { [workspaceId]: null },
    codeReviewLoadedWorkspaces: new Set([workspaceId]),
    codeReviewInitializingWorkspaces: new Set(),
    saveTimeouts: {},
  });
}

describe("detachWorkspaceFrontend vs evictWorkspaceRuntime", () => {
  beforeEach(() => {
    useTerminalStore.setState(initialState, true);
  });

  it("detach keeps tab/layout identity and clears hydration only", () => {
    const workspaceId = "ws-a";
    seedWorkspace(workspaceId);
    const before = useTerminalStore.getState();

    useTerminalStore.getState().detachWorkspaceFrontend(workspaceId);
    const after = useTerminalStore.getState();

    expect(after.workspaceTerminalTabs[workspaceId]).toEqual(
      before.workspaceTerminalTabs[workspaceId],
    );
    expect(after.workspaceActiveTerminalTabIds[workspaceId]).toBe(
      FIXED_TERMINAL_TAB_VALUE,
    );
    expect(after.workspacePanes[workspaceId]).toEqual(before.workspacePanes[workspaceId]);
    expect(after.workspaceLayouts[workspaceId]).toEqual(before.workspaceLayouts[workspaceId]);
    expect(
      after.persistedTerminalLayouts[getTerminalWorkspaceScopeKey(workspaceId, false)],
    ).toBeTruthy();
    expect(after.hydratedTerminalScopes.has(workspaceId)).toBe(false);
    expect(after.loadedWorkspaces.has(getTerminalWorkspaceScopeKey(workspaceId, false))).toBe(
      false,
    );
    expect(after.projectWikiLoadedWorkspaces.has(workspaceId)).toBe(false);
  });

  it("full evict wipes tab identity (must not be used for freeze)", () => {
    const workspaceId = "ws-b";
    seedWorkspace(workspaceId);

    useTerminalStore.getState().evictWorkspaceRuntime(workspaceId);
    const after = useTerminalStore.getState();

    expect(after.workspaceTerminalTabs[workspaceId]).toBeUndefined();
    expect(after.workspaceActiveTerminalTabIds[workspaceId]).toBeUndefined();
    expect(after.workspacePanes[workspaceId]).toBeUndefined();
    expect(
      after.persistedTerminalLayouts[getTerminalWorkspaceScopeKey(workspaceId, false)],
    ).toBeUndefined();
  });

  it("pure helpers differ: detach vs evict", () => {
    const workspaceId = "ws-c";
    seedWorkspace(workspaceId);
    const state = useTerminalStore.getState();

    const detached = detachTerminalWorkspaceFrontendState(state as never, workspaceId);
    const evicted = evictTerminalWorkspaceRuntimeState(state as never, workspaceId);

    expect(evicted.workspaceTerminalTabs[workspaceId]).toBeUndefined();
    expect(state.workspaceTerminalTabs[workspaceId]).toBeDefined();
    // detach helper does not return tabs — original state still has them
    expect(detached.hydratedTerminalScopes.has(workspaceId)).toBe(false);
    expect(state.workspaceTerminalTabs[workspaceId]?.length).toBe(2);
  });
});
